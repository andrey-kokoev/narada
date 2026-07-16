import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');

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
    rmSync(siteRoot, { recursive: true, force: true });
  }
}

async function createEphemeralSiteRoot() {
  const root = await mkdtemp(join(tmpdir(), 'narada-live-codex-admission-'));
  await mkdir(join(root, '.narada', 'crew', 'nars-sessions'), { recursive: true });
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
    '--workspace-root', siteRoot,
    '--agent', agentId,
    '--runtime', 'narada-agent-runtime-server',
    '--intelligence-provider', 'codex-subscription',
    '--mcp-scope', 'none',
    '--exec',
    '--format', 'json',
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_WORKSPACE_ROOT: siteRoot,
      NARADA_SITE_ID: SITE_ID,
      NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
      NARADA_MCP_SCOPE: 'none',
      CODEX_MODEL: process.env.CODEX_MODEL ?? 'gpt-5.5',
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
    throw new Error(`${error instanceof Error ? error.message : String(error)}:${runtimeOutput(runtime)}`);
  }
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
