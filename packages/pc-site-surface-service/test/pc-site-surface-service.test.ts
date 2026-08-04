import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PcSiteSurfaceServiceClient,
  createPcSiteSurfaceService,
  pcSiteSurfaceAuthorityRef,
} from '../src/index.js';
import { pcSiteSurfaceServiceWatchdogPlan } from '../src/main.js';

test('watchdog plan is a hidden bounded direct-Node ensure action', () => {
  const plan = pcSiteSurfaceServiceWatchdogPlan({
    site_root: 'C:/pc-site',
    mcp_surfaces_root: 'D:/code/mcp-surfaces',
    node_path: 'C:/node/node.exe',
    watchdog_interval_minutes: 2,
  }, 'test-site');
  assert.equal(plan.task_name, 'Narada-PC-Site-Surface-Service-test-site');
  assert.equal(plan.executable, resolveForTest('C:/node/node.exe'));
  assert.match(plan.arguments, / ensure --site-root /);
  assert.match(plan.arguments, / --mcp-surfaces-root /);
  assert.equal(plan.working_directory, resolveForTest('C:/pc-site'));
  assert.equal(plan.interval_minutes, 2);
  assert.equal(plan.hidden, true);
  assert.equal(plan.multiple_instances, 'IgnoreNew');
});

test('PC Site surface service authenticates calls and shares factory state only within authority', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-site-surface-service-'));
  const siteRoot = join(root, 'site');
  const mcpRoot = join(root, 'mcp-surfaces');
  const factoryPath = join(mcpRoot, 'fixture-factory.mjs');
  const registryPath = join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json');
  await mkdir(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
  await mkdir(mcpRoot, { recursive: true });
  await writeFile(factoryPath, factorySource(1), 'utf8');
  await writeFile(registryPath, JSON.stringify({
    site_id: 'test-site',
    surfaces: [{
      surface_id: 'test-site.counter.factory',
      surface_projection: {
        surface_id: 'counter',
        projection_id: 'factory',
        injection_scope: 'user_site',
        execution: { adapter: 'surface_factory', tenancy: 'authority_shared', replacement: 'generation_swap' },
        tool_contract_digest: 'counter-contract-v1',
        surface_descriptor: {
          tools: [{
            name: 'counter_read',
            description: 'Read and increment a test counter.',
            input_schema: { type: 'object', properties: { delay_ms: { type: 'number' } }, additionalProperties: false },
            output_schema: { type: 'object', properties: { count: { type: 'number' }, version: { type: 'number' } }, required: ['count', 'version'], additionalProperties: false },
            effect: { class: 'read', idempotency: 'replayable', confirmation: 'never' },
          }],
        },
      },
      runtime_binding: { entrypoint: factoryPath },
    }],
  }), 'utf8');

  const token = 'test-token-with-sufficient-entropy';
  const service = await createPcSiteSurfaceService({
    site_root: siteRoot,
    registry_path: registryPath,
    mcp_surfaces_root: mcpRoot,
    token,
    port: 0,
    handle_idle_ms: 75,
  });
  try {
    const unauthorized = await fetch(`${service.url}/v1/status`);
    assert.equal(unauthorized.status, 401);
    const malformedAuthorization = await fetch(`${service.url}/v1/status`, { headers: { authorization: token } });
    assert.equal(malformedAuthorization.status, 401);

    const client = new PcSiteSurfaceServiceClient({ url: service.url, token });
    const invoke = (session: string, args: Record<string, unknown> = {}) => client.invoke({
      site_id: 'test-site',
      authority_ref: pcSiteSurfaceAuthorityRef('test-site'),
      carrier_session_id: session,
      carrier_id: 'test-carrier',
      agent_id: `agent-${session}`,
      surface_id: 'counter',
      projection_id: 'factory',
      tool_name: 'counter_read',
      arguments: args,
      request_id: `request-${session}`,
      admission: {
        decision: 'admitted',
        decision_ref: `decision-${session}`,
        authority_ref: pcSiteSurfaceAuthorityRef('test-site'),
        surface_id: 'counter',
        tool_name: 'counter_read',
        reason: 'test',
      },
    });

    assert.deepEqual((await invoke('one')).result, { count: 1, version: 1 });
    assert.deepEqual((await invoke('two')).result, { count: 2, version: 1 });
    const status = await fetch(`${service.url}/v1/status`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json()) as any;
    assert.equal(status.runtime.instances.length, 1);

    await assert.rejects(client.invoke({
      ...(await invocationTemplate()),
      authority_ref: 'site:other:mcp-surfaces',
    }), /pc_site_surface_service_authority_mismatch/);

    assert.equal((await client.releaseSession('one')).released_handle_count, 1);
    const statusAfterOne = await fetch(service.url + '/v1/status', { headers: { authorization: 'Bearer ' + token } }).then((response) => response.json()) as any;
    assert.equal(statusAfterOne.runtime.instances[0].session_count, 1);
    assert.equal((await client.releaseSession('two')).released_handle_count, 1);
    const statusAfterTwo = await fetch(service.url + '/v1/status', { headers: { authorization: 'Bearer ' + token } }).then((response) => response.json()) as any;
    assert.equal(statusAfterTwo.runtime.instances.length, 0);

    const concurrent = await Promise.all([invoke('concurrent'), invoke('concurrent')]);
    assert.deepEqual(concurrent.map((outcome) => (outcome.result as any).count).sort(), [1, 2]);
    const statusAfterConcurrent = await fetch(service.url + '/v1/status', { headers: { authorization: 'Bearer ' + token } }).then((response) => response.json()) as any;
    assert.equal(statusAfterConcurrent.runtime.instances.length, 1);
    assert.equal(statusAfterConcurrent.runtime.instances[0].session_count, 1);
    assert.equal((await client.releaseSession('concurrent')).released_handle_count, 1);

    assert.deepEqual((await invoke('swap')).result, { count: 1, version: 1 });
    const drainingCall = invoke('swap', { delay_ms: 100 });
    const inflightDeadline = Date.now() + 1_000;
    let beforeSwap: any = null;
    do {
      const statusBeforeSwap = await fetch(service.url + '/v1/status', { headers: { authorization: 'Bearer ' + token } }).then((response) => response.json()) as any;
      beforeSwap = statusBeforeSwap.runtime.instances[0] ?? null;
      if (beforeSwap?.inflight === 1) break;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 10));
    } while (Date.now() < inflightDeadline);
    assert.equal(beforeSwap?.inflight, 1);
    await writeFile(factoryPath, factorySource(2), 'utf8');
    const replacementPromise = client.replaceGeneration({
      site_id: 'test-site',
      authority_ref: pcSiteSurfaceAuthorityRef('test-site'),
      surface_id: 'counter',
      projection_id: 'factory',
      instance_id: beforeSwap.instance_id,
      expected_generation_id: beforeSwap.generation_id,
      request_id: 'replacement-compatible',
      reason: 'test compatible generation replacement',
      drain_timeout_ms: 1_000,
    });
    const [oldGenerationCall, replacement] = await Promise.all([drainingCall, replacementPromise]);
    assert.deepEqual(oldGenerationCall.result, { count: 2, version: 1 });
    assert.equal((replacement.outcome as any).status, 'replaced');
    assert.equal((replacement.observability as any).event_persisted, true);
    assert.notEqual((replacement.outcome as any).candidate_generation_id, beforeSwap.generation_id);
    assert.deepEqual((await invoke('swap')).result, { count: 1, version: 2 });

    const staleReplacement = await client.replaceGeneration({
      site_id: 'test-site',
      authority_ref: pcSiteSurfaceAuthorityRef('test-site'),
      surface_id: 'counter',
      projection_id: 'factory',
      instance_id: beforeSwap.instance_id,
      expected_generation_id: beforeSwap.generation_id,
      request_id: 'replacement-stale',
      reason: 'test stale generation refusal',
    });
    assert.equal((staleReplacement.outcome as any).status, 'refused');
    assert.equal((staleReplacement.outcome as any).assessment.reason, 'expected_generation_mismatch');
    const events = (await readFile(join(siteRoot, '.narada', 'runtime', 'mcp-surface-service', 'events.jsonl'), 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.request_id), ['replacement-compatible', 'replacement-stale']);
    assert.equal((await client.releaseSession('swap')).released_handle_count, 1);

    await invoke('idle');
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 175));
    const statusAfterIdle = await fetch(service.url + '/v1/status', { headers: { authorization: 'Bearer ' + token } }).then((response) => response.json()) as any;
    assert.equal(statusAfterIdle.runtime.instances.length, 0);
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }

  async function invocationTemplate() {
    return {
      site_id: 'test-site',
      authority_ref: pcSiteSurfaceAuthorityRef('test-site'),
      carrier_session_id: 'three',
      carrier_id: 'test-carrier',
      agent_id: 'agent-three',
      surface_id: 'counter',
      projection_id: 'factory',
      tool_name: 'counter_read',
      arguments: {},
      request_id: 'request-three',
      admission: {
        decision: 'admitted' as const,
        decision_ref: 'decision-three',
        authority_ref: pcSiteSurfaceAuthorityRef('test-site'),
        surface_id: 'counter',
        tool_name: 'counter_read',
        reason: 'test',
      },
    };
  }
});

function factorySource(version: number): string {
  return `
export async function createSurfaceRuntime() {
  let count = 0;
  return {
    tool_names: ['counter_read'],
    async callTool(request) {
      const delay = Number(request.arguments?.delay_ms ?? 0);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      count += 1;
      return { count, version: ${version} };
    },
    async health() { return { status: 'healthy' }; },
    async assessReplacement() { return { compatible: true, reason: 'test' }; },
    async dispose() {},
  };
}
`;
}

function resolveForTest(path: string): string {
  return process.platform === 'win32' ? path.replace(/\//g, '\\') : join(process.cwd(), path);
}
