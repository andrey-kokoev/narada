import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarrierTurnAdapter } from './carrier-turn-adapter.mjs';

test('carrier turn adapter retains no session state and reports turn events', async () => {
  const events = [];
  let invocationRequest;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async (request) => {
      invocationRequest = request;
      return { messages: request.messages, tools: request.tools };
    },
  });
  const result = await adapter.runTurn(
    { turnId: 'turn-1', messages: [{ role: 'user', content: 'hi' }] },
    async (event) => events.push(event),
    { toolCatalog: () => [{ name: 'fs_read_file' }] },
  );
  assert.equal(result.messages[0].content, 'hi');
  assert.equal(result.tools[0].name, 'fs_read_file');
  assert.equal(invocationRequest.turnId, 'turn-1');
  assert.equal(invocationRequest.inputEventId, null);
  assert.equal(typeof invocationRequest.invocationEventSink, 'function');
  assert.deepEqual(events.map((event) => event.kind), ['carrier_turn_started', 'assistant_message', 'carrier_turn_completed']);
});

test('carrier tool loop bounds repeated tool requests and normalizes malformed arguments', async () => {
  let invocations = 0;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{bad json' } }] } }] }),
  });
  await assert.rejects(() => adapter.runTurn({}, async () => {}, {
    toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
    invoke: async ({ arguments: args }) => { invocations += 1; assert.deepEqual(args, {}); return { status: 'completed' }; },
  }), /carrier_turn_tool_round_limit_exceeded/);
  assert.equal(invocations, 8);
});

test('carrier tool loop accepts a bounded explicit round budget', async () => {
  let invocations = 0;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{}' } }] } }] }),
  });
  await assert.rejects(() => adapter.runTurn({ maxToolRounds: 3 }, async () => {}, {
    toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
    invoke: async () => { invocations += 1; return { status: 'completed' }; },
  }), /carrier_turn_tool_round_limit_exceeded:3/);
  assert.equal(invocations, 3);
});

test('carrier turn adapter emits failure without converting provider errors into state', async () => {
  const events = [];
  const adapter = createCarrierTurnAdapter({ invokeIntelligence: async () => { throw new Error('provider_unavailable'); } });
  await assert.rejects(() => adapter.runTurn({}, async (event) => events.push(event)), /provider_unavailable/);
  assert.equal(events.at(-1).kind, 'carrier_turn_failed');
});

test('carrier tool-catalog failure is inside the turn lifecycle and cannot dispatch intelligence', async () => {
  const events = [];
  let invocations = 0;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => {
      invocations += 1;
      return { choices: [{ message: { role: 'assistant', content: 'must not run' } }] };
    },
  });
  await assert.rejects(() => adapter.runTurn(
    { turnId: 'turn-catalog-failure' },
    async (event) => events.push(event),
    { toolCatalog: async () => { throw new Error('catalog_unavailable'); } },
  ), /catalog_unavailable/);
  assert.equal(invocations, 0);
  assert.deepEqual(events.map((event) => event.kind), [
    'carrier_turn_started',
    'carrier_turn_failed',
  ]);
});

test('carrier turn adapter completes provider-requested tools through the injected gateway', async () => {
  const events = [];
  let calls = 0;
  let invocation;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async ({ messages }) => {
      calls += 1;
      if (calls === 1) return {
        choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'fs_read_file', arguments: '{"path":"x"}' } }] } }],
      };
      assert.equal(messages.at(-1).role, 'tool');
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    },
  });
  const result = await adapter.runTurn(
    { turnId: 'turn-2', inputEventId: 'input-2', messages: [{ role: 'user', content: 'read x' }] },
    async (event) => events.push(event),
    {
      toolCatalog: () => [{ type: 'function', function: { name: 'fs_read_file' } }],
      invoke: async (request) => {
        invocation = request;
        return { status: 'completed', toolName: request.toolName, args: request.arguments };
      },
    },
  );
  assert.equal(result.choices[0].message.content, 'done');
  assert.deepEqual(events.map((event) => event.kind), ['carrier_turn_started', 'carrier_tool_requested', 'carrier_tool_completed', 'assistant_message', 'carrier_turn_completed']);
  assert.equal(events.at(-2).content, 'done');
  assert.equal(invocation.turnId, 'turn-2');
  assert.equal(invocation.inputEventId, 'input-2');
});

test('carrier turn adapter aborts the turn after an interrupted tool attempt', async () => {
  const events = [];
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({
      choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-interrupt', function: { name: 'read', arguments: '{}' } }] } }],
    }),
  });

  await assert.rejects(() => adapter.runTurn(
    { turnId: 'turn-interrupted', inputEventId: 'input-interrupted' },
    async (event) => events.push(event),
    {
      toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
      invoke: async () => ({ status: 'interrupted', error: 'agent_cli_interrupt_requested' }),
    },
  ), /carrier_tool_interrupted/);
  assert.deepEqual(events.map((event) => event.kind), [
    'carrier_turn_started',
    'carrier_tool_requested',
    'carrier_tool_completed',
    'carrier_turn_interrupted',
  ]);
});
