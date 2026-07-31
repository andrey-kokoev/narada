import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  buildCanonicalLocalTestSeed,
  CANONICAL_LOCAL_TEST_IDS,
  canonicalSha256,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  readCarrierRestartOutcome,
  requestCarrierRestart,
} from '@narada2/site-common-tools/operator-surface/carrier-restart-supervisor';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const runtimeBin = resolve(naradaRoot, 'packages', 'agent-runtime-server', 'bin', 'narada-agent-runtime-server.ts');
const agentStartBin = resolve(naradaRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
const mcpFixture = resolve(naradaRoot, 'packages', 'agent-runtime-server', 'test', 'fixtures', 'mcp-echo-server.ts');
const tsxEntrypoint = require.resolve('tsx');
const tsxLoader = pathToFileURL(tsxEntrypoint).href;
const liveEnabled = process.argv.includes('--enable-live-e2e')
  || process.env.NARADA_CARRIER_RESTART_LIVE_E2E === '1';

/**
 * Evidence posture: partial-production-launch. The carrier/runtime restart
 * processes and durable session source are real; the intelligence catalog,
 * provider endpoint, and MCP child are deterministic test fixtures.
 */
const SITE_ID = 'narada';
const AGENT_ID = `${SITE_ID}.resident`;
const REQUESTED_BY = 'principal-andrey';
const TIMEOUT_MS = 90_000;

test('[partial-production-launch] carrier restart drains a real NARS source and activates a real successor', {
  skip: !liveEnabled,
  timeout: TIMEOUT_MS + 30_000,
}, async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-carrier-restart-live-site-'));
  const pcSiteRoot = await mkdtemp(join(tmpdir(), 'narada-carrier-restart-live-pc-'));
  const sourceSessionId = `carrier_live_source_${Date.now()}`;
  const operationId = `carrier-restart-live-${Date.now()}`;
  const shimRoot = await mkdtemp(join(tmpdir(), 'narada-carrier-restart-live-shim-'));
  let sourceRuntime: RuntimeChild | null = null;
  let targetSessionId: string | null = null;
  const originalPath = process.env.PATH;
  const launchEnvironmentKeys = [
    'NARADA_SITE_ROOT',
    'NARADA_WORKSPACE_ROOT',
    'NARADA_PROPER_ROOT',
    'NARADA_SITE_ID',
    'NARADA_MCP_SCOPE',
    'NARADA_INTELLIGENCE_CONTEXT_PATH',
    'NARADA_INTELLIGENCE_REGISTRY_DB',
    'NARADA_INTELLIGENCE_TARGET_SITE',
    'NARADA_INTELLIGENCE_USER_SITE',
    'NARADA_INTELLIGENCE_HOST_SITE',
    'NARADA_INTELLIGENCE_PRINCIPAL_ID',
    'NARADA_INTELLIGENCE_PRINCIPAL_BINDING',
    'NARADA_AI_BASE_URL',
    'NARADA_AI_MODEL',
    'OPENAI_API_KEY',
  ];
  const originalLaunchEnvironment = new Map(launchEnvironmentKeys.map((key) => [key, process.env[key]]));

  try {
    const fixture = await prepareFixture(siteRoot);
    for (const key of launchEnvironmentKeys) {
      const value = fixture.environment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const sourcePaths = resolveNaradaSitePaths({ siteRoot, sessionId: sourceSessionId });
    await mkdir(sourcePaths.narsSessionDir, { recursive: true });
    await writeFile(sourcePaths.narsControlPath, '', 'utf8');
    await writeAgentStartShim(shimRoot);
    process.env.PATH = `${shimRoot}${process.platform === 'win32' ? ';' : ':'}${originalPath ?? ''}`;

    sourceRuntime = startRuntime({
      siteRoot,
      sessionId: sourceSessionId,
      environment: fixture.environment,
    });
    const sourceRecord = await waitForSessionRecord(siteRoot, sourceSessionId, sourceRuntime);
    await waitForHealthy(sourceRecord.health_endpoint, sourceRuntime);
    assert.equal(sourceRecord.agent_id, AGENT_ID);
    assert.equal(sourceRecord.site_id, SITE_ID);
    assert.equal(sourceRecord.operator_surface_kind ?? 'agent-web-ui', 'agent-web-ui');

    const outcome = await requestCarrierRestart({
      operation_id: operationId,
      requested_by: REQUESTED_BY,
      site_id: SITE_ID,
      carrier_session_id: sourceSessionId,
      expected_state: {
        manifest_digest: null,
        observation_digest: 'a'.repeat(64),
        descriptor_digest: null,
      },
      reason: 'live E2E controlled carrier restart',
      timeout_ms: TIMEOUT_MS,
      mutating_authorized: 'carrier.restart',
    }, { siteRoot, pcSiteRoot });

    targetSessionId = outcome.target_session_id;
    assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
    assert.equal(outcome.transition_state, 'source_retired');
    assert.equal(outcome.source_retired, true);
    assert.notEqual(targetSessionId, sourceSessionId);
    assert.ok(targetSessionId);

    const persisted = readCarrierRestartOutcome(pcSiteRoot, operationId);
    assert.deepEqual(persisted, outcome);
    assert.equal(readSessionEvents(siteRoot, sourceSessionId).some((event) => event.event === 'session_closed'), true);
    assert.equal(readSessionEvents(siteRoot, targetSessionId).some((event) => event.event === 'session_started'), true);
    assert.equal(readSessionEvents(siteRoot, targetSessionId).some((event) => event.event === 'session_closed'), false);
    assert.equal(existsSync(join(pcSiteRoot, 'runtime', 'carrier-sessions', `${targetSessionId}.json`)), true);
  } finally {
    if (targetSessionId) await closeRuntimeSession(siteRoot, targetSessionId);
    if (sourceRuntime) await stopRuntime(sourceRuntime);
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    for (const key of launchEnvironmentKeys) {
      const value = originalLaunchEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(shimRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(pcSiteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

interface RuntimeChild {
  child: ReturnType<typeof spawnTestChild>;
  output: () => string;
}

async function prepareFixture(siteRoot: string) {
  await mkdir(join(siteRoot, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  await mkdir(join(siteRoot, '.narada', 'runtime'), { recursive: true });
  const registryDbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  await mkdir(join(siteRoot, '.ai'), { recursive: true });
  await mkdir(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  const store = await SqliteRegistryStore.open(registryDbPath);
  try {
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const seed: any = JSON.parse(JSON.stringify(buildCanonicalLocalTestSeed({
      endpointBaseUrl: 'http://127.0.0.1:9',
      adapterProtocol: { family: 'openai', operation: 'chat-completions', version: '1' },
      credentialStore: 'env',
      credentialReference: 'OPENAI_API_KEY',
      now,
      validUntil,
    })));
    for (const record of seed.records) {
      const serialized = JSON.stringify(record.document)
        .replaceAll('inference-provider:remote-api', 'inference-provider:openai-api');
      record.document = JSON.parse(serialized);
      record.record_id = record.document.id;
      if (record.document.schema === 'narada.invokable-intelligence.adapter.v1') {
        record.document.protocol = { family: 'openai', operation: 'chat-completions', version: '1' };
      }
      if (record.document.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
        record.document.topology.nodes = record.document.topology.nodes.map((node: any) => ({ ...node, required_feasibility: [] }));
        record.document.topology.edges = record.document.topology.edges.map((edge: any) => ({ ...edge, required_feasibility: [] }));
      }
      if (record.document.schema === 'narada.invokable-intelligence.access-grant.v1') {
        record.document.scope.purposes = [...new Set([...record.document.scope.purposes, 'agent-session'])];
      }
      if (record.document.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
        record.document.purposes = [...new Set([...record.document.purposes, 'agent-session'])];
      }
      record.source.digest = canonicalSha256(record.document);
    }
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }

  const contextPath = join(siteRoot, '.narada', 'intelligence-launch-context.json');
  const targetSite = CANONICAL_LOCAL_TEST_IDS.targetSite;
  const principal = 'principal:andrey';
  await writeFile(contextPath, `${JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    registry_db_path: registryDbPath,
    target_site_id: targetSite,
    user_site_id: CANONICAL_LOCAL_TEST_IDS.userSite,
    host_site_id: CANONICAL_LOCAL_TEST_IDS.hostSite,
    principal_id: principal,
    intelligence_kernel_kind: 'narada-native',
    principal_binding: {
      schema: 'narada.intelligence.principal_binding.v1',
      actor: { principal_id: principal, auth_type: 'user-site-session' },
      memberships: [{
        registry: 'site-roster',
        site_id: targetSite,
        role: 'resident',
        evidence_ref: 'evidence:carrier-restart-live-e2e',
      }],
      evidence_refs: ['evidence:carrier-restart-live-e2e'],
    },
  }, null, 2)}\n`, 'utf8');

  await writeFile(join(siteRoot, '.ai', 'mcp', 'carrier-restart-live.json'), `${JSON.stringify({
    mcpServers: {
      'narada-carrier-restart-live-fixture': {
        transport: 'stdio',
        command: process.execPath,
        args: ['--import', tsxLoader, mcpFixture],
        tools: ['fixture_echo'],
        target_site_root: '{site_root}',
        injection_scope: 'local_site',
        narada_scope: { injection_scope: 'local_site' },
      },
    },
  }, null, 2)}\n`, 'utf8');

  return {
    environment: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_WORKSPACE_ROOT: naradaRoot,
      NARADA_PROPER_ROOT: naradaRoot,
      NARADA_SITE_ID: SITE_ID,
      NARADA_MCP_SCOPE: 'none',
      NARADA_INTELLIGENCE_CONTEXT_PATH: contextPath,
      NARADA_INTELLIGENCE_REGISTRY_DB: registryDbPath,
      NARADA_INTELLIGENCE_TARGET_SITE: targetSite,
      NARADA_INTELLIGENCE_USER_SITE: CANONICAL_LOCAL_TEST_IDS.userSite,
      NARADA_INTELLIGENCE_HOST_SITE: CANONICAL_LOCAL_TEST_IDS.hostSite,
      NARADA_INTELLIGENCE_PRINCIPAL_ID: principal,
      NARADA_INTELLIGENCE_PRINCIPAL_BINDING: JSON.stringify({
        schema: 'narada.intelligence.principal_binding.v1',
        actor: { principal_id: principal, auth_type: 'user-site-session' },
        memberships: [{ registry: 'site-roster', site_id: targetSite, role: 'resident', evidence_ref: 'evidence:carrier-restart-live-e2e' }],
        evidence_refs: ['evidence:carrier-restart-live-e2e'],
      }),
      NARADA_AI_BASE_URL: 'http://127.0.0.1:9',
      NARADA_AI_MODEL: 'live-carrier-restart-model',
      OPENAI_API_KEY: 'live-carrier-restart-fixture-key',
      NARADA_PC_SITE_ROOT: '',
    },
  };
}

async function writeAgentStartShim(shimRoot: string): Promise<string> {
  if (process.platform === 'win32') {
    const shimPath = join(shimRoot, 'narada-agent-start.cmd');
    await writeFile(shimPath, `@echo off\r\n"${process.execPath}" --import "${tsxLoader}" "${agentStartBin}" %*\r\n`, 'utf8');
    return shimPath;
  }
  const shimPath = join(shimRoot, 'narada-agent-start');
  await writeFile(shimPath, `#!/bin/sh\nexec "${process.execPath}" --import "${tsxLoader}" "${agentStartBin}" "$@"\n`, 'utf8');
  await chmod(shimPath, 0o755);
  return shimPath;
}

function startRuntime({ siteRoot, sessionId, environment }: { siteRoot: string; sessionId: string; environment: NodeJS.ProcessEnv }): RuntimeChild {
  const child = spawnTestChild(process.execPath, [
    '--import', tsxLoader,
    runtimeBin,
    '--identity', AGENT_ID,
    '--session', sessionId,
    '--site-root', siteRoot,
    '--operator-surface', 'agent-web-ui',
    '--health-host', '127.0.0.1',
    '--health-port', '0',
    '--event-host', '127.0.0.1',
    '--event-port', '0',
  ], {
    cwd: naradaRoot,
    env: { ...environment, NARADA_MCP_SCOPE: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  return { child, output: () => `${stdout}\n${stderr}` };
}

async function waitForSessionRecord(siteRoot: string, sessionId: string, runtime: RuntimeChild): Promise<any> {
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId });
  return waitFor(async () => {
    if (runtime.child.exitCode !== null) {
      throw new Error(`runtime_exited_before_session_record:${runtime.child.exitCode}:${runtime.output().slice(-4000)}`);
    }
    if (!existsSync(paths.narsSessionIndexRecordPath)) return null;
    const record = readJson(paths.narsSessionIndexRecordPath);
    return record?.health_endpoint && record?.event_endpoint ? record : null;
  }, 'session_record');
}

async function waitForHealthy(endpoint: string, runtime: RuntimeChild): Promise<any> {
  return waitFor(async () => {
    if (runtime.child.exitCode !== null) {
      throw new Error(`runtime_exited_before_health:${runtime.child.exitCode}:${runtime.output().slice(-4000)}`);
    }
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(500) });
      if (!response.ok) return null;
      const body = await response.json();
      return body.status === 'healthy' ? body : null;
    } catch {
      return null;
    }
  }, 'health');
}

async function closeRuntimeSession(siteRoot: string, sessionId: string): Promise<void> {
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId });
  if (!existsSync(paths.narsControlPath)) return;
  appendFileSync(paths.narsControlPath, `${JSON.stringify({
    id: `carrier-restart-live-cleanup-${sessionId}`,
    method: 'session.close',
    params: { source: 'carrier_restart_live_e2e_cleanup' },
  })}\n`, 'utf8');
  try {
    await waitFor(() => readSessionEvents(siteRoot, sessionId).some((event) => event.event === 'session_closed'), 'cleanup_close', 10_000);
  } catch {
    const record = existsSync(paths.narsSessionIndexRecordPath) ? readJson(paths.narsSessionIndexRecordPath) : null;
    const pid = Number(record?.process_ownership?.pid ?? record?.process_id ?? 0);
    terminateProcess(pid);
  }
}

async function stopRuntime(runtime: RuntimeChild): Promise<void> {
  if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;
  runtime.child.kill();
  await waitForChildExit(runtime.child, 5_000).catch(() => {});
}

function readSessionEvents(siteRoot: string, sessionId: string): any[] {
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId });
  if (!existsSync(paths.narsEventsPath)) return [];
  return readFileSync(paths.narsEventsPath, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function waitFor<T>(producer: () => T | Promise<T>, label: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const value = await producer();
      if (value) return value;
    } catch (error) {
      lastError = error;
      throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`live_carrier_restart_timeout:${label}:${lastError instanceof Error ? lastError.message : ''}`);
}

async function waitForChildExit(child: ReturnType<typeof spawnTestChild>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`child_exit_timeout:${child.pid}`)), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

function terminateProcess(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try { process.kill(pid, 'SIGTERM'); } catch {}
}
