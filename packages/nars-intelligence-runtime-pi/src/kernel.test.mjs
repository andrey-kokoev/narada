import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntelligenceKernel, createNarsPiSdkKernel } from './kernel.mjs';

function providerResult(content = 'ok') {
  return { admission: 'acknowledged', transportSubmitted: true, response: { choices: [{ message: { role: 'assistant', content } }] } };
}

const noCapabilityGateway = Object.freeze({
  toolCatalog: async () => [],
  invoke: async ({ toolName }) => ({ status: 'denied', admission_action: 'deny', execution_outcome: 'not_attempted', tool_name: toolName }),
  close: async () => {},
});

test('Pi SDK kernel runs a turn through the admitted provider and normalizes observations', async () => {
  const events = [];
  let calls = 0;
  const kernel = createNarsPiSdkKernel({
    providerAdapter: { invoke: async (input) => { calls += 1; assert.equal(input.tools[0].function.name, 'read_note'); return providerResult('pi-ok'); } },
    now: () => '2026-07-21T00:00:00.000Z',
  });
  const started = await kernel.start({ session_id: 'session-1', agent_id: 'agent-1' });
  assert.equal(started.kernel_kind, 'pi-sdk');
  const result = await kernel.runTurn({
    turn_id: 'turn-1', input_id: 'input-1', messages: [{ role: 'user', content: 'hello' }],
    tools: [{ type: 'function', function: { name: 'read_note', parameters: { type: 'object' } }, nars_gateway_proxy: true }],
    provider_invocation: { plan: { id: 'plan-1' } },
  }, (event) => events.push(event), {
    toolCatalog: async () => [{ type: 'function', function: { name: 'read_note' }, nars_gateway_proxy: true }],
    invoke: async () => ({ status: 'completed', effect_confirmation: 'not-confirmed' }),
    close: async () => {},
  });
  assert.equal(result.terminal_state, 'completed');
  assert.equal(result.response.choices[0].message.content, 'pi-ok');
  assert.equal(calls, 1);
  assert.ok(events.some((event) => event.kind === 'pi_event_observed'));
  assert.equal(events.some((event) => event.kind === 'assistant_message'), false);
  const health = await kernel.inspect();
  assert.equal(health.continuation_state_present, true);
  assert.equal(health.compaction_state, 'idle');
  assert.deepEqual(health.supported_provider_features, ['streaming', 'tool-calls', 'retry', 'compaction-evidence']);
  assert.deepEqual(health.supported_thinking_levels, ['low', 'medium', 'high']);
  assert.equal(health.tool_posture_version, 'nars-gateway-only.v1');
  assert.equal(result.correlation.pi_session_id, 'session-1');
  assert.match(result.correlation.pi_request_id, /^pi-sdk:request:turn-1:attempt:1$/);
});

test('kernel refuses native tools before provider execution', async () => {
  let calls = 0;
  const kernel = createNarsPiSdkKernel({ providerAdapter: { invoke: async () => { calls += 1; return providerResult(); } } });
  await kernel.start({ session_id: 'session-2', agent_id: 'agent-2' });
  await assert.rejects(
    kernel.runTurn({ turn_id: 'turn-2', input_id: 'input-2', tools: [{ type: 'function', function: { name: 'bash' }, nars_gateway_proxy: true }] }, async () => {}, noCapabilityGateway),
    /pi_native_tool_forbidden/,
  );
  assert.equal(calls, 0);
});

test('Pi SDK kernel requires a complete NARS capability gateway before reserving a turn', async () => {
  const kernel = createNarsPiSdkKernel({ providerAdapter: { invoke: async () => providerResult() } });
  await kernel.start({ session_id: 'gateway-session', agent_id: 'gateway-agent' });
  await assert.rejects(
    kernel.runTurn({ turn_id: 'gateway-turn', input_id: 'gateway-input' }, async () => {}),
    /kernel_gateway_invalid/,
  );
  assert.equal((await kernel.inspect()).active_turn_id, null);
  await kernel.close();
});

test('Pi scalar model fields cannot overwrite the admitted NARS execution-resource graph', async () => {
  let adapterInput = null;
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-resource-preservation-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn(input) {
      return input.providerInvoker({
        ...input,
        provider: 'pi-scalar-provider',
        model: 'pi-scalar-model',
        thinking: 'low',
      });
    },
    async close() {},
    health() { return { pi_version: 'fixture-resource-preservation-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    host,
    providerAdapter: {
      async invoke(input) {
        adapterInput = input;
        return providerResult('resource-preserved');
      },
    },
  });
  const resources = {
    plan: { id: 'plan:admitted' },
    model: { kind: 'model', id: 'model:admitted' },
    modelProvider: { kind: 'model-provider', id: 'model-provider:admitted' },
    offering: { id: 'model-offering:admitted' },
    inferenceProvider: { kind: 'inference-provider', id: 'inference-provider:admitted' },
    endpoint: { kind: 'inference-endpoint', id: 'inference-endpoint:admitted' },
    adapter: { kind: 'adapter', id: 'adapter:admitted' },
    credential: { kind: 'credential-locator', id: 'credential-locator:admitted' },
  };
  await kernel.start({ session_id: 'resource-session', agent_id: 'resource-agent' });
  await kernel.runTurn({
    turn_id: 'resource-turn',
    input_id: 'resource-input',
    messages: [{ role: 'user', content: 'preserve' }],
    provider_invocation: resources,
  }, async () => {}, noCapabilityGateway);
  assert.deepEqual(adapterInput.model, resources.model);
  assert.deepEqual(adapterInput.modelProvider, resources.modelProvider);
  assert.deepEqual(adapterInput.offering, resources.offering);
  assert.deepEqual(adapterInput.inferenceProvider, resources.inferenceProvider);
  assert.deepEqual(adapterInput.endpoint, resources.endpoint);
  assert.deepEqual(adapterInput.adapter, resources.adapter);
  assert.deepEqual(adapterInput.credential, resources.credential);
  await kernel.close();
});

test('admitted provider stream metadata becomes normalized NARS stream evidence before Pi reduces it', async () => {
  const events = [];
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-stream-bridge-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn(input) {
      return input.providerInvoker({ ...input, turn_attempt: 2 });
    },
    async close() {},
    health() { return { pi_version: 'fixture-stream-bridge-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    host,
    providerAdapter: {
      async invoke() {
        return {
          admission: 'acknowledged',
          response: {
            choices: [{ message: { role: 'assistant', content: 'final' } }],
            narada_stream: [
              { content: 'partial', done: false, stream_id: 'stream-1' },
              { content: 'final', done: true, stream_id: 'stream-1' },
            ],
          },
        };
      },
    },
  });
  await kernel.start({ session_id: 'stream-session', agent_id: 'stream-agent' });
  await kernel.runTurn({ turn_id: 'stream-turn', input_id: 'stream-input' }, (event) => events.push(event), noCapabilityGateway);
  assert.deepEqual(events.filter((event) => event.kind === 'assistant_message_stream').map((event) => ({
    content: event.content,
    done: event.done,
    stream_index: event.stream_index,
    turn_attempt: event.turn_attempt,
  })), [
    { content: 'partial', done: false, stream_index: 0, turn_attempt: 2 },
    { content: 'final', done: true, stream_index: 1, turn_attempt: 2 },
  ]);
  await kernel.close();
});

test('Pi SDK provider errors remain failed NARS outcomes instead of assistant success', async () => {
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-failure-bridge-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn(input) {
      // Model-runtime-shaped hosts commonly turn this into a normal error
      // assistant message; the kernel must restore the provider outcome.
      await input.providerInvoker({ ...input });
      return { admission: 'acknowledged', response: { choices: [{ message: { role: 'assistant', content: '' } }] } };
    },
    async close() {},
    health() { return { pi_version: 'fixture-failure-bridge-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    host,
    providerAdapter: {
      async invoke() {
        return {
          admission: 'uncertain',
          transportSubmitted: true,
          error: { code: 'provider_503', message: 'fixture provider unavailable', retryable: true },
        };
      },
    },
  });
  await kernel.start({ session_id: 'failure-session', agent_id: 'failure-agent' });
  const result = await kernel.runTurn({ turn_id: 'failure-turn', input_id: 'failure-input' }, async () => {}, noCapabilityGateway);
  assert.equal(result.terminal_state, 'failed');
  assert.equal(result.provider_outcome.error.code, 'provider_503');
  await kernel.close();
});

test('provider retries do not create a new NARS turn attempt', async () => {
  const attempts = [];
  let calls = 0;
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-retry-attempt-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn(input) {
      attempts.push({ turn_attempt: input.turn_attempt, provider_request_attempt: input.provider_request_attempt });
      return input.providerInvoker(input);
    },
    async close() {},
    health() { return { pi_version: 'fixture-retry-attempt-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    host,
    maxRetryAttempts: 2,
    providerAdapter: {
      async invoke() {
        calls += 1;
        return calls === 1
          ? { admission: 'acknowledged', error: { code: 'retryable', message: 'try again', retryable: true } }
          : providerResult('retry-ok');
      },
    },
  });
  await kernel.start({ session_id: 'retry-attempt-session', agent_id: 'retry-attempt-agent' });
  const result = await kernel.runTurn({
    turn_id: 'retry-attempt-turn',
    input_id: 'retry-attempt-input',
    turn_attempt: 7,
  }, async () => {}, noCapabilityGateway);
  assert.equal(result.terminal_state, 'completed');
  assert.deepEqual(attempts, [
    { turn_attempt: 7, provider_request_attempt: 1 },
    { turn_attempt: 7, provider_request_attempt: 2 },
  ]);
  assert.equal(result.correlation.turn_attempt, 7);
  assert.equal(result.correlation.provider_request_attempt, 2);
  await kernel.close();
});

test('kernel projects the admitted gateway catalog when the turn carries no duplicate tool list', async () => {
  let observedTools = null;
  const kernel = createNarsPiSdkKernel({
    providerAdapter: {
      invoke: async (input) => {
        observedTools = input.tools;
        return providerResult('gateway-catalog-ok');
      },
    },
  });
  await kernel.start({ session_id: 'catalog-session', agent_id: 'catalog-agent' });
  await kernel.runTurn({ turn_id: 'catalog-turn', input_id: 'catalog-input' }, async () => {}, {
    toolCatalog: async () => [{ type: 'function', function: { name: 'read_note' }, nars_gateway_proxy: true }],
    invoke: async () => ({ status: 'completed' }),
    close: async () => {},
  });
  assert.equal(observedTools[0].function.name, 'read_note');
  assert.equal(observedTools[0].nars_gateway_proxy, true);
  await kernel.close();
});

test('Pi compaction observations become NARS-owned evidence without deleting canonical history', async () => {
  const events = [];
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-compaction-sdk-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async runTurn(_input, eventSink) {
      await eventSink({
        type: 'compaction_end',
        id: 'compaction-1',
        sequence: 1,
        retained_context_cursor: 'nars:cursor:1',
        summary_digest: 'sha256:summary',
        token_estimate: 42,
      });
      return providerResult('after-compaction');
    },
    async close() {},
    health() { return { pi_version: 'fixture-compaction-sdk-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({ providerAdapter: { invoke: async () => providerResult() }, host });
  await kernel.start({ session_id: 'compaction-session', agent_id: 'compaction-agent' });
  await kernel.runTurn({ turn_id: 'compaction-turn', input_id: 'compaction-input' }, (event) => events.push(event), noCapabilityGateway);
  const evidence = events.find((event) => event.kind === 'pi_compaction_evidence');
  assert.ok(evidence);
  assert.equal(evidence.retained_context_cursor, 'nars:cursor:1');
  assert.equal(evidence.canonical_history_deleted, false);
  assert.equal(evidence.accepted_by_nars, false);
  await kernel.close();
});

test('cancellation is evidence rather than an immediate completion claim', async () => {
  let resolveProvider;
  const kernel = createNarsPiSdkKernel({
    providerAdapter: { invoke: async ({ abortSignal }) => new Promise((resolve) => {
      resolveProvider = () => resolve(providerResult('late'));
      abortSignal.addEventListener('abort', () => resolve({ admission: 'uncertain', error: { code: 'aborted', message: 'aborted', retryable: false } }), { once: true });
    }) },
  });
  await kernel.start({ session_id: 'session-3', agent_id: 'agent-3' });
  const turn = kernel.runTurn({ turn_id: 'turn-3', input_id: 'input-3', messages: [{ role: 'user', content: 'wait' }] }, async () => {}, noCapabilityGateway);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const cancellation = await kernel.cancel({ reason: 'operator_cancel' });
  assert.equal(cancellation.confirmed, false);
  assert.equal((await turn).terminal_state, 'interrupted');
  resolveProvider?.();
});

test('reconfiguration is admitted only at a clean turn boundary and health is redacted', async () => {
  const kernel = createIntelligenceKernel({ kind: 'pi-sdk', providerAdapter: { invoke: async () => providerResult() } });
  await kernel.start({ session_id: 'session-4', agent_id: 'agent-4' });
  const result = await kernel.reconfigure({
    admitted_plan: {
      selected: {
        model: { kind: 'model', id: 'model:next' },
        inference_provider: { kind: 'inference-provider', id: 'inference-provider:next' },
      },
      options: { thinking: 'high' },
    },
  });
  assert.equal(result.accepted, true);
  const health = await kernel.inspect();
  assert.equal(health.kernel_kind, 'pi-sdk');
  assert.equal('api_key' in health, false);
  await kernel.close();
});

test('kernel reconfiguration consumes the exact admitted plan binding', async () => {
  const reconfigurations = [];
  const host = Object.freeze({
    mode: 'sdk',
    async start() {
      return {
        negotiation: {
          pi_version: 'fixture-reconfigure-sdk-1.0.0',
          mode: 'sdk',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        },
      };
    },
    async reconfigure(config) { reconfigurations.push(config); return { active: config }; },
    async close() {},
    health() { return { pi_version: 'fixture-reconfigure-sdk-1.0.0', pi_mode: 'sdk' }; },
  });
  const kernel = createNarsPiSdkKernel({
    host,
    providerAdapter: { invoke: async () => providerResult() },
    runtimeContext: { provider: 'inference-provider:old', model: 'model:old' },
  });
  await kernel.start({ session_id: 'reconfigure-plan-session', agent_id: 'reconfigure-plan-agent' });
  const result = await kernel.reconfigure({
    requested_options: { thinking: 'high' },
    admitted_plan: {
      selected: {
        model: { kind: 'model', id: 'model:admitted' },
        inference_provider: { kind: 'inference-provider', id: 'inference-provider:admitted' },
      },
      options: { thinking: 'high' },
    },
  });
  assert.equal(result.accepted, true);
  assert.equal(reconfigurations[0].provider, 'admitted');
  assert.equal(reconfigurations[0].model, 'admitted');
  assert.equal(reconfigurations[0].thinking, 'high');
  await kernel.close();
});
