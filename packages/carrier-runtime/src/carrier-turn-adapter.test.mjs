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
    {
      turnId: 'turn-1',
      inputEventId: 'input-1',
      runtimeRequestId: 'runtime-1',
      idempotencyKey: 'idem-1',
      turnAttempt: 2,
      messages: [{ role: 'user', content: 'hi' }],
    },
    async (event) => events.push(event),
    { toolCatalog: () => [{ name: 'fs_read_file' }] },
  );
  assert.equal(result.messages[0].content, 'hi');
  assert.equal(result.tools[0].name, 'fs_read_file');
  assert.equal(invocationRequest.turnId, 'turn-1');
  assert.equal(invocationRequest.inputEventId, 'input-1');
  assert.equal(invocationRequest.runtimeRequestId, 'runtime-1');
  assert.equal(invocationRequest.idempotencyKey, 'idem-1');
  assert.equal(invocationRequest.turnAttempt, 2);
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
  assert.equal(invocations, 200);
});

test('carrier accepts execution policy values through the inclusive 1-500 bounds', async () => {
  const events = [];
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({ choices: [{ message: { role: 'assistant', content: 'done' } }] }),
  });
  await adapter.runTurn({
    execution_policy: {
      schema: 'narada.nars.execution_policy.v1',
      scope: 'session',
      source: { kind: 'test', ref: null, revision: 1 },
      tool_loop: { max_rounds: 500 },
    },
  }, async (event) => events.push(event));
  assert.equal(events[0].execution_policy.tool_loop.max_rounds, 500);
  await assert.rejects(() => adapter.runTurn({
    execution_policy: {
      schema: 'narada.nars.execution_policy.v1',
      scope: 'session',
      source: { kind: 'test', ref: null, revision: 1 },
      tool_loop: { max_rounds: 501 },
    },
  }), /carrier_execution_policy_invalid/);
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

test('carrier snapshots the typed execution policy across provider, gateway, and events', async () => {
  const events = [];
  let providerRequest = null;
  let gatewayRequest = null;
  let invocations = 0;
  const executionPolicy = {
    schema: 'narada.nars.execution_policy.v1',
    scope: 'session',
    source: { kind: 'runtime-control', ref: 'runtime:test', revision: 2 },
    tool_loop: { max_rounds: 3 },
  };
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async (request) => {
      providerRequest = request;
      return { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{}' } }] } }] };
    },
  });
  await assert.rejects(() => adapter.runTurn({ execution_policy: executionPolicy }, async (event) => events.push(event), {
    toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
    invoke: async (request) => {
      gatewayRequest = request;
      invocations += 1;
      return { status: 'completed' };
    },
  }), /carrier_turn_tool_round_limit_exceeded:3/);
  assert.equal(invocations, 3);
  assert.deepEqual(providerRequest.execution_policy, executionPolicy);
  assert.deepEqual(gatewayRequest.execution_policy, executionPolicy);
  assert.equal(Object.isFrozen(events[0].execution_policy), true);
  assert.deepEqual(events[0].execution_policy, executionPolicy);
  assert.deepEqual(events.at(-1).execution_policy, executionPolicy);
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
  assert.equal(invocation.toolCallId, 'call-1');
  assert.equal(invocation.capabilityIdentity, 'capability:fs_read_file');
  assert.equal(invocation.authorityPosture, 'nars-admitted');
});

test('carrier turn adapter durably projects explicit provider stream chunks before completion', async () => {
  const events = [];
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({
      narada_stream: [
        { content: 'partial', done: false, stream_id: 'stream-1' },
        { content: 'partial final', done: true, stream_id: 'stream-1' },
      ],
      choices: [{ message: { role: 'assistant', content: 'partial final' } }],
    }),
  });

  const result = await adapter.runTurn(
    { turnId: 'turn-stream', inputEventId: 'input-stream', messages: [{ role: 'user', content: 'stream this' }] },
    async (event) => events.push(event),
  );

  assert.equal(result.choices[0].message.content, 'partial final');
  assert.deepEqual(events.map((event) => event.kind), [
    'carrier_turn_started',
    'assistant_message_stream',
    'assistant_message_stream',
    'assistant_message',
    'carrier_turn_completed',
  ]);
  assert.deepEqual(events.filter((event) => event.kind === 'assistant_message_stream').map((event) => ({
    content: event.content,
    done: event.done,
    stream_id: event.stream_id,
  })), [
    { content: 'partial', done: false, stream_id: 'stream-1' },
    { content: 'partial final', done: true, stream_id: 'stream-1' },
  ]);
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
