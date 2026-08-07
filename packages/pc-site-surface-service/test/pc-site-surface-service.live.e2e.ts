import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { PcSiteSurfaceServiceClient } from '../src/index.js';
import {
  installPcSiteSurfaceServiceWatchdog,
  pcSiteSurfaceServiceWatchdogStatus,
  probePcSiteSurfaceService,
  stopPcSiteSurfaceService,
} from '../src/main.js';

type JsonRecord = Record<string, any>;

test('live PC Site runtime shares sessions, swaps generation without carrier restart, refuses invalid authority and admission, and recovers through its watchdog', { timeout: 120_000 }, async () => {
  assert.equal(process.platform, 'win32', 'live PC Site surface-service E2E currently requires Windows');
  const { createNarsCapabilityGateway } = await import(new URL('../../nars-capability-gateway/src/capability-gateway.ts', import.meta.url).href);
  const siteRoot = resolve(process.env.NARADA_PC_SITE_ROOT ?? 'C:/Users/Andrey/Narada');
  const mcpSurfacesRoot = resolve(process.env.NARADA_MCP_SURFACES_WORKSPACE_ROOT ?? 'C:/workspace/mcp-surfaces');
  const configuredNodePath = process.env.NARADA_PC_SITE_SURFACE_SERVICE_NODE_PATH;
  const commandOptions = {
    site_root: siteRoot,
    mcp_surfaces_root: mcpSurfacesRoot,
    ...(configuredNodePath ? { node_path: resolve(configuredNodePath) } : {}),
  };
  await installPcSiteSurfaceServiceWatchdog(commandOptions);
  const initialWatchdog = await waitForWatchdogReady(commandOptions, 20_000);
  assert.equal(initialWatchdog.coherent, true);
  assert.equal(initialWatchdog.state, 'Ready');
  assert.equal(initialWatchdog.last_task_result, 0);
  assert.equal((await waitForReady(commandOptions, 20_000)).status, 'ready');
  const stateRoot = join(siteRoot, '.narada', 'runtime', 'mcp-surface-service');
  const state = JSON.parse(await readFile(join(stateRoot, 'state.json'), 'utf8')) as JsonRecord;
  const token = (await readFile(join(stateRoot, 'token'), 'utf8')).trim();
  const client = new PcSiteSurfaceServiceClient({ url: String(state.url), token });
  const previousProjection = process.env.NARADA_WORKER_MCP_CONFIG;
  process.env.NARADA_WORKER_MCP_CONFIG = JSON.stringify({
    native_mcp_mode: 'scoped',
    mcp_tool_allowlist: ['launcher_doctor'],
    include_startup_tools: false,
  });
  const status = () => authenticatedStatus(String(state.url), token);
  const gateway = (suffix: string, admit = async () => ({ admitted: true, reason: 'live_cross_session_admitted' })) => createNarsCapabilityGateway({
    siteRoot,
    carrierSessionId: `pc-site-live-${suffix}-${randomUUID()}`,
    carrierId: 'nars-live-e2e',
    agentId: `pc-site-live-${suffix}`,
    admit,
  });
  const left = gateway('left');
  const right = gateway('right');
  let rollbackActive = false;
  try {
    await Promise.all([left.start(), right.start()]);
    const initial = await Promise.all([
      left.invoke({ toolName: 'launcher_doctor', arguments: {} }),
      right.invoke({ toolName: 'launcher_doctor', arguments: {} }),
    ]);
    assert.deepEqual(initial.map((outcome: JsonRecord) => outcome.status), ['completed', 'completed']);
    const before = await status();
    assert.equal(before.runtime.instances.length, 1);
    assert.equal(before.runtime.instances[0].session_count, 2);
    const instance = before.runtime.instances[0];

    await assert.rejects(client.invoke({
      site_id: String(state.site_id),
      authority_ref: 'site:other:mcp-surfaces',
      carrier_session_id: `wrong-authority-${randomUUID()}`,
      carrier_id: 'nars-live-e2e',
      agent_id: 'wrong-authority',
      surface_id: 'launcher',
      projection_id: 'factory',
      tool_name: 'launcher_doctor',
      arguments: {},
      request_id: `wrong-authority-${randomUUID()}`,
      admission: {
        decision: 'admitted',
        decision_ref: `wrong-authority-${randomUUID()}`,
        authority_ref: 'site:other:mcp-surfaces',
        surface_id: 'launcher',
        tool_name: 'launcher_doctor',
        reason: 'live negative authority test',
      },
    }), /authority_mismatch/);

    const replacement = await client.replaceGeneration({
      site_id: String(state.site_id),
      authority_ref: String(state.authority_ref),
      surface_id: 'launcher',
      projection_id: 'factory',
      instance_id: String(instance.instance_id),
      expected_generation_id: String(instance.generation_id),
      request_id: `live-generation-swap-${randomUUID()}`,
      reason: 'approved live compatible generation replacement',
      drain_timeout_ms: 10_000,
    });
    assert.equal((replacement.outcome as JsonRecord).status, 'replaced');
    assert.equal((replacement.observability as JsonRecord).event_persisted, true);
    const afterSwap = await status();
    assert.notEqual(afterSwap.runtime.instances[0].generation_id, instance.generation_id);

    const postSwap = await Promise.all([
      left.invoke({ toolName: 'launcher_doctor', arguments: {} }),
      right.invoke({ toolName: 'launcher_doctor', arguments: {} }),
    ]);
    assert.deepEqual(postSwap.map((outcome: JsonRecord) => outcome.status), ['completed', 'completed']);
    const stale = await client.replaceGeneration({
      site_id: String(state.site_id),
      authority_ref: String(state.authority_ref),
      surface_id: 'launcher',
      projection_id: 'factory',
      instance_id: String(instance.instance_id),
      expected_generation_id: String(instance.generation_id),
      request_id: `live-stale-generation-${randomUUID()}`,
      reason: 'approved live stale-generation refusal proof',
    });
    assert.equal((stale.outcome as JsonRecord).status, 'refused');
    assert.equal(((stale.outcome as JsonRecord).assessment as JsonRecord).reason, 'expected_generation_mismatch');

    await left.close();
    assert.equal((await status()).runtime.instances[0].session_count, 1);
    await right.close();
    assert.equal((await status()).runtime.instances.length, 0);

    const refused = gateway('refused', async () => ({ admitted: false, reason: 'live_refusal_proof' }));
    try {
      assert.equal((await refused.invoke({ toolName: 'launcher_doctor', arguments: {} })).status, 'refused');
    } finally {
      await refused.close();
    }
    assert.equal((await status()).runtime.instances.length, 0);

    await bindLauncherProjection(mcpSurfacesRoot, 'stdio');
    rollbackActive = true;
    const stdio = gateway('stdio-rollback');
    try {
      const outcome = await stdio.invoke({ toolName: 'launcher_doctor', arguments: {} });
      assert.equal(outcome.status, 'completed');
      assert.equal(outcome.result.structuredContent.fabric_lifecycle.projection_id, 'stdio');
      assert.equal(outcome.result.structuredContent.fabric_lifecycle.execution.adapter, 'stdio');
    } finally {
      await stdio.close();
    }
    await bindLauncherProjection(mcpSurfacesRoot, 'factory');
    rollbackActive = false;
    const restoredFactory = gateway('factory-restored');
    try {
      const outcome = await restoredFactory.invoke({ toolName: 'launcher_doctor', arguments: {} });
      assert.equal(outcome.status, 'completed');
      assert.equal(outcome.result.structuredContent.fabric_lifecycle.projection_id, 'factory');
      assert.equal(outcome.result.structuredContent.fabric_lifecycle.execution.adapter, 'surface_factory');
    } finally {
      await restoredFactory.close();
    }
    assert.equal((await status()).runtime.instances.length, 0);

    const watchdogBefore = await pcSiteSurfaceServiceWatchdogStatus(commandOptions);
    assert.equal(watchdogBefore.coherent, true);
    await stopPcSiteSurfaceService(commandOptions);
    assert.notEqual((await probePcSiteSurfaceService(commandOptions)).status, 'ready');
    await installPcSiteSurfaceServiceWatchdog(commandOptions);
    const recovered = await waitForReady(commandOptions, 20_000);
    assert.equal(recovered.status, 'ready');
    const watchdogAfter = await waitForWatchdogReady(commandOptions, 20_000);
    assert.equal(watchdogAfter.coherent, true);
    assert.equal(watchdogAfter.state, 'Ready');
    assert.equal(watchdogAfter.last_task_result, 0);
  } finally {
    await Promise.allSettled([left.close(), right.close()]);
    if (rollbackActive) await bindLauncherProjection(mcpSurfacesRoot, 'factory');
    if (previousProjection === undefined) delete process.env.NARADA_WORKER_MCP_CONFIG;
    else process.env.NARADA_WORKER_MCP_CONFIG = previousProjection;
  }
});

async function authenticatedStatus(url: string, token: string): Promise<JsonRecord> {
  const response = await fetch(url + '/v1/status', { headers: { authorization: 'Bearer ' + token } });
  assert.equal(response.ok, true);
  return response.json() as Promise<JsonRecord>;
}

async function bindLauncherProjection(mcpSurfacesRoot: string, projectionId: 'stdio' | 'factory'): Promise<void> {
  const registrarUrl = pathToFileURL(join(mcpSurfacesRoot, 'packages', 'mcp-registrar', 'dist', 'src', 'main.js')).href;
  const previousCwd = process.cwd();
  process.chdir(mcpSurfacesRoot);
  try {
    const registrar = await import(registrarUrl) as {
      createServerState(): JsonRecord;
      handleRequest(request: JsonRecord, state: JsonRecord): Promise<JsonRecord>;
    };
    const response = await registrar.handleRequest({
      jsonrpc: '2.0',
      id: `live-bind-${projectionId}-${randomUUID()}`,
      method: 'tools/call',
      params: {
        name: 'registrar_site_bind',
        arguments: { site_id: 'andrey-user', surface_id: 'launcher', projection_id: projectionId },
      },
    }, registrar.createServerState());
    if (response.error) throw new Error(`live_launcher_projection_bind_failed:${JSON.stringify(response.error)}`);
    const result = response.result as JsonRecord;
    if (result?.isError === true) throw new Error(`live_launcher_projection_bind_failed:${JSON.stringify(result)}`);
  } finally {
    process.chdir(previousCwd);
  }
}

async function waitForReady(options: Parameters<typeof probePcSiteSurfaceService>[0], timeoutMs: number): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;
  let status: JsonRecord = { status: 'unavailable' };
  while (Date.now() < deadline) {
    status = await probePcSiteSurfaceService(options);
    if (status.status === 'ready') return status;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  return status;
}

async function waitForWatchdogReady(options: Parameters<typeof pcSiteSurfaceServiceWatchdogStatus>[0], timeoutMs: number): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;
  let status: JsonRecord = { status: 'unavailable' };
  while (Date.now() < deadline) {
    status = await pcSiteSurfaceServiceWatchdogStatus(options);
    if (status.state === 'Ready' && status.last_task_result === 0) return status;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  return status;
}
