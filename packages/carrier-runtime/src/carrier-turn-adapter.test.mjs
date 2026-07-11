import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarrierTurnAdapter } from './carrier-turn-adapter.mjs';

test('carrier turn adapter retains no session state and reports turn events', async () => {
  const events = [];
  const adapter = createCarrierTurnAdapter({
    callProvider: async ({ messages, tools }) => ({ messages, tools }),
  });
  const result = await adapter.runTurn(
    { turnId: 'turn-1', provider: 'codex', messages: [{ role: 'user', content: 'hi' }] },
    async (event) => events.push(event),
    { toolCatalog: () => [{ name: 'fs_read_file' }] },
  );
  assert.equal(result.messages[0].content, 'hi');
  assert.equal(result.tools[0].name, 'fs_read_file');
  assert.deepEqual(events.map((event) => event.kind), ['carrier_turn_started', 'assistant_message', 'carrier_turn_completed']);
});

test('carrier tool loop bounds repeated tool requests and normalizes malformed arguments', async () => {
  let invocations = 0;
  const adapter = createCarrierTurnAdapter({
    callProvider: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{bad json' } }] } }] }),
  });
  await assert.rejects(() => adapter.runTurn({}, async () => {}, {
    toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
    invoke: async ({ arguments: args }) => { invocations += 1; assert.deepEqual(args, {}); return { status: 'completed' }; },
  }), /carrier_turn_tool_round_limit_exceeded/);
  assert.equal(invocations, 8);
});

test('carrier turn adapter emits failure without converting provider errors into state', async () => {
  const events = [];
  const adapter = createCarrierTurnAdapter({ callProvider: async () => { throw new Error('provider_unavailable'); } });
  await assert.rejects(() => adapter.runTurn({}, async (event) => events.push(event)), /provider_unavailable/);
  assert.equal(events.at(-1).kind, 'carrier_turn_failed');
});

test('carrier turn adapter completes provider-requested tools through the injected gateway', async () => {
  const events = [];
  let calls = 0;
  const adapter = createCarrierTurnAdapter({
    callProvider: async ({ messages }) => {
      calls += 1;
      if (calls === 1) return {
        choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'fs_read_file', arguments: '{"path":"x"}' } }] } }],
      };
      assert.equal(messages.at(-1).role, 'tool');
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    },
  });
  const result = await adapter.runTurn(
    { turnId: 'turn-2', messages: [{ role: 'user', content: 'read x' }] },
    async (event) => events.push(event),
    { toolCatalog: () => [{ type: 'function', function: { name: 'fs_read_file' } }], invoke: async ({ toolName, arguments: args }) => ({ status: 'completed', toolName, args }) },
  );
  assert.equal(result.choices[0].message.content, 'done');
  assert.deepEqual(events.map((event) => event.kind), ['carrier_turn_started', 'carrier_tool_requested', 'carrier_tool_completed', 'assistant_message', 'carrier_turn_completed']);
  assert.equal(events.at(-2).content, 'done');
});
