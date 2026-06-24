import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as agentCliRuntimeEvents from '@narada2/agent-cli/runtime-server-events';
import * as canonicalRuntimeEvents from '../src/runtime-server-events.mjs';
import {
  agentCliBinPath,
  carrierSubstrateArgs,
  createDelegatedAuthorityHandoff,
  createEventHub,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  lifecycleBindingFromArgs,
  parseEventStreamOptions,
  startHealthProjection,
  startEventStreamProjection,
} from '../src/server-wrapper.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

async function connectWebSocket(url) {
  assert.equal(typeof WebSocket, 'function');
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (message) => {
    const parsed = JSON.parse(String(message.data));
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  await once(socket, 'open');
  return {
    sendJson(payload) {
      socket.send(JSON.stringify(payload));
    },
    async nextJson() {
      if (queue.length) return queue.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      socket.close();
    },
  };
}

test('package owns the Narada agent runtime server bins and exports', () => {
  assert.equal(packageJson.name, '@narada2/agent-runtime-server');
  assert.equal(packageJson.narada.package_role, 'nars_runtime_server');
  assert.equal(packageJson.narada.owns.includes('server_request_handling'), true);
  assert.equal(packageJson.narada.carrier_substrate, '@narada2/agent-cli --carrier-server-substrate');
  assert.equal(packageJson.bin['narada-agent-runtime-server'], './bin/narada-agent-runtime-server.mjs');
  assert.equal(packageJson.bin['agent-runtime-server'], './bin/narada-agent-runtime-server.mjs');
  assert.equal(packageJson.exports['.'], './src/server-wrapper.mjs');
  assert.equal(packageJson.exports['./runtime-server-events'], './src/runtime-server-events.mjs');
});

test('agent-cli runtime event snapshot matches the canonical runtime-server helper export', () => {
  assert.deepEqual(Object.keys(agentCliRuntimeEvents).sort(), Object.keys(canonicalRuntimeEvents).sort());
  const fixtures = [
    null,
    {
      event: 'session_started',
      timestamp: '2026-06-23T00:00:00.000Z',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      mcp_operational_state: 'startup_degraded',
      mcp_startup_failure_count: 1,
      mcp_startup_failure_summary: '1 (fixture:mcp_stdout_pollution)',
      mcp_runtime_fault_count: 0,
      mcp_runtime_fault_summary: '0',
      mcp_preflight_recommended_action: 'repair_mcp',
      mcp_preflight_recommended_action_display: 'Repair MCP',
      mcp_preflight_recommended_command: 'narada mcp repair',
    },
    {
      event: 'carrier_diagnostic_recorded',
      timestamp: '2026-06-23T00:00:01.000Z',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      diagnostic_code: 'mcp_runtime_fault',
      server_name: 'filesystem',
      tool_name: 'fs_read_file',
      error_code: 'EACCES',
    },
    {
      event: 'session_status',
      timestamp: '2026-06-23T00:00:02.000Z',
      request_id: 'status-1',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      recommended_action: 'recover_session',
      recommended_action_display: 'Recover session',
      recommended_command: 'narada-agent-cli --session-recover',
      session_event_count: 2,
    },
    {
      event: 'session_operations',
      timestamp: '2026-06-23T00:00:03.000Z',
      request_id: 'ops-1',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      operation: { operation_event_summary: '1 active operation' },
      handoffs: { session_operations: 'narada-agent-cli --session-operations' },
    },
  ];
  for (const [helperName, canonicalHelper] of Object.entries(canonicalRuntimeEvents)) {
    for (const event of fixtures) {
      assert.deepEqual(
        agentCliRuntimeEvents[helperName](event),
        canonicalHelper(event),
        `${helperName} diverged for ${event?.event ?? 'null'}`,
      );
    }
  }
});

test('runtime server invokes private agent-cli carrier substrate args', () => {
  assert.deepEqual(carrierSubstrateArgs(['--identity', 'narada.test']), ['--carrier-server-substrate', '--identity', 'narada.test']);
  assert.deepEqual(carrierSubstrateArgs(['--server', '--identity', 'narada.test']), ['--carrier-server-substrate', '--identity', 'narada.test']);
  assert.deepEqual(carrierSubstrateArgs(['--carrier-server-substrate', '--identity', 'narada.test']), ['--carrier-server-substrate', '--identity', 'narada.test']);
});

test('runtime server creates a governed delegated authority handoff for the carrier substrate', () => {
  assert.deepEqual(createDelegatedAuthorityHandoff({
    args: ['--carrier-server-substrate', '--identity', 'narada.test', '--session', 'runtime-package-test'],
    env: {
      NARADA_SITE_ROOT: 'D:/code/narada.test',
      NARADA_AGENT_START_EVENT_ID: 'evt_test',
      NARADA_AUTHORITY_REF: 'task:1328',
    },
    generatedAt: '2026-06-23T00:00:00.000Z',
  }), {
    schema: 'narada.nars.delegated_authority_handoff.v1',
    crossing_regime: 'nars_runtime_server_to_carrier_substrate',
    source: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
    },
    target: {
      package: '@narada2/agent-cli',
      mode: 'carrier-server-substrate',
    },
    generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    authority_ref: 'task:1328',
    authority_mode: null,
    evidence: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
      codex_admission_id: null,
      authority_source: 'env_ref',
    },
  });
});

test('runtime server derives delegated write authority from worker argv when no env authority ref exists', () => {
  assert.deepEqual(createDelegatedAuthorityHandoff({
    args: ['--carrier-server-substrate', '--identity', 'narada.test', '--session', 'runtime-package-test', '--authority', 'write'],
    env: {
      NARADA_SITE_ROOT: 'D:/code/narada.test',
      NARADA_AGENT_START_EVENT_ID: 'evt_test',
    },
    generatedAt: '2026-06-23T00:00:00.000Z',
  }), {
    schema: 'narada.nars.delegated_authority_handoff.v1',
    crossing_regime: 'nars_runtime_server_to_carrier_substrate',
    source: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
    },
    target: {
      package: '@narada2/agent-cli',
      mode: 'carrier-server-substrate',
    },
    generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    authority_ref: 'nars-delegated:write:runtime-package-test',
    authority_mode: 'write',
    evidence: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
      codex_admission_id: null,
      authority_source: 'argv_authority',
    },
  });
});

test('event hub supports replay, filtering, and bounded cursors', () => {
  const hub = createEventHub({ maxBuffer: 2 });
  hub.publish({ event: 'session_started', timestamp: '2026-06-23T00:00:00.000Z' });
  hub.publish({ event: 'assistant_message', request_id: 'input_1', timestamp: '2026-06-23T00:00:01.000Z' });
  hub.publish({ event: 'tool_call', request_id: 'input_1', timestamp: '2026-06-23T00:00:02.000Z' });
  assert.deepEqual(hub.replayFor({ maxReplay: 10 }).map((event) => event.event), ['assistant_message', 'tool_call']);
  assert.deepEqual(hub.replayFor({ sinceSequence: 2 }).map((event) => event.event), ['tool_call']);
  assert.deepEqual(hub.replayFor({ filters: { event_kinds: ['assistant_message'] }, maxReplay: 10 }).map((event) => event.event), ['assistant_message']);
  assert.deepEqual(hub.cursor(), { last_sequence: 3, next_sequence: 4 });
});

test('WebSocket /events subscribes with replay and forwards protocol frames', async () => {
  assert.deepEqual(parseEventStreamOptions(['--event-host', '127.0.0.1', '--event-port', '0', '--no-health']).events, {
    enabled: true,
    host: '127.0.0.1',
    port: 0,
  });
  const childStdin = new PassThrough();
  let written = '';
  childStdin.setEncoding('utf8');
  childStdin.on('data', (chunk) => { written += chunk; });
  const waitForWrittenFrame = () => new Promise((resolve) => {
    if (written.trim()) {
      resolve();
      return;
    }
    childStdin.once('data', () => resolve());
  });
  const hub = createEventHub();
  hub.publish({ event: 'session_started', agent_id: 'narada.test', session_id: 'runtime-package-test' });
  const projection = await startEventStreamProjection({ childStdin, eventHub: hub, host: '127.0.0.1', port: 0 });
  const client = await connectWebSocket(projection.url);
  try {
    assert.equal((await client.nextJson()).event, 'websocket_connected');
    client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10 } });
    const started = await client.nextJson();
    assert.equal(started.event, 'session_events_subscription_started');
    assert.equal(started.transport, 'websocket');
    assert.equal(started.replay_count, 1);
    const replay = await client.nextJson();
    assert.equal(replay.event, 'session_event');
    assert.equal(replay.payload.event, 'session_started');
    hub.publish({ event: 'assistant_message', request_id: 'input_1', content: 'hello' });
    const live = await client.nextJson();
    assert.equal(live.payload.event, 'assistant_message');
    client.sendJson({ id: 'status-1', method: 'session.status', params: {} });
    await waitForWrittenFrame();
    assert.equal(JSON.parse(written.trim().split(/\r?\n/).at(-1)).method, 'session.status');
  } finally {
    client.close();
    projection.server.close();
  }
});

test('wrapper resolves the packaged agent-cli carrier bin', () => {
  assert.equal(agentCliBinPath().endsWith(join('agent-cli', 'bin', 'narada-agent-cli.mjs')), true);
});

test('wrapper event helpers preserve the existing runtime-server event contract', () => {
  const degraded = {
    event: 'session_started',
    timestamp: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    mcp_operational_state: 'startup_degraded',
    mcp_startup_failure_count: 1,
    mcp_startup_failure_summary: '1 (fixture:mcp_stdout_pollution)',
    mcp_runtime_fault_count: 0,
    mcp_runtime_fault_summary: '0',
  };
  assert.equal(
    formatStartupMcpSummary(degraded),
    '[agent-runtime-server] MCP state=startup_degraded | startup=1 (fixture:mcp_stdout_pollution)',
  );
  assert.deepEqual(formatStartupMcpEvent(degraded), {
    schema: 'narada.agent_runtime_server.wrapper_event.v1',
    event: 'mcp_startup_status',
    timestamp: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    mcp_operational_state: 'startup_degraded',
    mcp_startup_failure_count: 1,
    mcp_startup_failure_summary: '1 (fixture:mcp_stdout_pollution)',
    mcp_runtime_fault_count: 0,
    mcp_runtime_fault_summary: '0',
  });
  assert.equal(formatStartupMcpSummary({ event: 'session_started', mcp_operational_state: 'healthy' }), null);
});

test('wrapper status snapshots keep the wrapper schema stable', () => {
  const snapshot = formatWrapperStatusEvent({
    event: 'session_status',
    request_id: 'status-1',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    request_posture: 'clean',
    operational_posture: 'healthy',
    session_event_count: 2,
  });
  assert.equal(snapshot.schema, 'narada.agent_runtime_server.wrapper_event.v1');
  assert.equal(snapshot.event, 'session_status_snapshot');
  assert.equal(snapshot.source_event, 'session_status');
  assert.equal(snapshot.request_id, 'status-1');
  assert.equal(snapshot.agent_id, 'narada.test');
  assert.equal(snapshot.session_id, 'runtime-package-test');
  assert.equal(snapshot.request_posture, 'clean');
  assert.equal(snapshot.operational_posture, 'healthy');
  assert.equal(snapshot.session_event_count, 2);
});

test('lifecycle dispatcher maps NARS events to ordered hook calls', async () => {
  const observed = [];
  const handler = {};
  for (const hook of [
    'beforeSessionBind',
    'afterSessionStarted',
    'beforeDirectiveAccept',
    'afterDirectiveAccepted',
    'beforeTurnStart',
    'onToolCall',
    'onToolResult',
    'onCommandResult',
    'afterTurnComplete',
    'beforeSessionClose',
    'afterSessionClosed',
  ]) {
    handler[hook] = (payload) => observed.push(`${hook}:${payload.event_kind ?? 'manual'}`);
  }
  const dispatcher = createNarsLifecycleHookDispatcher({ hooks: [handler], clock: () => '2026-06-23T00:00:00.000Z' });
  await dispatchNarsLifecycleHook(dispatcher, 'beforeSessionBind', {
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
  });
  const baseEvent = {
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    request_id: 'input_test',
    turn_id: 'turn_test',
    timestamp: '2026-06-23T00:00:00.000Z',
  };
  for (const event of [
    { event: 'session_started', ...baseEvent },
    { event: 'directive_received', directive_id: 'dir_test', ...baseEvent },
    { event: 'directive_carrier_accepted_recorded', directive_id: 'dir_test', ...baseEvent },
    { event: 'turn_started', ...baseEvent },
    { event: 'tool_call', tool: 'fs_read_file', ...baseEvent },
    { event: 'tool_result', tool: 'fs_read_file', terminal_state: 'completed', ...baseEvent },
    { event: 'carrier_command_result', command: '/status', terminal_state: 'completed', ...baseEvent },
    { event: 'turn_complete', terminal_state: 'completed', ...baseEvent },
    { event: 'session_closed', terminal_state: 'closed', ...baseEvent },
  ]) {
    await dispatchNarsLifecycleHooksForEvent(dispatcher, event);
  }
  assert.deepEqual(observed, [
    'beforeSessionBind:manual',
    'afterSessionStarted:session_started',
    'beforeDirectiveAccept:directive_received',
    'afterDirectiveAccepted:directive_carrier_accepted_recorded',
    'beforeTurnStart:turn_started',
    'onToolCall:tool_call',
    'onToolResult:tool_result',
    'onCommandResult:command_result',
    'afterTurnComplete:turn_complete',
    'beforeSessionClose:session_closed',
    'afterSessionClosed:session_closed',
  ]);
});

test('lifecycle dispatcher reports bounded redacted hook failures', async () => {
  const dispatcher = createNarsLifecycleHookDispatcher({
    hooks: [{ onToolCall: () => { throw new Error('API_KEY=abc123 failed'); } }],
    clock: () => '2026-06-23T00:00:00.000Z',
  });
  const result = await dispatchNarsLifecycleHooksForEvent(dispatcher, {
    event: 'tool_call',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    request_id: 'input_test',
    turn_id: 'turn_test',
    timestamp: '2026-06-23T00:00:00.000Z',
  });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].code, 'nars_lifecycle_hook_failed');
  assert.equal(result.failures[0].error.message.includes('abc123'), false);
  assert.equal(result.failures[0].error.message.includes('<redacted>'), true);
});

test('lifecycle binding is derived from runtime args before session bind', () => {
  assert.deepEqual(lifecycleBindingFromArgs(['--server', '--identity', 'narada.test', '--session', 'runtime-package-test'], {
    NARADA_SITE_ROOT: 'D:/code/narada.test',
    NARADA_AGENT_START_EVENT_ID: 'evt_test',
  }), {
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    metadata: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
    },
  });
});

test('HTTP /health projects native session.health response', async () => {
  const childStdin = new PassThrough();
  let written = '';
  childStdin.setEncoding('utf8');
  childStdin.on('data', (chunk) => { written += chunk; });
  const waitForFrame = () => new Promise((resolve) => {
    if (written.trim()) {
      resolve();
      return;
    }
    childStdin.once('data', () => resolve());
  });
  const projection = await startHealthProjection({ childStdin, host: '127.0.0.1', port: 0, timeoutMs: 1000 });
  try {
    const responsePromise = new Promise((resolve, reject) => {
      const request = httpRequest(projection.url, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ statusCode: response.statusCode, body }));
      });
      request.on('error', reject);
      request.end();
    });
    await waitForFrame();
    const frame = JSON.parse(written.trim());
    assert.equal(frame.method, 'session.health');
    projection.observe({
      event: 'session_health',
      request_id: frame.id,
      schema: 'narada.nars.health.v1',
      status: 'healthy',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
    });
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.schema, 'narada.nars.health.v1');
    assert.equal(body.status, 'healthy');
    assert.equal(body.agent_id, 'narada.test');
  } finally {
    projection.server.close();
  }
});

test('narada-owned entrypoint delegates to the private agent-cli carrier substrate', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-runtime-server-package-'));
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawn(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--identity', 'narada.test',
      '--session', 'runtime-package-test',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AUTHORITY_REF: 'task:1328',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'status-1', method: 'session.status', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
    child.stdin.end();
    const exitCode = await new Promise((resolveExit) => child.on('exit', resolveExit));
    assert.equal(exitCode, 0, stderr);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(events[0].event, 'session_started');
    assert.equal(events[0].runtime, 'agent-cli');
    assert.equal(events[0].mode, 'server');
    assert.equal(events[0].agent_id, 'narada.test');
    assert.equal(events[0].delegated_authority_handoff?.schema, 'narada.nars.delegated_authority_handoff.v1');
    assert.equal(events[0].delegated_authority_handoff?.crossing_regime, 'nars_runtime_server_to_carrier_substrate');
    assert.equal(events[0].delegated_authority_handoff?.parse_status, 'accepted');
    assert.equal(events[0].delegated_authority_handoff?.agent_id, 'narada.test');
    assert.equal(events[0].delegated_authority_handoff?.session_id, 'runtime-package-test');
    assert.equal(events[0].delegated_authority_ref, 'task:1328');
    assert.match(events[0].health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.match(events[0].event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
    assert.equal(events.some((event) => event.event === 'session_status' && event.request_id === 'status-1'), true);
    assert.equal(events.some((event) => event.event === 'session_closed' && event.request_id === 'close-1'), true);
    assert.equal(stderr.includes('Fatal error'), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
