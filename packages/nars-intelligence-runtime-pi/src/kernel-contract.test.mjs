import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarsNativeKernel } from '@narada2/nars-intelligence-kernel-contract/native-kernel';
import { createNarsPiRpcKernel, createNarsPiSdkKernel } from './kernel.mjs';

function providerOutcome(content = 'contract-ok') {
  return {
    admission: 'acknowledged',
    transportSubmitted: true,
    response: { choices: [{ message: { role: 'assistant', content } }] },
  };
}

const noCapabilityGateway = Object.freeze({
  toolCatalog: async () => [],
  invoke: async ({ toolName }) => ({ status: 'denied', admission_action: 'deny', execution_outcome: 'not_attempted', tool_name: toolName }),
  close: async () => {},
});

function createRpcFixtureHost() {
  let closed = false;
  let started = false;
  return Object.freeze({
    mode: 'rpc',
    async start() {
      started = true;
      return {
        negotiation: {
          pi_version: 'fixture-rpc-1.0.0',
          mode: 'rpc',
          capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
          supported_event_kinds: ['assistant_token'],
        },
      };
    },
    async runTurn(input, eventSink) {
      assert.equal(started, true);
      await eventSink({ kind: 'assistant_token', id: `rpc-token:${input.turn_id}`, sequence: 1, content: 'ok' });
      return providerOutcome();
    },
    async steer() { return { accepted: false, reason: 'fixture' }; },
    async cancel() { return { requested: false, reason: 'fixture' }; },
    async reconfigure(config) { return { active: config }; },
    async close() { closed = true; },
    health() { return { pi_version: 'fixture-rpc-1.0.0', pi_mode: 'rpc', rpc_process_alive: !closed }; },
  });
}

async function runContractScenario(kernel) {
  const events = [];
  const methods = ['start', 'runTurn', 'steer', 'cancel', 'reconfigure', 'inspect', 'close'];
  for (const method of methods) assert.equal(typeof kernel[method], 'function', `${method} is required`);
  const started = await kernel.start({ session_id: 'contract-session', agent_id: 'contract-agent' });
  const result = await kernel.runTurn({
    turn_id: 'contract-turn',
    input_id: 'contract-input',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
  }, (event) => events.push(event), noCapabilityGateway);
  const healthBeforeClose = await kernel.inspect();
  const cancel = await kernel.cancel({ reason: 'idle_cancel' });
  const reconfigured = await kernel.reconfigure({
    admitted_plan: {
      selected: {
        model: { kind: 'model', id: 'model:contract' },
        inference_provider: { kind: 'inference-provider', id: 'inference-provider:contract' },
      },
      options: { thinking: 'high' },
    },
  });
  const closed = await kernel.close({ reason: 'contract_close' });
  assert.equal(result.terminal_state, 'completed');
  assert.equal(result.response.choices[0].message.content, 'contract-ok');
  assert.equal(started.session_id, 'contract-session');
  assert.equal(healthBeforeClose.kernel_state, 'ready');
  assert.equal(cancel.confirmed, true);
  assert.equal(reconfigured.accepted, true);
  assert.equal(closed.closed, true);
  assert.equal(events.some((event) => ['assistant_message', 'user_message', 'turn_complete'].includes(event.kind)), false);
  return {
    session_id: started.session_id,
    terminal_state: result.terminal_state,
    assistant: result.response.choices[0].message.content,
    canonical_event_kinds: events.filter((event) => typeof event.kind === 'string' && !event.kind.startsWith('pi_') && !event.kind.startsWith('kernel_')).map((event) => event.kind),
    health_fields: ['kernel_kind', 'kernel_version', 'kernel_state', 'active_turn_id', 'capability_profile'].every((field) => field in healthBeforeClose),
    terminal_closed: closed.closed,
  };
}

test('narada-native, Pi SDK, and Pi RPC satisfy one representation-neutral contract suite', async () => {
  const providerAdapter = { invoke: async () => providerOutcome() };
  const scenarios = await Promise.all([
    runContractScenario(createNarsNativeKernel({ providerAdapter })),
    runContractScenario(createNarsPiSdkKernel({ providerAdapter })),
    runContractScenario(createNarsPiRpcKernel({ host: createRpcFixtureHost() })),
  ]);
  for (const scenario of scenarios) {
    assert.deepEqual(scenario, {
      session_id: 'contract-session',
      terminal_state: 'completed',
      assistant: 'contract-ok',
      canonical_event_kinds: [],
      health_fields: true,
      terminal_closed: true,
    });
  }
});

