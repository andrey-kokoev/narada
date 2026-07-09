import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import * as canonicalRuntimeEvents from '../src/runtime-server-events.mjs';
import {
  createDelegatedAuthorityHandoff,
  createEventHub,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  formatHostStatusEvent,
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
  assert.equal(packageJson.narada.carrier_substrate, '@narada2/carrier-runtime in-process');
  assert.equal(packageJson.narada.runtime_dependency_owner.includes('@narada2/carrier-runtime/runtime-dependencies'), true);
  assert.equal(packageJson.bin['narada-agent-runtime-server'], './bin/narada-agent-runtime-server.mjs');
  assert.equal(packageJson.bin['agent-runtime-server'], undefined);
  assert.equal(packageJson.exports['.'], './src/server-wrapper.mjs');
  assert.equal(packageJson.exports['./runtime-server-events'], './src/runtime-server-events.mjs');
  assert.equal(packageJson.dependencies['@narada2/agent-cli'], undefined);
  assert.equal(packageJson.dependencies['@narada2/carrier-terminal-projection'], 'workspace:*');
});

test('WebSocket /events replays and reads durable events.jsonl beyond memory buffer', async () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-events-log-test-'));
  try {
    const eventsPath = join(root, 'events.jsonl');
    writeFileSync(eventsPath, `${[
      { event_sequence: 1, sequence: 1, event: 'session_started', session_id: 'runtime-package-test' },
      { event_sequence: 2, sequence: 2, event: 'assistant_message', content: 'durable-old' },
      { event_sequence: 3, sequence: 3, event: 'tool_call', tool_name: 'durable.tool' },
      { event_sequence: 4, sequence: 4, event: 'assistant_message', content: 'durable-new' },
    ].map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
    const childStdin = new PassThrough();
    const hub = createEventHub({ maxBuffer: 1 });
    hub.publish({ event_sequence: 99, event: 'memory_only' });
    const projection = await startEventStreamProjection({ childStdin, eventHub: hub, host: '127.0.0.1', port: 0, eventsPath });
    const client = await connectWebSocket(projection.url);
    try {
      assert.equal((await client.nextJson()).event, 'websocket_connected');
      client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10, since_sequence: 1 } });
      const started = await client.nextJson();
      assert.equal(started.event, 'session_events_subscription_started');
      assert.equal(started.replay_source, 'events_jsonl');
      assert.equal(started.replay_count, 3);
      assert.deepEqual([(await client.nextJson()).payload.event_sequence, (await client.nextJson()).payload.event_sequence, (await client.nextJson()).payload.event_sequence], [2, 3, 4]);
      client.sendJson({ id: 'read-1', method: 'session.events.read', params: { before_sequence: 4, direction: 'backward', limit: 2 } });
      const read = await client.nextJson();
      assert.equal(read.event, 'session_events_read');
      assert.equal(read.source, 'events_jsonl');
      assert.deepEqual(read.events.map((event) => event.event_sequence), [2, 3]);
    } finally {
      client.close();
      projection.server.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('carrier runtime package boundary forbids agent-cli adapter imports', () => {
  const runtimePackage = JSON.parse(readFileSync(new URL('../../carrier-runtime/package.json', import.meta.url), 'utf8'));
  assert.equal(runtimePackage.dependencies?.['@narada2/agent-cli'], undefined);
  assert.equal(runtimePackage.exports?.['./compat-agent-cli-runtime-adapter'], undefined);
  const runtimeRoot = fileURLToPath(new URL('../../carrier-runtime', import.meta.url));
  const offending = walkFiles(join(runtimeRoot, 'src'))
    .filter((path) => /\.mjs$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return /@narada2\/agent-cli|compat-agent-cli-runtime-adapter/.test(text) ? [path] : [];
    });
  assert.deepEqual(offending, [], 'carrier-runtime must not import agent-cli or reintroduce the retired adapter');
});
test('carrier runtime package boundary keeps client attach strings in projection registry', () => {
  const runtimeRoot = fileURLToPath(new URL('../../carrier-runtime', import.meta.url));
  const offending = walkFiles(join(runtimeRoot, 'src'))
    .filter((path) => /\.mjs$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return /narada-agent-web-ui|narada-agent-cli --attach|agent_web_ui:|agent_cli:/.test(text) ? [path] : [];
    });
  assert.deepEqual(offending, [], 'carrier-runtime must consume registry-backed attach commands instead of hardcoding client projection command strings');
});
test('runtime event helpers are exported from the canonical runtime-server helper module', () => {
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
      assert.notEqual(canonicalHelper(event), undefined, `${helperName} did not accept ${event?.event ?? 'null'}`);
    }
  }
});

test('agent-web-ui launch host renderer does not present agent-cli projection text', () => {
  const rendered = formatHostStatusEvent({
    event: 'session_started',
    agent_id: 'resident',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'sonar' },
      local_agent_id: 'resident',
      role: 'resident',
      canonical_agent_id: 'sonar.resident',
      display: 'sonar.resident',
      legacy_agent_id: 'resident',
    },
    session_id: 'runtime-web-ui-host-test',
    operator_surface_kind: 'agent-web-ui',
    provider: 'codex-subscription',
    model: 'gpt-5.5',
    mcp_server_count: 15,
    mcp_operational_state: 'healthy',
    health_endpoint: 'http://127.0.0.1:12345/health',
    event_endpoint: 'ws://127.0.0.1:12346/events',
  }).join('\n');
  assert.match(rendered, /agent-runtime-server: sonar\.resident/);
  assert.doesNotMatch(rendered, /agent-runtime-server: resident/);
  assert.match(rendered, /Surface agent-web-ui/);
  assert.match(rendered, /Launch   narada-agent-web-ui --event-endpoint ws:\/\/127\.0\.0\.1:12346\/events --health-endpoint http:\/\/127\.0\.0\.1:12345\/health/);
  assert.equal(rendered.includes('agent-cli:'), false);
  assert.equal(rendered.includes('operator >'), false);
});

function walkFiles(root) {
  const entries = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walkFiles(path));
    else entries.push(path);
  }
  return entries;
}

test('runtime server package boundary forbids direct agent-cli imports', () => {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  assert.equal(packageJson.dependencies['@narada2/agent-cli'], undefined);
  const offending = walkFiles(join(packageRoot, 'src'))
    .filter((path) => /\.mjs$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return /from ['"]@narada2\/agent-cli|import\(['"]@narada2\/agent-cli/.test(text) ? [path] : [];
    });
  assert.deepEqual(offending, [], 'agent-runtime-server must not import @narada2/agent-cli directly; use runtime-owned packages or explicit adapter packages');
});

test('runtime server creates a governed delegated authority handoff for the carrier substrate', () => {
  assert.deepEqual(createDelegatedAuthorityHandoff({
    args: ['--identity', 'narada.test', '--session', 'runtime-package-test'],
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
      package: '@narada2/carrier-runtime',
      mode: 'in-process',
    },
    generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'narada' },
      local_agent_id: 'test',
      role: 'test',
      canonical_agent_id: 'narada.test',
      display: 'narada.test',
      legacy_agent_id: 'narada.test',
    },
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

test('lifecycle binding derives site-qualified identity ref for role-local launch identity', () => {
  const binding = lifecycleBindingFromArgs(['--identity', 'resident', '--session', 'runtime-package-test'], {
    NARADA_SITE_ROOT: 'D:/code/narada.sonar',
    NARADA_SITE_ID: 'sonar',
    NARADA_AGENT_ROLE: 'resident',
    NARADA_AGENT_START_EVENT_ID: 'evt_test',
  });
  assert.equal(binding.agent_identity_ref.schema, 'narada.agent_identity_ref.v2');
  assert.equal(binding.agent_identity_ref.identity_scope.site_id, 'sonar');
  assert.equal(binding.agent_identity_ref.local_agent_id, 'resident');
  assert.equal(binding.agent_identity_ref.canonical_agent_id, 'sonar.resident');
  assert.equal(binding.agent_identity_ref.legacy_agent_id, 'resident');
});

test('runtime server derives delegated write authority from worker argv when no env authority ref exists', () => {
  assert.deepEqual(createDelegatedAuthorityHandoff({
    args: ['--identity', 'narada.test', '--session', 'runtime-package-test', '--authority', 'write'],
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
      package: '@narada2/carrier-runtime',
      mode: 'in-process',
    },
    generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'narada' },
      local_agent_id: 'test',
      role: 'test',
      canonical_agent_id: 'narada.test',
      display: 'narada.test',
      legacy_agent_id: 'narada.test',
    },
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

test('event hub assigns monotonic sequences when incoming events collide with current cursor', () => {
  const hub = createEventHub({ maxBuffer: 10 });
  assert.equal(hub.publish({ event_sequence: 47, sequence: 47, event: 'assistant_message', content: 'artifact presented' }).event_sequence, 47);
  assert.equal(hub.publish({ event_sequence: 47, sequence: 47, event: 'tool_result', tool: 'artifact_present' }).event_sequence, 48);
  assert.equal(hub.publish({ event_sequence: 46, sequence: 46, event: 'assistant_message', content: 'late provider aggregate' }).event_sequence, 49);
  assert.deepEqual(hub.replayFor({ maxReplay: 10 }).map((event) => event.event_sequence), [47, 48, 49]);
  assert.deepEqual(hub.cursor(), { last_sequence: 49, next_sequence: 50 });
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
  const writtenFrameCount = () => written.trim().split(/\r?\n/).filter(Boolean).length;
  const waitForWrittenFrameCount = (count) => new Promise((resolve) => {
    if (writtenFrameCount() >= count) {
      resolve();
      return;
    }
    const onData = () => {
      if (writtenFrameCount() >= count) {
        childStdin.off('data', onData);
        resolve();
      }
    };
    childStdin.on('data', onData);
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
    await waitForWrittenFrameCount(1);
    assert.equal(JSON.parse(written.trim().split(/\r?\n/).at(-1)).method, 'session.status');
    client.sendJson({ id: 'input-1', method: 'conversation.send', params: { message: 'run startup sequence', source: 'agent-web-ui' } });
    await waitForWrittenFrameCount(2);
    const inputFrame = JSON.parse(written.trim().split(/\r?\n/).at(-1));
    assert.equal(inputFrame.method, 'conversation.send');
    assert.deepEqual(inputFrame.params, { message: 'run startup sequence', source: 'agent-web-ui' });
    client.sendJson({ id: 'tools-1', method: 'session.command.execute', params: { command: '/tools', value: 'mcp' } });
    await waitForWrittenFrameCount(3);
    const slashFrame = JSON.parse(written.trim().split(/\r?\n/).at(-1));
    assert.equal(slashFrame.method, 'session.command.execute');
    assert.deepEqual(slashFrame.params, { command: '/tools', value: 'mcp' });
  } finally {
    client.close();
    projection.server.close();
  }
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
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
  };
  const snapshot = formatWrapperStatusEvent({
    event: 'session_status',
    request_id: 'status-1',
    agent_id: 'resident',
    agent_identity_ref: agentIdentityRef,
    session_id: 'runtime-package-test',
    request_posture: 'clean',
    operational_posture: 'healthy',
    session_event_count: 2,
  });
  assert.equal(snapshot.schema, 'narada.agent_runtime_server.wrapper_event.v1');
  assert.equal(snapshot.event, 'session_status_snapshot');
  assert.equal(snapshot.source_event, 'session_status');
  assert.equal(snapshot.request_id, 'status-1');
  assert.equal(snapshot.agent_id, 'resident');
  assert.deepEqual(snapshot.agent_identity_ref, agentIdentityRef);
  assert.equal(snapshot.session_id, 'runtime-package-test');
  assert.equal(snapshot.request_posture, 'clean');
  assert.equal(snapshot.operational_posture, 'healthy');
  assert.equal(snapshot.session_event_count, 2);
});

test('lifecycle dispatcher maps NARS events to ordered hook calls', async () => {
  const observed = [];
  const payloads = [];
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    legacy_agent_id: 'resident',
  };
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
    handler[hook] = (payload) => {
      observed.push(`${hook}:${payload.event_kind ?? 'manual'}`);
      payloads.push(payload);
    };
  }
  const dispatcher = createNarsLifecycleHookDispatcher({ hooks: [handler], clock: () => '2026-06-23T00:00:00.000Z' });
  await dispatchNarsLifecycleHook(dispatcher, 'beforeSessionBind', {
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
  });
  const baseEvent = {
    agent_id: 'resident',
    agent_identity_ref: agentIdentityRef,
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
  assert.equal(payloads[1].agent_id, 'resident');
  assert.deepEqual(payloads[1].agent_identity_ref, agentIdentityRef);
});

test('lifecycle dispatcher reports bounded redacted hook failures', async () => {
  const dispatcher = createNarsLifecycleHookDispatcher({
    hooks: [{ onToolCall: () => { throw new Error('API_KEY=abc123 failed'); } }],
    clock: () => '2026-06-23T00:00:00.000Z',
  });
  const result = await dispatchNarsLifecycleHooksForEvent(dispatcher, {
    event: 'tool_call',
    agent_id: 'resident',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'sonar' },
      local_agent_id: 'resident',
      role: 'resident',
      canonical_agent_id: 'sonar.resident',
      display: 'sonar.resident',
      legacy_agent_id: 'resident',
    },
    session_id: 'runtime-package-test',
    request_id: 'input_test',
    turn_id: 'turn_test',
    timestamp: '2026-06-23T00:00:00.000Z',
  });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].code, 'nars_lifecycle_hook_failed');
  assert.equal(result.failures[0].agent_identity_ref.canonical_agent_id, 'sonar.resident');
  assert.equal(result.failures[0].error.message.includes('abc123'), false);
  assert.equal(result.failures[0].error.message.includes('<redacted>'), true);
});

test('lifecycle binding is derived from runtime args before session bind', () => {
  const binding = lifecycleBindingFromArgs(['--identity', 'narada.test', '--session', 'runtime-package-test'], {
    NARADA_SITE_ROOT: 'D:/code/narada.test',
    NARADA_AGENT_START_EVENT_ID: 'evt_test',
  });
  assert.deepEqual({
    ...binding,
  }, {
    agent_id: 'narada.test',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'narada' },
      local_agent_id: 'test',
      role: 'test',
      canonical_agent_id: 'narada.test',
      display: 'narada.test',
      legacy_agent_id: 'narada.test',
    },
    session_id: 'runtime-package-test',
    metadata: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
    },
  });
  assert.equal(binding.agent_identity_ref.schema, 'narada.agent_identity_ref.v2');
  assert.equal(binding.agent_identity_ref.identity_scope.site_id, 'narada');
  assert.equal(binding.agent_identity_ref.local_agent_id, 'test');
  assert.equal(binding.agent_identity_ref.canonical_agent_id, 'narada.test');
  assert.equal(binding.agent_identity_ref.legacy_agent_id, 'narada.test');
});

test('lifecycle binding refuses missing or contradictory launch binding', () => {
  assert.throws(
    () => lifecycleBindingFromArgs(['--identity', 'narada.test'], { NARADA_SITE_ROOT: 'D:/code/narada.test' }),
    /missing_nars_binding:session_id/,
  );
  assert.throws(
    () => lifecycleBindingFromArgs(['--identity', 'narada.test', '--session', 'runtime-package-test'], {}),
    /missing_nars_binding:site_root/,
  );
  assert.throws(
    () => lifecycleBindingFromArgs(['--identity', 'narada.test', '--session', 'runtime-package-test', '--site-root', 'D:/code/one'], {
      NARADA_SITE_ROOT: 'D:/code/two',
    }),
    /contradictory_nars_binding:site_root/,
  );
});

test('HTTP /health projects compact native session.health response by default', async () => {
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
      mcp_tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      mcp: {
        operational_state: 'healthy',
        server_count: 1,
        tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      },
    });
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.schema, 'narada.nars.health.v1');
    assert.equal(body.status, 'healthy');
    assert.equal(body.agent_id, 'narada.test');
    assert.equal(body.mcp_tools, undefined);
    assert.equal(body.mcp.tools, undefined);
    assert.equal(body.mcp.server_count, 1);
  } finally {
    projection.server.close();
  }
});

test('HTTP /health?detail=full preserves native session.health diagnostic payload', async () => {
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
      const request = httpRequest(`${projection.url}?detail=full`, (response) => {
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
    projection.observe({
      event: 'session_health',
      request_id: frame.id,
      schema: 'narada.nars.health.v1',
      status: 'healthy',
      mcp_tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      mcp: {
        operational_state: 'healthy',
        server_count: 1,
        tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      },
    });
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.mcp_tools.length, 1);
    assert.equal(body.mcp.tools.length, 1);
  } finally {
    projection.server.close();
  }
});

test('HTTP artifact endpoints register and serve session-scoped HTML and audio artifacts', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-artifact-http-'));
  const sessionPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_artifact_http' }).narsSessionPath;
  const eventsPath = join(dirname(sessionPath), 'events.jsonl');
  const sourcePath = join(dirname(sessionPath), 'report.html');
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, '<!doctype html><h1>NARS Artifact</h1>', 'utf8');
  const childStdin = new PassThrough();
  const eventHub = createEventHub();
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'carrier_artifact_http' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'carrier_artifact_http.resident',
    display: 'carrier_artifact_http.resident',
    legacy_agent_id: 'resident',
  };
  const projection = await startHealthProjection({
    childStdin,
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 1000,
    runtimeContext: {
      identity: 'resident',
      agentIdentityRef,
      session: 'carrier_artifact_http',
      siteRoot,
      sessionPath,
      eventsPath,
      eventHub,
    },
  });
  try {
    const registeredResponse = await fetch(new URL('/sessions/carrier_artifact_http/artifacts', projection.url), {
      method: 'POST',
      body: JSON.stringify({ source_path: sourcePath, kind: 'html', title: 'Artifact report' }),
    });
    assert.equal(registeredResponse.status, 201);
    const registered = await registeredResponse.json();
    assert.equal(registered.artifact.title, 'Artifact report');
    assert.equal(registered.artifact.source_path, undefined);
    const artifactId = registered.artifact.artifact_id;

    const metadata = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${artifactId}`, projection.url)).then((response) => response.json());
    assert.equal(metadata.artifact.kind, 'html');
    assert.equal(metadata.artifact.render.sandbox.allow_top_navigation, false);

    const contentResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${artifactId}/content`, projection.url));
    assert.equal(contentResponse.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(contentResponse.headers.get('content-security-policy'), /sandbox/);
    assert.match(await contentResponse.text(), /NARS Artifact/);

    const presentedResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${artifactId}/message`, projection.url), {
      method: 'POST',
      body: JSON.stringify({ text: 'Here is the artifact.' }),
    });
    assert.equal(presentedResponse.status, 201);
    const presented = await presentedResponse.json();
    assert.equal(presented.status, 'presented');
    assert.equal(presented.event.event, 'assistant_message');
    assert.deepEqual(presented.event.agent_identity_ref, agentIdentityRef);
    assert.deepEqual(presented.event.content, [
      { type: 'text', text: 'Here is the artifact.' },
      { type: 'artifact_ref', artifact_id: artifactId, kind: 'html', title: 'Artifact report', render_hint: 'inline' },
    ]);
    assert.equal(eventHub.replayFor({ filters: { event_kinds: ['assistant_message'] }, maxReplay: 10 }).at(-1).artifact_id, artifactId);
    const durableEvents = readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(durableEvents.at(-1).artifact_id, artifactId);

    const audioPath = join(dirname(sessionPath), 'spoken.wav');
    writeFileSync(audioPath, Buffer.from('RIFF____WAVEfmt data'));
    const audioRegisteredResponse = await fetch(new URL('/sessions/carrier_artifact_http/artifacts', projection.url), {
      method: 'POST',
      body: JSON.stringify({ source_path: audioPath, kind: 'audio', title: 'Spoken briefing' }),
    });
    assert.equal(audioRegisteredResponse.status, 201);
    const audioRegistered = await audioRegisteredResponse.json();
    assert.equal(audioRegistered.artifact.kind, 'audio');
    assert.equal(audioRegistered.artifact.content_type, 'audio/wav');
    assert.equal(audioRegistered.artifact.source_path, undefined);
    assert.equal(audioRegistered.artifact.render.media_controls, true);
    const audioArtifactId = audioRegistered.artifact.artifact_id;

    const audioContentResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${audioArtifactId}/content`, projection.url));
    assert.equal(audioContentResponse.headers.get('content-type'), 'audio/wav');
    assert.equal(audioContentResponse.headers.has('content-security-policy'), false);
    assert.equal(Buffer.from(await audioContentResponse.arrayBuffer()).toString('utf8'), 'RIFF____WAVEfmt data');

    const audioPresentedResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${audioArtifactId}/message`, projection.url), {
      method: 'POST',
      body: JSON.stringify({ text: 'Spoken version is ready.' }),
    });
    assert.equal(audioPresentedResponse.status, 201);
    const audioPresented = await audioPresentedResponse.json();
    assert.deepEqual(audioPresented.event.content, [
      { type: 'text', text: 'Spoken version is ready.' },
      { type: 'artifact_ref', artifact_id: audioArtifactId, kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' },
    ]);
  } finally {
    projection.server.close();
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('narada-owned entrypoint runs the carrier runtime in process', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-runtime-server-package-'));
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [
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
    child.stdin.write(`${JSON.stringify({ id: 'resume-1', method: 'session.resume', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'resume-wrong', method: 'session.resume', params: { session_id: 'other-session' } })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
    child.stdin.end();
    const exitCode = await new Promise((resolveExit) => child.on('exit', resolveExit));
    assert.equal(exitCode, 0, stderr);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(events[0].event, 'session_started');
    assert.equal(events[0].agent_id, 'narada.test');
    assert.equal(events[0].delegated_authority_handoff?.schema, 'narada.nars.delegated_authority_handoff.v1');
    assert.equal(events[0].delegated_authority_handoff?.crossing_regime, 'nars_runtime_server_to_carrier_substrate');
    assert.equal(events[0].delegated_authority_handoff?.target?.package, '@narada2/carrier-runtime');
    assert.equal(events[0].delegated_authority_handoff?.target?.mode, 'in-process');
    assert.equal(events[0].delegated_authority_handoff?.agent_id, 'narada.test');
    assert.equal(events[0].delegated_authority_handoff?.agent_identity_ref?.schema, 'narada.agent_identity_ref.v2');
    assert.equal(events[0].delegated_authority_handoff?.session_id, 'runtime-package-test');
    assert.equal(events[0].delegated_authority_ref, 'task:1328');
    assert.match(events[0].health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.match(events[0].event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
    assert.equal(events[0].attach_commands.agent_cli, `narada-agent-cli --attach ${events[0].event_endpoint}`);
    assert.equal(events[0].attach_commands.agent_tui, `agent-tui --attach ${events[0].event_endpoint}`);
    assert.equal(events[0].attach_commands.agent_web_ui, `narada-agent-web-ui --event-endpoint ${events[0].event_endpoint} --health-endpoint ${events[0].health_endpoint}`);
    assert.match(events[0].attach_commands.operator_input_protocol, /conversation\.send/);
    assert.match(events[0].attach_commands.slash_command_protocol, /session\.command\.execute/);
    assert.equal(events.some((event) => event.event === 'session_status' && event.request_id === 'status-1'), true);
    assert.equal(events.some((event) => event.event === 'session_resume' && event.request_id === 'resume-1'), true);
    assert.equal(events.some((event) => event.event === 'error' && event.request_id === 'resume-wrong' && event.code === 'session_mismatch'), true);
    assert.equal(events.some((event) => event.event === 'session_closed' && event.request_id === 'close-1'), true);
    assert.equal(stderr.includes('Fatal error'), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
