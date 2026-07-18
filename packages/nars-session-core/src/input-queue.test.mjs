import assert from 'node:assert/strict';
import test from 'node:test';
import { createInputQueue } from './input-queue.mjs';

test('input queue persists admission transitions and keeps them distinct from turn state', async () => {
  const events = [];
  const queueStates = [];
  let hold = true;
  const queue = createInputQueue({
    randomIdFn: () => 'fixed',
    shouldDefer: () => hold,
    drain: async () => ({ terminal_state: 'completed' }),
    appendSessionFn: (event) => events.push(event),
    sessionEventEntryFn: (event, payload) => ({ event, ...payload }),
    carrierSessionEventEntryFn: (event, payload) => ({ event_kind: event, payload }),
    onQueueStateChangedFn: (state) => queueStates.push(state),
  });

  await queue.enqueue({ event_id: 'input_test_1', content: 'hello' });
  assert.equal(queue.admissionState('input_test_1'), 'queued');
  assert.deepEqual(queueStates.map((state) => state.transition), ['accepted', 'queued']);
  const queued = events.find((event) => event.event === 'input_event_queued');
  assert.equal(queued.admission_state_schema, 'narada.nars.input_admission_state.v1');
  assert.equal(queued.admission_previous_state, 'accepted');
  assert.equal(queued.admission_state, 'queued');
  assert.equal(queued.turn_state, 'accepted');

  await queue.drainOnce();
  assert.equal(queue.admissionState('input_test_1'), 'held');
  assert.equal(queueStates.at(-1).transition, 'held');

  hold = false;
  await queue.drainOnce();
  assert.equal(queue.pendingCount, 0);
  assert.ok(events.some((event) => event.event === 'input_event_started' && event.admission_state === 'admitted'));
  assert.equal(queueStates.at(-1).transition, 'completed');
});

test('input queue requeues an admitted item after a crash window', async () => {
  const queueStates = [];
  let calls = 0;
  const queue = createInputQueue({
    initialPending: [{ event_id: 'input_recover', content: 'retry', admission_state: 'admitted' }],
    shouldDefer: () => false,
    drain: async () => { calls += 1; return { terminal_state: 'completed' }; },
    onQueueStateChangedFn: (state) => queueStates.push(state),
  });

  await queue.drainUntilIdle();
  assert.equal(calls, 1);
  assert.equal(queue.pendingCount, 0);
  assert.ok(queueStates.some((state) => state.transition === 'recovery_requeued'));
});

test('input queue refuses admission before it mutates durable queue state', async () => {
  const queueStates = [];
  let accepting = false;
  const queue = createInputQueue({
    assertEnqueueAllowedFn: () => {
      if (!accepting) throw new Error('nars_session_not_accepting_input:closing');
    },
    drain: async () => ({ terminal_state: 'completed' }),
    onQueueStateChangedFn: (state) => queueStates.push(state),
  });

  await assert.rejects(
    queue.enqueue({ event_id: 'input_refused_after_close', content: 'late input' }),
    /nars_session_not_accepting_input:closing/,
  );
  assert.equal(queue.pendingCount, 0);
  assert.deepEqual(queueStates, []);

  accepting = true;
  await queue.enqueue({ event_id: 'input_allowed', content: 'accepted input' });
  assert.equal(queue.pendingCount, 1);
});

test('input queue deduplicates a manual retry by durable idempotency key', async () => {
  const events = [];
  let drainCalls = 0;
  const queue = createInputQueue({
    shouldDefer: () => false,
    drain: async () => {
      drainCalls += 1;
      return { terminal_state: 'completed' };
    },
    appendSessionFn: (event) => events.push(event),
    sessionEventEntryFn: (event, payload) => ({ event, ...payload }),
  });

  await queue.enqueue({ event_id: 'input_original', request_id: 'request_original', content: 'once', idempotency_key: 'retry-key-1' }, { drain: true });
  const retry = await queue.enqueue({ event_id: 'input_retry', request_id: 'request_retry', content: 'once', idempotency_key: 'retry-key-1' }, { drain: true });

  assert.equal(drainCalls, 1);
  assert.equal(queue.pendingCount, 0);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.original_event_id, 'input_original');
  assert.equal(retry.original_request_id, 'request_original');
  assert.equal(retry.terminal_state, 'completed');
  assert.deepEqual(events.filter((event) => event.event === 'input_event_queued').map((event) => event.idempotency_key), ['retry-key-1']);
  assert.equal(events.filter((event) => event.event === 'input_event_started').length, 1);
  assert.equal(events.filter((event) => event.event === 'input_event_deduplicated').length, 1);
});

test('input queue rehydrates the original operation identity after deduplication evidence', async () => {
  const queue = createInputQueue({
    initialIdempotencyRecords: [
      { event: 'input_event_queued', event_id: 'input_original', request_id: 'request_original', idempotency_key: 'retry-key-2' },
      { event: 'input_event_completed', event_id: 'input_original', request_id: 'request_original', idempotency_key: 'retry-key-2', terminal_state: 'completed' },
      { event: 'input_event_deduplicated', event_id: 'input_retry', request_id: 'request_retry', original_event_id: 'input_original', original_request_id: 'request_original', idempotency_key: 'retry-key-2', terminal_state: 'completed' },
    ],
    drain: async () => ({ terminal_state: 'completed' }),
  });

  const retry = await queue.enqueue({ event_id: 'input_retry_again', request_id: 'request_retry_again', content: 'once', idempotency_key: 'retry-key-2' });

  assert.equal(retry.deduplicated, true);
  assert.equal(retry.original_event_id, 'input_original');
  assert.equal(retry.original_request_id, 'request_original');
  assert.equal(retry.terminal_state, 'completed');
});
