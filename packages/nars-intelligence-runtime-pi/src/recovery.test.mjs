import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createNarsPiRpcKernel, createNarsPiSdkKernel } from './kernel.mjs';
import { createPiSdkHost } from './pi/pi-sdk-host.mjs';

const rpcFixture = fileURLToPath(new URL('../test/fixtures/pi-rpc-fixture.mjs', import.meta.url));

const noCapabilityGateway = Object.freeze({
  toolCatalog: async () => [],
  invoke: async ({ toolName }) => ({ status: 'denied', admission_action: 'deny', execution_outcome: 'not_attempted', tool_name: toolName }),
  close: async () => {},
});

test('Pi host failure leaves a failed kernel that recovers from NARS records without redispatch', async () => {
  let providerCalls = 0;
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-sdk-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn() {
      providerCalls += 1;
      throw Object.assign(new Error('Pi process crashed'), { code: 'pi_process_crash' });
    },
    async cancel() { return { requested: false }; },
    async reconfigure(config) { return { active: config }; },
    async close() {},
    health() { return { pi_version: 'fixture-sdk-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    providerAdapter: { invoke: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }) },
    host,
  });
  await kernel.start({ session_id: 'recovery-session', agent_id: 'recovery-agent' });
  await assert.rejects(
    kernel.runTurn({ turn_id: 'crashed-turn', input_id: 'crashed-input', messages: [] }, async () => {}, noCapabilityGateway),
    /Pi process crashed/,
  );
  assert.equal(providerCalls, 1);
  assert.equal((await kernel.inspect()).kernel_state, 'failed');
  const recovery = await kernel.recover({
    sessionSnapshot: { session_id: 'recovery-session' },
    journalEvents: [{ event: 'user_message', content: 'recover me' }],
    turn: { turn_id: 'recovered-turn', messages: [] },
  });
  assert.equal(recovery.canonical_history_reconstructable, true);
  assert.equal(recovery.pi_continuation_discarded, true);
  assert.equal((await kernel.inspect()).kernel_state, 'ready');
  assert.equal(providerCalls, 1, 'recovery must not redispatch the crashed turn');
  await kernel.close();
});

test('an explicitly supplied Pi SDK cannot silently fall back to the compatibility host', async () => {
  const host = createPiSdkHost({
    sdk: {},
    piVersion: 'fixture-sdk-1.0.0',
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  await assert.rejects(
    host.start({ session_id: 'sdk-session', agent_id: 'sdk-agent' }),
    /pi_sdk_operations_missing/,
  );
  await host.close();
});

test('the SDK host can fail closed when compatibility fallback is disabled', async () => {
  const host = createPiSdkHost({
    fallbackToCompatibilityHost: false,
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'must-not-run' } }),
  });
  await assert.rejects(
    host.start({ session_id: 'sdk-required-session', agent_id: 'sdk-required-agent' }),
    /pi_sdk_unavailable/,
  );
  await host.close();
});

test('an injected SDK session factory is used as the Pi cognition host', async () => {
  let factoryCalls = 0;
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-1.0.0',
    sessionFactory: async () => {
      factoryCalls += 1;
      return {
        async runTurn() {
          return { admission: 'acknowledged', response: { content: 'factory-ok' } };
        },
      };
    },
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  await host.start({ session_id: 'factory-session', agent_id: 'factory-agent' });
  const result = await host.runTurn({ turn_id: 'factory-turn' });
  assert.equal(result.response.content, 'factory-ok');
  assert.equal(factoryCalls, 1);
  await host.close();
});

test('an SDK-shaped session factory envelope is unwrapped behind the host boundary', async () => {
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-1.0.0',
    sessionFactory: async () => ({
      session: {
        async runTurn() {
          return { admission: 'acknowledged', response: { content: 'enveloped-factory-ok' } };
        },
      },
      diagnostics: { ignored: true },
    }),
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  await host.start({ session_id: 'factory-envelope-session', agent_id: 'factory-envelope-agent' });
  const result = await host.runTurn({ turn_id: 'factory-envelope-turn' });
  assert.equal(result.response.content, 'enveloped-factory-ok');
  await host.close();
});

test('the SDK host refuses an injected session that exposes native tools', async () => {
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-unsafe-1.0.0',
    sessionFactory: async () => ({
      agent: { state: { tools: [{ name: 'bash' }] } },
      async runTurn() { return { admission: 'acknowledged', response: { content: 'must-not-run' } }; },
    }),
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  await assert.rejects(
    host.start({ session_id: 'unsafe-session', agent_id: 'unsafe-agent' }),
    /pi_sdk_native_tool_exposed/,
  );
  await host.close();
});

test('the SDK host refuses corrupted disposable continuation state', async () => {
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-corrupt-1.0.0',
    sessionFactory: async () => ({
      agent: { state: { messages: { corrupted: true } } },
      async runTurn() { return { admission: 'acknowledged', response: { content: 'must-not-run' } }; },
    }),
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  await assert.rejects(
    host.start({ session_id: 'corrupt-session', agent_id: 'corrupt-agent' }),
    /pi_sdk_continuation_state_invalid/,
  );
  await host.close();
});

test('Pi capability negotiation fails closed for an unsupported event vocabulary', async () => {
  const host = Object.freeze({
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-sdk-future-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
          supported_event_kinds: ['future_pi_event_v99'],
        },
      };
    },
    async close() {},
    health() { return { pi_version: 'fixture-sdk-future-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    providerAdapter: { invoke: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }) },
    host,
  });
  await assert.rejects(
    kernel.start({ session_id: 'future-session', agent_id: 'future-agent' }),
    /pi_capability_negotiation_failed/,
  );
  assert.equal((await kernel.inspect()).kernel_state, 'failed');
});

test('the SDK host refuses a contradictory admitted provider/model binding', async () => {
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-contradictory-1.0.0',
    sessionFactory: async () => ({
      async runTurn() { return { admission: 'acknowledged', response: { content: 'must-not-run' } }; },
    }),
    runtimeConfig: {
      modelObject: {
        id: 'model:admitted-model',
        provider: 'inference-provider:other-provider',
        api: 'openai-completions',
      },
    },
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  await assert.rejects(
    host.start({
      session_id: 'contradictory-session',
      agent_id: 'contradictory-agent',
      provider: 'admitted-provider',
      model: 'admitted-model',
    }),
    /pi_provider_model_contradictory/,
  );
  await host.close();
});

test('a prompt-based SDK session receives the admitted context and normalizes SDK events', async () => {
  let promptInput = null;
  let gatewayInvocation = null;
  let unsubscribeCalls = 0;
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-1.0.0',
    sessionFactory: async () => ({
      session: {
        subscribe(listener) {
          listener({ kind: 'assistant_token', content: 'from-sdk' });
          return () => { unsubscribeCalls += 1; };
        },
        async prompt(prompt, options) {
          const toolResult = await options.customTools[0].execute('sdk-call-1', { note: 'x' });
          promptInput = { prompt, options, toolResult };
          return { admission: 'acknowledged', response: { content: 'prompt-ok' } };
        },
      },
    }),
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  const events = [];
  await host.start({ session_id: 'prompt-session', agent_id: 'prompt-agent' });
  const result = await host.runTurn({
    turn_id: 'prompt-turn',
    messages: [{ role: 'user', content: 'hello prompt' }],
    tools: [{ type: 'function', function: { name: 'read_note' }, nars_gateway_proxy: true }],
    provider_invocation: {
      inferenceProvider: { id: 'inference-provider:admitted-provider' },
      offering: { invocation_model_key: 'admitted-model' },
      plan: { options: { thinking: 'high' } },
    },
    capability_gateway: {
      invoke: async (request) => {
        gatewayInvocation = request;
        return { status: 'completed', result: { ok: true } };
      },
    },
  }, (event) => events.push(event));
  assert.equal(result.response.content, 'prompt-ok');
  assert.equal(promptInput.prompt, 'hello prompt');
  assert.equal(promptInput.options.messages[0].content, 'hello prompt');
  assert.deepEqual(promptInput.options.tools, ['read_note']);
  assert.equal(promptInput.options.customTools[0].name, 'read_note');
  assert.equal(promptInput.options.customTools[0].nars_gateway_proxy, true);
  assert.equal(promptInput.toolResult.isError, false);
  assert.equal(gatewayInvocation.toolCallId, 'sdk-call-1');
  assert.equal(gatewayInvocation.toolName, 'read_note');
  assert.deepEqual({
    provider: promptInput.options.provider,
    model: promptInput.options.model,
    thinking: promptInput.options.thinking,
  }, {
    provider: 'inference-provider:admitted-provider',
    model: 'admitted-model',
    thinking: 'high',
  });
  assert.equal(events[0].kind, 'assistant_token');
  assert.equal(unsubscribeCalls, 1);
  await host.close();
});

test('prompt-based SDK completion is projected back as provider output without making SDK events canonical', async () => {
  const host = createPiSdkHost({
    piVersion: 'fixture-sdk-1.0.0',
    sessionFactory: async () => ({
      session: {
        subscribe(listener) {
          listener({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'from ' } });
          listener({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'events' } });
          listener({ type: 'message_end', message: { role: 'assistant', content: 'from events' } });
          return () => {};
        },
        async prompt() {},
      },
    }),
    providerInvoker: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }),
  });
  const events = [];
  await host.start({ session_id: 'event-session', agent_id: 'event-agent' });
  const result = await host.runTurn({ turn_id: 'event-turn', messages: [{ role: 'user', content: 'hello' }] }, (event) => events.push(event));
  assert.equal(result.response.choices[0].message.content, 'from events');
  assert.equal(events[0].type, 'message_update');
  await host.close();
});

test('Pi recovery is refused while a turn is still active', async () => {
  let release;
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-sdk-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn() {
      await new Promise((resolve) => { release = resolve; });
      return { admission: 'acknowledged', response: { content: 'released' } };
    },
    async cancel() { release?.(); return { requested: true }; },
    async close() {},
    health() { return { pi_version: 'fixture-sdk-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    providerAdapter: { invoke: async () => ({ admission: 'acknowledged', response: { content: 'unused' } }) },
    host,
  });
  await kernel.start({ session_id: 'active-recovery-session', agent_id: 'active-recovery-agent' });
  const turn = kernel.runTurn({ turn_id: 'active-recovery-turn', input_id: 'active-recovery-input' }, async () => {}, noCapabilityGateway);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(kernel.recover(), /pi_recovery_turn_active/);
  await kernel.cancel({ reason: 'active_recovery_test_cleanup' });
  await turn;
  await kernel.close();
});

test('Pi RPC kernel recovery reconstructs the host without redispatching an uncertain turn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-pi-rpc-kernel-recovery-'));
  const crashOnceFile = join(root, 'crash-once');
  const requestLogFile = join(root, 'requests.jsonl');
  const kernel = createNarsPiRpcKernel({
    rpc: {
      command: process.execPath,
      args: [rpcFixture],
      env: {
        PI_RPC_FIXTURE_VERSION: 'fixture-rpc-1.0.0',
        PI_RPC_FIXTURE_CRASH_ONCE_FILE: crashOnceFile,
        PI_RPC_FIXTURE_REQUEST_LOG: requestLogFile,
      },
      piVersion: 'fixture-rpc-1.0.0',
      // Recovery starts a fresh child after a crash. Keep this bounded, but
      // allow the full package suite's parallel Windows process startup
      // contention without turning a healthy restart into a false timeout.
      requestTimeoutMs: 5000,
    },
  });
  try {
    await kernel.start({ session_id: 'rpc-recovery-session', agent_id: 'rpc-recovery-agent' });
    await assert.rejects(
      kernel.runTurn({ turn_id: 'uncertain-turn', input_id: 'uncertain-input', messages: [] }, async () => {}, noCapabilityGateway),
      /pi_rpc_process_exit/,
    );
    assert.equal((await kernel.inspect()).kernel_state, 'failed');

    const evidence = await kernel.recover({
      sessionSnapshot: { session_id: 'rpc-recovery-session' },
      journalEvents: [{ event: 'user_message', content: 'uncertain' }],
    });
    assert.equal(evidence.host_recovery.process_restarted, true);
    assert.equal((await kernel.inspect()).kernel_state, 'ready');
    const result = await kernel.runTurn({ turn_id: 'fresh-turn', input_id: 'fresh-input', messages: [] }, async () => {}, noCapabilityGateway);
    assert.equal(result.response.choices[0].message.content, 'rpc-ok');

    const turnRequests = readFileSync(requestLogFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((request) => request.method === 'turn')
      .map((request) => request.params.turn_id ?? request.params.turnId);
    assert.deepEqual(turnRequests, ['uncertain-turn', 'fresh-turn']);
  } finally {
    await kernel.close({ reason: 'rpc_recovery_test_close' });
  }
});
