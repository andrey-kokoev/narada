import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTELLIGENCE_KERNEL_KINDS,
  OPERATOR_SURFACE_KINDS,
  normalizeIntelligenceKernelKind,
  buildKernelHealthProjection,
  createNarsToolRound,
  NARS_TOOL_LOOP_OWNER,
  NARS_TOOL_ROUND_SCHEMA,
  NarsKernelContractError,
} from './index.mjs';
import { createNarsNativeKernel } from './native-kernel.mjs';

const noCapabilityGateway = Object.freeze({
  toolCatalog: async () => [],
  invoke: async ({ toolName }) => ({ status: 'denied', admission_action: 'deny', execution_outcome: 'not_attempted', tool_name: toolName }),
  close: async () => {},
});

test('kernel selection is independent from operator-surface selection', () => {
  assert.deepEqual(INTELLIGENCE_KERNEL_KINDS, ['narada-native', 'pi-sdk', 'pi-rpc']);
  assert.deepEqual(OPERATOR_SURFACE_KINDS, ['agent-cli', 'agent-tui', 'agent-web-ui', 'agent-pi-tui']);
  assert.equal(normalizeIntelligenceKernelKind('pi-sdk'), 'pi-sdk');
  assert.equal(normalizeIntelligenceKernelKind(undefined), 'narada-native');
  assert.throws(() => normalizeIntelligenceKernelKind('agent-pi-tui'), NarsKernelContractError);
});

test('native kernel satisfies the representation-neutral contract', async () => {
  const events = [];
  const kernel = createNarsNativeKernel({
    providerAdapter: { invoke: async () => ({ admission: 'acknowledged', response: { text: 'ok' } }) },
    now: () => '2026-07-21T00:00:00.000Z',
  });
  const start = await kernel.start({ session_id: 'session-1', agent_id: 'agent-1' });
  assert.equal(start.kernel_kind, 'narada-native');
  const result = await kernel.runTurn({ turn_id: 'turn-1', input_id: 'input-1', messages: [{ role: 'user', content: 'hi' }] }, (event) => events.push(event), noCapabilityGateway);
  assert.equal(result.terminal_state, 'completed');
  assert.deepEqual(result.response, { text: 'ok' });
  assert.equal((await kernel.inspect()).kernel_kind, 'narada-native');
  assert.ok(events.every((event) => event.kind !== 'assistant_message'));
  await kernel.close({ reason: 'test' });
  assert.equal((await kernel.inspect()).kernel_state, 'closed');
});

test('native kernel requires and applies the resolver-admitted provider/model binding', async () => {
  const kernel = createNarsNativeKernel({
    providerAdapter: { invoke: async () => ({ admission: 'acknowledged', response: { text: 'ok' } }) },
  });
  await kernel.start({ session_id: 'binding-session', agent_id: 'binding-agent' });

  const envelopeResult = await kernel.reconfigure({ admitted_plan: { plan: {} } });
  assert.deepEqual(envelopeResult, { accepted: false, reason: 'admitted_plan_binding_incomplete' });
  assert.equal((await kernel.health()).provider, null);

  const result = await kernel.reconfigure({
    admitted_plan: {
      selected: {
        inference_provider: { kind: 'inference-provider', id: 'inference-provider:kimi-code-api' },
        model: { kind: 'model', id: 'model:kimi-k2.7' },
      },
      options: { thinking: 'medium' },
    },
  });
  assert.deepEqual(result.active, { provider: 'kimi-code-api', model: 'kimi-k2.7', thinking: 'medium' });
  assert.equal((await kernel.health()).provider, 'kimi-code-api');
  assert.equal((await kernel.health()).model, 'kimi-k2.7');
  await kernel.close({ reason: 'binding-test' });
});

test('native kernel rejects duplicate gateway catalog names before provider execution', async () => {
  let providerCalls = 0;
  const duplicateTool = {
    type: 'function',
    function: { name: 'read_note', parameters: { type: 'object', properties: {} } },
    nars_gateway_proxy: true,
  };
  const gateway = {
    toolCatalog: async () => [duplicateTool, structuredClone(duplicateTool)],
    invoke: async () => ({ status: 'completed' }),
    close: async () => {},
  };
  const kernel = createNarsNativeKernel({
    providerAdapter: {
      invoke: async () => {
        providerCalls += 1;
        return { admission: 'acknowledged', response: { text: 'unexpected' } };
      },
    },
  });
  await kernel.start({ session_id: 'duplicate-session', agent_id: 'duplicate-agent' });
  await assert.rejects(
    () => kernel.runTurn({ turn_id: 'duplicate-turn', input_id: 'duplicate-input', messages: [] }, async () => {}, gateway),
    (error) => error instanceof NarsKernelContractError
      && error.code === 'native_gateway_catalog_duplicate_tool',
  );
  assert.equal(providerCalls, 0);
  await kernel.close({ reason: 'duplicate-catalog-test' });
});

test('tool rounds have one carrier-owned authority for native and Pi adapters', () => {
  const gateway = {
    toolCatalog: async () => [],
    invoke: async () => ({ status: 'completed' }),
    close: async () => {},
  };
  const round = createNarsToolRound({
    turn: {
      turn_id: 'round-turn',
      input_id: 'round-input',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    },
    capabilityGateway: gateway,
    providerRequestAttempt: 2,
  });
  assert.equal(round.schema, NARS_TOOL_ROUND_SCHEMA);
  assert.equal(round.owner, NARS_TOOL_LOOP_OWNER);
  assert.equal(round.provider_request_attempt, 2);
  assert.equal(round.tool_loop.result_authority, 'nars-capability-gateway');
  assert.equal(round.tool_loop.terminal_authority, 'nars-session-core');
  assert.throws(
    () => createNarsToolRound({
      turn: { turn_id: 'unsafe-round', input_id: 'unsafe-input', messages: [], tools: [{ type: 'function', function: { name: 'bash' } }] },
      capabilityGateway: gateway,
    }),
    /kernel_tool_not_admitted_proxy/,
  );
});

test('health projection has no credential material', () => {
  const health = buildKernelHealthProjection({ kernelKind: 'pi-sdk', provider: 'openai-codex', model: 'gpt-test', thinking: 'high' });
  assert.equal(health.kernel_kind, 'pi-sdk');
  assert.equal('api_key' in health, false);
});
