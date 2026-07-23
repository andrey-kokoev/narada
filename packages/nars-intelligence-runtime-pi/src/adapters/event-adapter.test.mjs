import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiEventAdapter, normalizePiEvent } from './event-adapter.mjs';

test('Pi event normalization classifies fixtures without emitting canonical NARS events', async () => {
  const events = [];
  const adapter = createPiEventAdapter({ eventSink: async (event) => events.push(event), now: () => '2026-07-21T00:00:00.000Z' });
  const token = await adapter.observe({ type: 'assistant_token', id: 'token-1', sequence: 1, content: 'a' }, { turnId: 'turn-1' });
  const duplicate = await adapter.observe({ type: 'assistant_token', id: 'token-1', sequence: 1, content: 'a' }, { turnId: 'turn-1' });
  const malformed = normalizePiEvent({ id: 'bad' }, { turnId: 'turn-1' });
  const outOfOrder = normalizePiEvent({ type: 'retry', sequence: 1 }, { turnId: 'turn-1', sequence: 4 });
  assert.equal(token.classification, 'assistant_streaming_fragment');
  assert.equal(duplicate.duplicate, true);
  assert.equal(malformed.classification, 'malformed_event');
  assert.equal(outOfOrder.out_of_order, true);
  assert.equal(events.some((event) => event.kind === 'assistant_message'), false);
  assert.equal(events.at(-1).kind, 'pi_event_duplicate');
});

test('Pi event fixtures cover every normalized observation class and redact secrets', async () => {
  const events = [];
  const adapter = createPiEventAdapter({ eventSink: async (event) => events.push(event) });
  const fixtures = [
    ['assistant_message', 'assistant_message_candidate'],
    ['provider_telemetry', 'provider_telemetry'],
    ['usage_update', 'usage_telemetry'],
    ['tool_call', 'tool_request'],
    ['tool_execution', 'tool_execution_telemetry'],
    ['tool_result', 'tool_result_candidate'],
    ['retry', 'retry_telemetry'],
    ['compaction', 'compaction_telemetry'],
    ['cancellation', 'cancellation_evidence'],
    ['provider_failure', 'turn_failure_candidate'],
    ['turn_failure', 'turn_failure_candidate'],
    ['turn_failed', 'turn_failure_candidate'],
    ['turn_complete', 'turn_completion_candidate'],
    ['process_exit', 'kernel_failure'],
  ];
  for (const [kind, classification] of fixtures) {
    const normalized = await adapter.observe({
      kind,
      id: `fixture-${kind}`,
      sequence: events.length + 1,
      content: kind === 'assistant_message' ? 'candidate' : undefined,
      api_key: 'must-not-escape',
      message: { content: 'diagnostic payload is not canonical' },
    }, { turnId: 'fixture-turn', inputId: 'fixture-input' });
    assert.equal(normalized.classification, classification);
  }
  assert.equal(events.length, fixtures.length);
  assert.equal(events.some((event) => ['user_message', 'assistant_message', 'tool_requested', 'turn_complete'].includes(event.kind)), false);
  assert.equal(JSON.stringify(events).includes('must-not-escape'), false);
});

test('Pi SDK event vocabulary is normalized before NARS observes it', async () => {
  const events = [];
  const adapter = createPiEventAdapter({ eventSink: async (event) => events.push(event) });
  const fixtures = [
    [{ type: 'message_update', id: 'delta-1', sequence: 1, assistantMessageEvent: { type: 'text_delta', delta: 'hello' } }, 'assistant_streaming_fragment'],
    [{ type: 'message_end', id: 'message-1', sequence: 2, message: { role: 'assistant', content: 'hello' } }, 'assistant_message_candidate'],
    [{ type: 'tool_execution_start', toolCallId: 'call-1', sequence: 3, toolName: 'read_note' }, 'tool_execution_telemetry'],
    [{ type: 'tool_execution_end', toolCallId: 'call-1', sequence: 4, toolName: 'read_note', isError: false }, 'tool_result_candidate'],
    [{ type: 'turn_end', sequence: 5 }, 'turn_completion_candidate'],
    [{ type: 'auto_retry_start', sequence: 6 }, 'retry_telemetry'],
    [{ type: 'compaction_end', sequence: 7 }, 'compaction_telemetry'],
  ];
  for (const [fixture, classification] of fixtures) {
    assert.equal((await adapter.observe(fixture, { turnId: 'sdk-turn' })).classification, classification);
  }
  assert.equal(events.some((event) => event.event === 'assistant_message'), false);
  assert.equal(events.some((event) => event.kind === 'pi_event_unsupported'), false);
});

test('canonical provider invocation transitions remain normalized provider telemetry', async () => {
  const events = [];
  const adapter = createPiEventAdapter({ eventSink: async (event) => events.push(event) });
  const normalized = await adapter.observe({
    kind: 'provider_invocation_state_transition',
    id: 'provider-transition-1',
    invocation_state: 'validated',
    api_key: 'must-not-escape',
  }, { turnId: 'provider-turn' });
  assert.equal(normalized.classification, 'provider_telemetry');
  assert.equal(events[0].kind, 'pi_event_observed');
  assert.equal(events[0].classification, 'provider_telemetry');
  assert.equal(JSON.stringify(events).includes('must-not-escape'), false);
});

test('Pi agent-settled lifecycle evidence remains diagnostic provider telemetry', async () => {
  const events = [];
  const adapter = createPiEventAdapter({ eventSink: async (event) => events.push(event) });
  const normalized = await adapter.observe({ type: 'agent_settled', id: 'settled-1' }, { turnId: 'settled-turn' });
  assert.equal(normalized.classification, 'provider_telemetry');
  assert.equal(events[0].kind, 'pi_event_observed');
  assert.equal(events[0].pi_event_kind, 'provider_telemetry');
});

test('Pi observations are emitted in adapter order when callbacks overlap', async () => {
  const events = [];
  let releaseFirst;
  const firstSink = new Promise((resolve) => { releaseFirst = resolve; });
  let sinkCalls = 0;
  const adapter = createPiEventAdapter({
    eventSink: async (event) => {
      events.push(event);
      sinkCalls += 1;
      if (sinkCalls === 1) await firstSink;
    },
  });
  const first = adapter.observe({ kind: 'assistant_token', id: 'ordered-1', sequence: 1, content: 'a' });
  const second = adapter.observe({ kind: 'assistant_token', id: 'ordered-2', sequence: 2, content: 'b' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(events.length, 1);
  assert.equal(events[0].pi_event_id, 'ordered-1');
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events.map((event) => event.pi_event_id), ['ordered-1', 'ordered-2']);
  assert.deepEqual(events.map((event) => event.kernel_observation_sequence), [1, 2]);
});
