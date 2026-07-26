import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCarrierTurnAdapter,
  type CarrierEvent,
  type CarrierInvocationRequest,
  type CarrierToolInvocationRequest,
  type JsonRecord,
} from './carrier-turn-adapter.js';

function required<T>(value: T): NonNullable<T> {
  assert.ok(value);
  return value as NonNullable<T>;
}

function record(value: unknown): JsonRecord {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as JsonRecord;
}

function arrayProperty(value: unknown, key: string): unknown[] {
  const property = record(value)[key];
  assert.ok(Array.isArray(property));
  return property;
}

function recordAt(values: unknown[], index: number): JsonRecord {
  return record(required(values[index]));
}

function eventKinds(events: CarrierEvent[]): string[] {
  return events.map((event) => event.kind);
}

test('carrier turn adapter retains no session state and reports turn events', async () => {
  const events: CarrierEvent[] = [];
  let invocationRequest: CarrierInvocationRequest | undefined;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async (request: CarrierInvocationRequest) => {
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
    async (event: CarrierEvent) => events.push(event),
    { toolCatalog: () => [{ name: 'fs_read_file' }] },
  );
  const resultMessages = arrayProperty(result, 'messages');
  const resultTools = arrayProperty(result, 'tools');
  assert.equal(recordAt(resultMessages, 0).content, 'hi');
  assert.equal(recordAt(resultTools, 0).name, 'fs_read_file');
  const request = required(invocationRequest);
  assert.equal(request.turnId, 'turn-1');
  assert.equal(request.inputEventId, 'input-1');
  assert.equal(request.runtimeRequestId, 'runtime-1');
  assert.equal(request.idempotencyKey, 'idem-1');
  assert.equal(request.turnAttempt, 2);
  assert.equal(typeof request.invocationEventSink, 'function');
  assert.deepEqual(eventKinds(events), ['carrier_turn_started', 'assistant_message', 'carrier_turn_completed']);
});

test('carrier tool loop bounds repeated tool requests and normalizes malformed arguments', async () => {
  let invocations = 0;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({
      choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{bad json' } }] } }],
    }),
  });
  await assert.rejects(() => adapter.runTurn({}, async () => {}, {
    toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
    invoke: async (request: CarrierToolInvocationRequest) => {
      invocations += 1;
      assert.deepEqual(request.arguments, {});
      return { status: 'completed' };
    },
  }), /carrier_turn_tool_round_limit_exceeded/);
  assert.equal(invocations, 200);
});

test('carrier accepts execution policy values through the inclusive 1-500 bounds', async () => {
  const events: CarrierEvent[] = [];
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
  }, async (event: CarrierEvent) => events.push(event));
  const startEvent = required(events[0]);
  const policy = record(startEvent.execution_policy);
  assert.equal(record(policy.tool_loop).max_rounds, 500);
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
    invokeIntelligence: async () => ({
      choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{}' } }] } }],
    }),
  });
  await assert.rejects(() => adapter.runTurn({ maxToolRounds: 3 }, async () => {}, {
    toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
    invoke: async () => {
      invocations += 1;
      return { status: 'completed' };
    },
  }), /carrier_turn_tool_round_limit_exceeded:3/);
  assert.equal(invocations, 3);
});

test('carrier snapshots the typed execution policy across provider, gateway, and events', async () => {
  const events: CarrierEvent[] = [];
  let providerRequest: CarrierInvocationRequest | null = null;
  let gatewayRequest: CarrierToolInvocationRequest | null = null;
  let invocations = 0;
  const executionPolicy = {
    schema: 'narada.nars.execution_policy.v1',
    scope: 'session',
    source: { kind: 'runtime-control', ref: 'runtime:test', revision: 2 },
    tool_loop: { max_rounds: 3 },
  };
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async (request: CarrierInvocationRequest) => {
      providerRequest = request;
      return {
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{ id: 'call', function: { name: 'read', arguments: '{}' } }],
          },
        }],
      };
    },
  });
  await assert.rejects(() => adapter.runTurn(
    { execution_policy: executionPolicy },
    async (event: CarrierEvent) => events.push(event),
    {
      toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
      invoke: async (request: CarrierToolInvocationRequest) => {
        gatewayRequest = request;
        invocations += 1;
        return { status: 'completed' };
      },
    },
  ), /carrier_turn_tool_round_limit_exceeded:3/);
  assert.equal(invocations, 3);
  assert.ok(providerRequest);
  assert.ok(gatewayRequest);
  const provider = providerRequest as CarrierInvocationRequest;
  const gateway = gatewayRequest as CarrierToolInvocationRequest;
  const firstEvent = required(events[0]);
  const lastEvent = required(events.at(-1));
  assert.deepEqual(provider.execution_policy, executionPolicy);
  assert.deepEqual(gateway.execution_policy, executionPolicy);
  assert.equal(Object.isFrozen(firstEvent.execution_policy), true);
  assert.deepEqual(firstEvent.execution_policy, executionPolicy);
  assert.deepEqual(lastEvent.execution_policy, executionPolicy);
});

test('carrier turn adapter emits failure without converting provider errors into state', async () => {
  const events: CarrierEvent[] = [];
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => {
      throw new Error('provider_unavailable');
    },
  });
  await assert.rejects(() => adapter.runTurn({}, async (event: CarrierEvent) => events.push(event)), /provider_unavailable/);
  assert.equal(required(events.at(-1)).kind, 'carrier_turn_failed');
});

test('carrier tool-catalog failure is inside the turn lifecycle and cannot dispatch intelligence', async () => {
  const events: CarrierEvent[] = [];
  let invocations = 0;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => {
      invocations += 1;
      return { choices: [{ message: { role: 'assistant', content: 'must not run' } }] };
    },
  });
  await assert.rejects(() => adapter.runTurn(
    { turnId: 'turn-catalog-failure' },
    async (event: CarrierEvent) => events.push(event),
    { toolCatalog: async () => { throw new Error('catalog_unavailable'); } },
  ), /catalog_unavailable/);
  assert.equal(invocations, 0);
  assert.deepEqual(eventKinds(events), [
    'carrier_turn_started',
    'carrier_turn_failed',
  ]);
});

test('carrier turn adapter completes provider-requested tools through the injected gateway', async () => {
  const events: CarrierEvent[] = [];
  let calls = 0;
  let invocation: CarrierToolInvocationRequest | undefined;
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async ({ messages }: CarrierInvocationRequest) => {
      calls += 1;
      if (calls === 1) {
        return {
          choices: [{
            message: {
              role: 'assistant',
              tool_calls: [{
                id: 'call-1',
                function: { name: 'fs_read_file', arguments: '{"path":"x"}' },
              }],
            },
          }],
        };
      }
      assert.equal(record(required(messages.at(-1))).role, 'tool');
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    },
  });
  const result = await adapter.runTurn(
    { turnId: 'turn-2', inputEventId: 'input-2', messages: [{ role: 'user', content: 'read x' }] },
    async (event: CarrierEvent) => events.push(event),
    {
      toolCatalog: () => [{ type: 'function', function: { name: 'fs_read_file' } }],
      invoke: async (request: CarrierToolInvocationRequest) => {
        invocation = request;
        return { status: 'completed', toolName: request.toolName, args: request.arguments };
      },
    },
  );
  const choices = arrayProperty(result, 'choices');
  const firstChoice = recordAt(choices, 0);
  const message = record(firstChoice.message);
  assert.equal(message.content, 'done');
  assert.deepEqual(eventKinds(events), [
    'carrier_turn_started',
    'carrier_tool_requested',
    'carrier_tool_completed',
    'assistant_message',
    'carrier_turn_completed',
  ]);
  assert.equal(required(events.at(-2)).content, 'done');
  const toolInvocation = required(invocation);
  assert.equal(toolInvocation.turnId, 'turn-2');
  assert.equal(toolInvocation.inputEventId, 'input-2');
  assert.equal(toolInvocation.toolCallId, 'call-1');
  assert.equal(toolInvocation.capabilityIdentity, 'capability:fs_read_file');
  assert.equal(toolInvocation.authorityPosture, 'nars-admitted');
});

test('carrier turn adapter durably projects explicit provider stream chunks before completion', async () => {
  const events: CarrierEvent[] = [];
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
    async (event: CarrierEvent) => events.push(event),
  );

  assert.equal(record(recordAt(arrayProperty(result, 'choices'), 0).message).content, 'partial final');
  assert.deepEqual(eventKinds(events), [
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
  const events: CarrierEvent[] = [];
  const adapter = createCarrierTurnAdapter({
    invokeIntelligence: async () => ({
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [{ id: 'call-interrupt', function: { name: 'read', arguments: '{}' } }],
        },
      }],
    }),
  });

  await assert.rejects(() => adapter.runTurn(
    { turnId: 'turn-interrupted', inputEventId: 'input-interrupted' },
    async (event: CarrierEvent) => events.push(event),
    {
      toolCatalog: () => [{ type: 'function', function: { name: 'read' } }],
      invoke: async () => ({ status: 'interrupted', error: 'agent_cli_interrupt_requested' }),
    },
  ), /carrier_tool_interrupted/);
  assert.deepEqual(eventKinds(events), [
    'carrier_turn_started',
    'carrier_tool_requested',
    'carrier_tool_completed',
    'carrier_turn_interrupted',
  ]);
});
