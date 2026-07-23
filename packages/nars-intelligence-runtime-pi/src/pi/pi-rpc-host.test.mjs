import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPiRpcHost } from './pi-rpc-host.mjs';

const fixture = fileURLToPath(new URL('../../test/fixtures/pi-rpc-fixture.mjs', import.meta.url));

test('Pi RPC host correlates JSONL requests and normalizes events', async () => {
  const events = [];
  const host = createPiRpcHost({ command: process.execPath, args: [fixture], piVersion: 'fixture-1.0.0' });
  const started = await host.start({ session_id: 'session-rpc', agent_id: 'agent-rpc' });
  assert.equal(started.negotiation.mode, 'rpc');
  const response = await host.runTurn({ turn_id: 'turn-rpc', messages: [{ role: 'user', content: 'hi' }] }, (event) => events.push(event));
  assert.equal(response.response.choices[0].message.content, 'rpc-ok');
  assert.match(response.pi_request_id, /^pi-rpc-/);
  assert.equal(events[0].kind, 'assistant_token');
  await host.close();
});

test('Pi RPC preserves an authenticated provider refusal without treating it as success', async () => {
  const host = createPiRpcHost({
    command: process.execPath,
    args: [fixture],
    env: { PI_RPC_FIXTURE_AUTH_ERROR: '1' },
    piVersion: 'fixture-1.0.0',
  });
  await host.start({ session_id: 'session-auth-failure', agent_id: 'agent-auth-failure' });
  await assert.rejects(host.runTurn({ turn_id: 'auth-failure-turn', messages: [] }), (error) => {
    assert.equal(error.code, 'provider_auth_failed');
    assert.match(error.message, /authentication rejected/);
    return true;
  });
  await host.close();
});

test('Pi RPC turns a dropped child response into a bounded transport timeout', async () => {
  const host = createPiRpcHost({
    command: process.execPath,
    args: [fixture],
    env: { PI_RPC_FIXTURE_DROP_RESPONSE: '1' },
    piVersion: 'fixture-1.0.0',
    requestTimeoutMs: 1000,
  });
  await host.start({ session_id: 'session-timeout', agent_id: 'agent-timeout' });
  await assert.rejects(host.runTurn({ turn_id: 'timeout-turn', messages: [] }), /pi_rpc_request_timeout/);
  assert.equal(host.health().rpc_process_alive, false);
  await host.close();
});

test('Pi RPC host fails closed on malformed JSONL', async () => {
  const host = createPiRpcHost({
    command: process.execPath,
    args: [fixture],
    env: { PI_RPC_FIXTURE_MALFORMED: '1' },
    piVersion: 'fixture-1.0.0',
    requestTimeoutMs: 1000,
  });
  await assert.rejects(host.start({ session_id: 'session-bad', agent_id: 'agent-bad' }), /pi_rpc_malformed_jsonl|pi_rpc_request_timeout/);
  await host.close();
});

test('Pi RPC host refuses unsafe turn command fields before spawning a provider request', async () => {
  const host = createPiRpcHost({ command: process.execPath, args: [fixture], piVersion: 'fixture-1.0.0' });
  await host.start({ session_id: 'session-unsafe', agent_id: 'agent-unsafe' });
  await assert.rejects(host.runTurn({ turn_id: 'unsafe-turn', command: 'bash' }), /pi_rpc_command_forbidden/);
  await host.close();
});

test('Pi RPC host refuses nested commands and native tool descriptors', async () => {
  const host = createPiRpcHost({ command: process.execPath, args: [fixture], piVersion: 'fixture-1.0.0' });
  await host.start({ session_id: 'session-unsafe-nested', agent_id: 'agent-unsafe-nested' });
  await assert.rejects(host.runTurn({ turn_id: 'unsafe-nested', provider_invocation: { command: 'shell' } }), /pi_rpc_command_forbidden/);
  await assert.rejects(host.runTurn({ turn_id: 'unsafe-native', tools: [{ name: 'bash' }] }), /pi_rpc_native_tool_forbidden/);
  await host.close();
});

test('Pi RPC routes an admitted tool call through the NARS gateway and returns non-confirming evidence', async () => {
  const events = [];
  const invocations = [];
  const host = createPiRpcHost({
    command: process.execPath,
    args: [fixture],
    env: { PI_RPC_FIXTURE_TOOL_CALL: '1' },
    piVersion: 'fixture-1.0.0',
  });
  await host.start({ session_id: 'session-tool-rpc', agent_id: 'agent-tool-rpc' });
  const result = await host.runTurn({
    turn_id: 'turn-tool-rpc',
    input_id: 'input-tool-rpc',
    tools: [{ type: 'function', function: { name: 'rpc_read' }, nars_gateway_proxy: true }],
  }, (event) => events.push(event), {
    async execute(request) {
      invocations.push(request);
      return { status: 'completed', result: { value: 'read-only' }, effect_confirmation: 'not-confirmed' };
    },
  });
  assert.equal(result.response.choices[0].message.content, 'rpc-tool-ok');
  assert.equal(invocations[0].tool_name, 'rpc_read');
  assert.deepEqual(invocations[0].arguments, { value: 'fixture' });
  assert.equal(events[0].kind, 'tool_call');
  assert.equal(result.tool_result.effect_confirmation, 'not-confirmed');
  await host.close();
});

test('Pi RPC refuses unsafe steering and reconfiguration command fields', async () => {
  const host = createPiRpcHost({ command: process.execPath, args: [fixture], piVersion: 'fixture-1.0.0' });
  await host.start({ session_id: 'session-unsafe-controls', agent_id: 'agent-unsafe-controls' });
  await assert.rejects(host.steer({ input_id: 'unsafe-steer', content: { command: 'bash' } }), /pi_rpc_command_forbidden/);
  await assert.rejects(host.reconfigure({ command: 'shell' }), /pi_rpc_command_forbidden/);
  await host.close();
});

test('Pi RPC host refuses launch flags that enable ambient Pi state or native tools', () => {
  assert.throws(
    () => createPiRpcHost({
      command: process.execPath,
      args: ['--mode', 'rpc', '--session-dir', 'C:\\user\\pi-sessions'],
      piVersion: 'fixture-1.0.0',
    }),
    /pi_rpc_launch_flag_forbidden/,
  );
});

test('Pi RPC host restarts a crashed process without resending the uncertain turn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-pi-rpc-recovery-'));
  const crashOnceFile = join(root, 'crash-once');
  const requestLogFile = join(root, 'requests.jsonl');
  const host = createPiRpcHost({
    command: process.execPath,
    args: [fixture],
    env: {
      PI_RPC_FIXTURE_CRASH_ONCE_FILE: crashOnceFile,
      PI_RPC_FIXTURE_REQUEST_LOG: requestLogFile,
    },
    piVersion: 'fixture-1.0.0',
    requestTimeoutMs: 1000,
  });
  await host.start({ session_id: 'session-recovery', agent_id: 'agent-recovery' });
  await assert.rejects(
    host.runTurn({ turn_id: 'uncertain-turn', messages: [] }),
    /pi_rpc_process_exit/,
  );
  assert.equal(host.health().rpc_process_alive, false);

  const recovery = await host.recover();
  assert.equal(recovery.process_restarted, true);
  const result = await host.runTurn({ turn_id: 'fresh-turn', messages: [] });
  assert.equal(result.response.choices[0].message.content, 'rpc-ok');

  const turnRequests = readFileSync(requestLogFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((request) => request.method === 'turn')
    .map((request) => request.params.turn_id);
  assert.deepEqual(turnRequests, ['uncertain-turn', 'fresh-turn']);
  await host.close();
});

test('Pi RPC recovery restarts with the exact admitted provider binding', async () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-pi-rpc-reconfigure-recovery-'));
  const crashOnceFile = join(root, 'crash-once');
  const requestLogFile = join(root, 'requests.jsonl');
  const host = createPiRpcHost({
    command: process.execPath,
    args: [fixture],
    env: {
      PI_RPC_FIXTURE_CRASH_ONCE_FILE: crashOnceFile,
      PI_RPC_FIXTURE_REQUEST_LOG: requestLogFile,
    },
    piVersion: 'fixture-1.0.0',
    requestTimeoutMs: 1000,
  });
  await host.start({
    session_id: 'session-reconfigure-recovery',
    agent_id: 'agent-reconfigure-recovery',
    provider: 'initial-provider',
    model: 'initial-model',
    thinking: 'low',
  });
  await host.reconfigure({ provider: 'admitted-provider', model: 'admitted-model', thinking: 'high' });
  await assert.rejects(
    host.runTurn({ turn_id: 'uncertain-after-reconfigure', messages: [] }),
    /pi_rpc_process_exit/,
  );
  await host.recover();

  const starts = readFileSync(requestLogFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((request) => request.method === 'start');
  assert.equal(starts.at(-1).params.provider, 'admitted-provider');
  assert.equal(starts.at(-1).params.model, 'admitted-model');
  assert.equal(starts.at(-1).params.thinking, 'high');
  await host.close();
});
