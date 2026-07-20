import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalLocalTestSeed, CANONICAL_LOCAL_TEST_IDS } from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { spawnTestChild } from '@narada2/process-launch-posture';

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');

async function seedIntelligenceRegistry(siteRoot) {
  const dbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  await mkdir(join(siteRoot, '.ai'), { recursive: true });
  const store = await SqliteRegistryStore.open(dbPath);
  try {
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const seed = JSON.parse(JSON.stringify(buildCanonicalLocalTestSeed({
      adapterProtocol: { family: 'codex-subscription', operation: 'responses', version: '1' },
      credentialStore: 'none',
      credentialReference: 'codex-subscription-session',
      invocationModelKey: 'gpt-5.5',
      now,
      validUntil,
    })));
    const replacements = new Map([
      ['model-provider:kimi', 'model-provider:openai'],
      ['model:kimi-k2-thinking', 'model:openai-gpt-5.5'],
      ['model-offering:kimi-via-local-api', 'model-offering:gpt-5.5-via-codex-subscription'],
      ['route:kimi-local-api', 'route:gpt-5.5-codex-subscription'],
      ['adapter:openai-compatible-http', 'adapter:codex-subscription'],
      ['inference-endpoint:remote-default', 'inference-endpoint:codex-subscription'],
      ['inference-provider:remote-api', 'inference-provider:codex-subscription'],
      ['local-api', 'codex-subscription'],
      ['Kimi K2 Thinking', 'GPT-5.5'],
      ['model-owner:kimi', 'model-owner:openai'],
    ]);
    for (const record of seed.records) {
      let serialized = JSON.stringify(record.document);
      for (const [from, to] of replacements) serialized = serialized.replaceAll(from, to);
      record.document = JSON.parse(serialized);
      record.record_id = record.document.id;
      if (record.document.schema === 'narada.invokable-intelligence.adapter.v1') {
        record.document.protocol = { family: 'codex-subscription', operation: 'responses', version: '1' };
      }
      if (record.document.schema === 'narada.invokable-intelligence.inference-endpoint.v1') {
        record.document.address = { kind: 'runtime-service', service: 'codex-subscription' };
      }
      if (record.document.schema === 'narada.invokable-intelligence.model-offering.v1') {
        record.document.invocation_model_key = 'gpt-5.5';
      }
      if (record.document.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
        record.document.topology.nodes = record.document.topology.nodes.map((node) => ({ ...node, required_feasibility: [] }));
        record.document.topology.edges = record.document.topology.edges.map((edge) => ({ ...edge, required_feasibility: [] }));
      }
      if (record.document.schema === 'narada.invokable-intelligence.access-grant.v1') {
        record.document.scope.purposes = [...new Set([...record.document.scope.purposes, 'agent-session'])];
      }
      if (record.document.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
        record.document.purposes = [...new Set([...record.document.purposes, 'agent-session'])];
      }
    }
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }
  return dbPath;
}

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CLI_ENTRYPOINT = resolve(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js');
const LIVE_ENABLE_FLAG = '--enable-live-codex';
const TIMEOUT_MS = Number(process.env.NARADA_LIVE_CODEX_E2E_TIMEOUT_MS ?? 180_000);
const STARTUP_TIMEOUT_MS = Number(process.env.NARADA_LIVE_CODEX_E2E_STARTUP_TIMEOUT_MS ?? 60_000);
const SITE_ID = `codex-live-e2e-${Date.now()}`;

if (!process.argv.includes(LIVE_ENABLE_FLAG)) {
  console.log(`live Codex E2E not run; invoke this file with ${LIVE_ENABLE_FLAG} or use the package script`);
} else {
  try {
    await runLiveCodexAdmissionE2e();
  } catch (error) {
    console.error(JSON.stringify({
      schema: 'narada.agent_runtime_server.live_codex_provider_admission_e2e.v1',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

async function runLiveCodexAdmissionE2e() {
  assert.ok(existsSync(CLI_ENTRYPOINT), `Narada CLI build is required: ${CLI_ENTRYPOINT}`);
  const siteRoot = await createEphemeralSiteRoot();
  const runtimes = [];
  const clients = [];
  const startedAt = Date.now();

  try {
    const first = await startRuntime({ siteRoot, agentId: 'codex-live-a' });
    runtimes.push(first);
    first.record = await waitForSessionRecord(first, siteRoot);
    await waitForHealthy(first.record.health_endpoint);
    first.client = await connectSession(first.record.event_endpoint);
    clients.push(first.client);

    const second = await startRuntime({ siteRoot, agentId: 'codex-live-b' });
    runtimes.push(second);
    second.record = await waitForSessionRecord(second, siteRoot);
    await waitForHealthy(second.record.health_endpoint);
    second.client = await connectSession(second.record.event_endpoint);
    clients.push(second.client);

    first.client.submit('For this live isolation test, wait at least five seconds before replying, then reply with exactly CODEX_LIVE_E2E_A.');
    const firstAdmitted = await waitForInvocationEvent(first.record, (event) => event.invocation_state === 'admitted');
    assert.equal(firstAdmitted.provider, 'codex-subscription');
    assert.equal(firstAdmitted.invocation_scope?.kind, 'narada_runtime_session');
    assert.equal(firstAdmitted.invocation_scope?.runtime_session_id, runtimeSessionId(first.record));

    const firstEventsBeforeSecond = readJsonlFile(first.record.events_path);
    assert.equal(
      firstEventsBeforeSecond.some((event) => event.event === 'provider_invocation_state_transition'
        && event.invocation_id === firstAdmitted.invocation_id
        && event.invocation_state === 'completed'),
      false,
      'the first real Codex process must still be live when the second session is admitted',
    );

    second.client.submit('Reply with exactly CODEX_LIVE_E2E_B.');
    const secondAdmitted = await waitForInvocationEvent(second.record, (event) => event.invocation_state === 'admitted');
    assert.equal(secondAdmitted.provider, 'codex-subscription');
    assert.equal(secondAdmitted.invocation_scope?.kind, 'narada_runtime_session');
    assert.equal(secondAdmitted.invocation_scope?.runtime_session_id, runtimeSessionId(second.record));
    assert.notEqual(firstAdmitted.invocation_scope.runtime_session_id, secondAdmitted.invocation_scope.runtime_session_id);

    const firstCompleted = await waitForInvocationEvent(first.record, (event) => event.invocation_state === 'completed');
    const secondCompleted = await waitForInvocationEvent(second.record, (event) => event.invocation_state === 'completed');
    assertInvocationLifecycle(first.record, firstAdmitted.invocation_id);
    assertInvocationLifecycle(second.record, secondAdmitted.invocation_id);
    assert.equal(firstCompleted.invocation_scope?.runtime_session_id, runtimeSessionId(first.record));
    assert.equal(secondCompleted.invocation_scope?.runtime_session_id, runtimeSessionId(second.record));

    console.log(JSON.stringify({
      schema: 'narada.agent_runtime_server.live_codex_provider_admission_e2e.v1',
      status: 'passed',
      site_id: SITE_ID,
      sessions: [runtimeSessionId(first.record), runtimeSessionId(second.record)],
      providers: ['codex-subscription', 'codex-subscription'],
      overlap_proven: true,
      elapsed_ms: Date.now() - startedAt,
    }, null, 2));
  } finally {
    for (const client of clients.reverse()) client.close();
    for (const runtime of runtimes.reverse()) await closeRuntime(runtime);
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

async function createEphemeralSiteRoot() {
  const root = await mkdtemp(join(tmpdir(), 'narada-live-codex-admission-'));
  await mkdir(join(root, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  await mkdir(join(root, '.narada', 'runtime'), { recursive: true });
  await seedIntelligenceRegistry(root);
  return root;
}

async function startRuntime({ siteRoot, agentId }) {
  const child = spawnTestChild(process.execPath, [
    CLI_ENTRYPOINT,
    'operator-surface',
    'runtime',
    'start',
    'agent-web-ui',
    '--site-root', siteRoot,
    '--target-site-id', SITE_ID,
    '--workspace-root', REPO_ROOT,
    '--agent', agentId,
    '--runtime', 'narada-agent-runtime-server',
    '--mcp-scope', 'none',
    '--launch-binding', join(siteRoot, '.narada', 'runtime', 'codex-live-launch-binding.json'),
    '--exec',
    '--format', 'json',
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_WORKSPACE_ROOT: REPO_ROOT,
      NARADA_SITE_ID: SITE_ID,
      NARADA_MCP_SCOPE: 'none',
      NARADA_INTELLIGENCE_REGISTRY_DB: join(siteRoot, '.ai', 'intelligence-registry.db'),
      NARADA_INTELLIGENCE_TARGET_SITE: CANONICAL_LOCAL_TEST_IDS.targetSite,
      NARADA_INTELLIGENCE_USER_SITE: CANONICAL_LOCAL_TEST_IDS.userSite,
      NARADA_INTELLIGENCE_HOST_SITE: CANONICAL_LOCAL_TEST_IDS.hostSite,
      NARADA_INTELLIGENCE_PRINCIPAL_ID: CANONICAL_LOCAL_TEST_IDS.principal,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output.stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { output.stderr += String(chunk); });
  return { child, output, agentId, record: null, client: null };
}

async function waitForSessionRecord(runtime, siteRoot) {
  try {
    return await waitFor(() => {
      if (runtime.child.exitCode !== null && runtime.child.exitCode !== 0) {
        throw new Error(`runtime_start_failed:${runtime.agentId}:${runtime.child.exitCode}:${runtimeOutput(runtime)}`);
      }
      const record = findLatestSessionRecord(siteRoot, runtime.agentId);
      return record?.event_endpoint && record?.health_endpoint ? record : false;
    }, `session_record:${runtime.agentId}`, STARTUP_TIMEOUT_MS);
  } catch (error) {
    const diagnostics = sessionRecordDiagnostics(siteRoot);
    throw new Error(`${error instanceof Error ? error.message : String(error)}:session_record_diagnostics=${JSON.stringify(diagnostics)}:${runtimeOutput(runtime)}`);
  }
}
function sessionRecordDiagnostics(siteRoot) {
  const sessionRoots = [
    join(siteRoot, '.narada', 'crew', 'nars-sessions'),
    join(siteRoot, 'crew', 'nars-sessions'),
  ];
  const sessionRootDiagnostics = sessionRoots.map((root) => {
    let relativeFiles = [];
    try {
      if (existsSync(root)) relativeFiles = readdirSync(root, { recursive: true }).map(String).slice(0, 80);
    } catch {}
    const recordFiles = relativeFiles.filter((relativePath) => relativePath.endsWith('session-index-record.json'));
    return {
      root,
      exists: existsSync(root),
      entries: relativeFiles,
      records: recordFiles.map((relativePath) => {
        const record = readJsonFile(join(root, relativePath));
        const sessionLogPath = join(root, relativePath.replace(/session-index-record\.json$/, 'session.jsonl'));
        return {
          path: join(root, relativePath),
          agent_id: record?.agent_id ?? null,
          session_id: record?.session_id ?? null,
          runtime_session_id: record?.runtime_session_id ?? null,
          event_endpoint: record?.event_endpoint ?? null,
          health_endpoint: record?.health_endpoint ?? null,
          session_path: record?.session_path ?? null,
          events_path: record?.events_path ?? null,
          session_events_tail: readJsonlFile(sessionLogPath).slice(-20),
        };
      }),
      index: readJsonFile(join(root, 'index.json')),
    };
  });
  const runtimeProcessRoot = join(siteRoot, '.ai', 'runtime', 'agent-start-processes');
  let runtimeProcessEntries = [];
  try {
    if (existsSync(runtimeProcessRoot)) runtimeProcessEntries = readdirSync(runtimeProcessRoot, { recursive: true }).map(String).slice(0, 120);
  } catch {}
  const runtimeProcessFiles = Object.fromEntries(runtimeProcessEntries
    .filter((relativePath) => /\.(log|json)$/i.test(relativePath))
    .slice(0, 40)
    .map((relativePath) => {
      const path = join(runtimeProcessRoot, relativePath);
      let content = '';
      try { content = readFileSync(path, 'utf8').slice(-8000); } catch {}
      return [relativePath, content];
    }));
  return {
    session_roots: sessionRootDiagnostics,
    runtime_process_root: runtimeProcessRoot,
    runtime_process_entries: runtimeProcessEntries,
    runtime_process_files: runtimeProcessFiles,
    reconciliation: readJsonFile(join(siteRoot, '.ai', 'runtime', 'agent-start-reconciliation', 'v1.json')),
  };
}



function findLatestSessionRecord(siteRoot, agentId) {
  const records = [];
  for (const sessionsRoot of [
    join(siteRoot, '.narada', 'crew', 'nars-sessions'),
    join(siteRoot, 'crew', 'nars-sessions'),
  ]) {
    if (!existsSync(sessionsRoot)) continue;
    try {
      const aggregate = readNarsSessionIndex({ sessionsRoot, siteRoot });
      for (const entry of aggregate?.sessions ?? []) {
        if (entry?.agent_id !== agentId) continue;
        const recordPath = entry.record_path ?? (entry.session_dir ? join(entry.session_dir, 'session-index-record.json') : null);
        if (!recordPath || !existsSync(recordPath)) continue;
        const record = readJsonFile(recordPath);
        if (record?.agent_id === agentId) records.push(record);
      }
    } catch {}
    try {
      for (const relativePath of readdirSync(sessionsRoot, { recursive: true })) {
        if (!String(relativePath).endsWith('session-index-record.json')) continue;
        const recordPath = join(sessionsRoot, String(relativePath));
        const record = readJsonFile(recordPath);
        if (record?.agent_id === agentId) records.push(record);
      }
    } catch {}
  }
  records.sort((left, right) => timestampMs(right) - timestampMs(left));
  return records[0] ?? null;
}

function runtimeSessionId(record) {
  return record.runtime_session_id ?? record.session_id;
}

async function waitForHealthy(endpoint) {
  return waitFor(async () => {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) return false;
      const body = await response.json();
      return body.status === 'healthy' ? body : false;
    } catch {
      return false;
    }
  }, 'health');
}

async function connectSession(endpoint) {
  const url = new URL(endpoint);
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (message) => {
    const parsed = JSON.parse(String(message.data));
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  await waitForSocketOpen(socket);
  const client = {
    sendJson(frame) {
      socket.send(JSON.stringify(frame));
    },
    next(timeoutMs = TIMEOUT_MS) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => rejectPromise(new Error('websocket_message_timeout')), timeoutMs);
        waiters.push((frame) => {
          clearTimeout(timer);
          resolvePromise(frame);
        });
      });
    },
    submit(content) {
      this.sendJson({
        id: `live-codex-input-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        method: 'session.submit',
        params: { content, source: 'live_codex_provider_admission_e2e' },
      });
    },
    close() {
      try { socket.close(); } catch {}
    },
  };
  assert.equal((await client.next()).event, 'websocket_connected');
  client.sendJson({ id: 'live-codex-events', method: 'session.events.subscribe', params: { include_replay: false } });
  await waitForClientFrame(client, (frame) => frame.event === 'session_events_subscription_started');
  return client;
}

function waitForSocketOpen(socket) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('websocket_open_timeout')), TIMEOUT_MS);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolvePromise();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      rejectPromise(new Error('websocket_open_failed'));
    }, { once: true });
  });
}

async function waitForClientFrame(client, predicate) {
  return waitFor(async () => {
    const frame = await client.next(Math.min(TIMEOUT_MS, 5000));
    return predicate(frame) ? frame : false;
  }, 'websocket_frame');
}

async function waitForInvocationEvent(record, predicate) {
  return waitFor(() => readJsonlFile(record.events_path).find((event) => (
    event.event === 'provider_invocation_state_transition' && predicate(event)
  )), 'provider_invocation_event');
}

function assertInvocationLifecycle(record, invocationId) {
  const events = readJsonlFile(record.events_path).filter((event) => (
    event.event === 'provider_invocation_state_transition' && event.invocation_id === invocationId
  ));
  assert.deepEqual(events.map((event) => event.invocation_state), [
    'requested', 'validated', 'shaped', 'dispatched', 'admitting', 'admitted', 'receiving', 'completed',
  ]);
  assert.equal(events.some((event) => event.invocation_state === 'refused'), false);
  assert.ok(events.every((event) => event.invocation_scope?.kind === 'narada_runtime_session'));
  assert.ok(events.every((event) => event.invocation_scope?.runtime_session_id === runtimeSessionId(record)));
}

async function closeRuntime(runtime) {
  const ownedPid = Number(runtime?.record?.process_ownership?.pid);
  if (Number.isInteger(ownedPid) && ownedPid > 0 && ownedPid !== process.pid) {
    if (process.platform === 'win32') {
      const killer = spawnTestChild('taskkill.exe', ['/PID', String(ownedPid), '/T', '/F'], { stdio: 'ignore' });
      await Promise.race([once(killer, 'exit'), delay(5000)]);
      if (killer.exitCode === null) killer.kill('SIGKILL');
    } else {
      try { process.kill(ownedPid, 'SIGTERM'); } catch {}
    }
  }
  if (!runtime?.child || runtime.child.exitCode !== null) return;
  const pid = Number(runtime.child.pid);
  if (process.platform === 'win32' && Number.isInteger(pid) && pid > 0) {
    const killer = spawnTestChild('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    await Promise.race([once(killer, 'exit'), delay(3000)]);
    if (killer.exitCode === null) killer.kill('SIGKILL');
  } else {
    runtime.child.kill('SIGTERM');
  }
  await Promise.race([once(runtime.child, 'exit'), delay(3000)]);
  if (runtime.child.exitCode === null) runtime.child.kill('SIGKILL');
}

async function waitFor(predicate, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await delay(25);
  }
  throw new Error(`${label}_timeout`);
}

function readJsonlFile(path) {
  if (!path || !existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // The writer may be between append and newline flush while polling.
    }
  }
  return events;
}

function readJsonFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function timestampMs(record) {
  for (const field of ['last_seen_at', 'started_at', 'projection_generated_at']) {
    const parsed = Date.parse(record?.[field] ?? '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function runtimeOutput(runtime) {
  return `${runtime.output.stdout.slice(-2000)}${runtime.output.stderr.slice(-2000)}`;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
