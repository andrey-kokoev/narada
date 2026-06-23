import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agentCliBinPath,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  lifecycleBindingFromArgs,
} from '../src/server-wrapper.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('package owns the Narada agent runtime server bins and exports', () => {
  assert.equal(packageJson.name, '@narada2/agent-runtime-server');
  assert.equal(packageJson.bin['narada-agent-runtime-server'], './bin/narada-agent-runtime-server.mjs');
  assert.equal(packageJson.bin['agent-runtime-server'], './bin/narada-agent-runtime-server.mjs');
  assert.equal(packageJson.exports['.'], './src/server-wrapper.mjs');
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

test('narada-owned entrypoint delegates server mode to agent-cli', async () => {
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
    assert.equal(events.some((event) => event.event === 'session_status' && event.request_id === 'status-1'), true);
    assert.equal(events.some((event) => event.event === 'session_closed' && event.request_id === 'close-1'), true);
    assert.equal(stderr.includes('Fatal error'), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
