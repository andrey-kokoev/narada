import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInputQueue,
  isObserverInputEvent,
  normalizeInputEvent,
  normalizeInputRecord,
  observerVisibility,
  shouldDeferQueuedInput,
} from './input-queue.mjs';

test('input queue normalizes directives, observers, and operator steering', async () => {
  assert.deepEqual(normalizeInputRecord('typed message'), { content: 'typed message', source: 'manual_operator' });

  const normalizedDirective = normalizeInputEvent(
    { content: 'run startup sequence', source: 'system_directive', authority_ref: 'dir_1', directive_id: 'dir_1' },
    { transport: 'control_jsonl', received_at: '2026-05-28T00:00:00.000Z' },
    { randomIdFn: () => 'input_queue_test' },
  );
  assert.equal(normalizedDirective.event_id, 'input_input_queue_test');
  assert.equal(normalizedDirective.source_kind, 'system');
  assert.equal(normalizedDirective.transport, 'control_jsonl');
  assert.equal(normalizedDirective.delivery_mode, 'admit_for_current_turn');
  assert.equal(normalizedDirective.directive_id, 'dir_1');

  const observerEvent = normalizeInputEvent(
    { content: 'Ask what evidence is missing.', source: 'observer', visibility: 'operator_visible' },
    { transport: 'control_jsonl' },
    { randomIdFn: () => 'observer_test' },
  );
  assert.equal(isObserverInputEvent(observerEvent), true);
  assert.equal(observerVisibility(observerEvent), 'operator_visible');

  assert.equal(shouldDeferQueuedInput({ source: 'manual_operator' }, { promptState: { active: true } }), false);
  assert.equal(shouldDeferQueuedInput({ source: 'system_directive' }, { rl: { line: 'draft' }, promptState: { active: true } }), true);
});

test('input queue drains in order and can drop operator steering', async () => {
  const drained = [];
  const sessionEvents = [];
  const queue = createInputQueue({
    drain: async (event) => {
      drained.push(event.content);
      return { terminal_state: 'completed' };
    },
    appendSessionFn: (entry) => sessionEvents.push(entry),
    sessionEventEntryFn: (event, payload) => ({ event, ...payload }),
    carrierSessionEventEntryFn: (event_kind, payload) => ({ event_kind, payload }),
    randomIdFn: () => 'queue_test',
  });
  await queue.enqueue({ content: 'operator', source: 'manual_operator' });
  await queue.enqueue({ content: 'steer later', source: 'operator_steering' });
  assert.equal(queue.pendingCount, 2);
  assert.equal(queue.pendingOperatorDirectiveCount, 1);
  assert.equal(queue.dropOperatorSteering(1).content, 'steer later');
  await queue.drainUntilIdle();
  assert.deepEqual(drained, ['operator']);
  assert.equal(queue.pendingCount, 0);
  assert.equal(sessionEvents.some((entry) => entry.event === 'input_event_started'), true);
});

test('input queue persists pending transitions through queue state hook', async () => {
  const states = [];
  const queue = createInputQueue({
    drain: async (event) => ({ terminal_state: event.content === 'first' ? 'completed' : 'completed' }),
    onQueueStateChangedFn: (state) => states.push(state),
    randomIdFn: () => `persist_${states.length}`,
  });
  await queue.enqueue({ content: 'first', source: 'manual_operator' });
  await queue.enqueue({ content: 'second', source: 'programmatic_operator', delivery_mode: 'admit_after_active_turn' });
  assert.equal(states.at(-1).pending.length, 2);
  await queue.drainUntilIdle();
  assert.equal(states.at(-1).pending.length, 0);
  assert.equal(states.some((state) => state.transition === 'admitted_to_turn'), true);
  assert.equal(states.some((state) => state.transition === 'completed'), true);
});

test('input queue can drop and clear generic queued operator input', async () => {
  const sessionEvents = [];
  const queue = createInputQueue({
    drain: async () => ({ terminal_state: 'completed' }),
    appendSessionFn: (entry) => sessionEvents.push(entry),
    carrierSessionEventEntryFn: (event_kind, payload) => ({ event_kind, payload }),
    randomIdFn: () => `operator_input_${sessionEvents.length}`,
  });
  await queue.enqueue({ content: 'manual', source: 'manual_operator' });
  await queue.enqueue({ content: 'web ui', source: 'programmatic_operator', delivery_mode: 'admit_after_active_turn' });
  await queue.enqueue({ content: 'system', source: 'system_directive' });

  assert.equal(queue.dropOperatorInput(2).content, 'web ui');
  assert.equal(queue.pendingCount, 2);
  const cleared = queue.clearOperatorInput();
  assert.deepEqual(cleared.map((event) => event.content), ['manual']);
  assert.equal(queue.pendingCount, 1);
  assert.equal(queue.items()[0].content, 'system');
  assert.equal(sessionEvents.filter((entry) => entry.event_kind === 'input_dropped_by_operator').length, 2);
});

test('input queue preserves request correlation across admission and completion evidence', async () => {
  const sessionEvents = [];
  const queue = createInputQueue({
    drain: async () => ({ terminal_state: 'completed' }),
    appendSessionFn: (entry) => sessionEvents.push(entry),
    carrierSessionEventEntryFn: (event_kind, payload) => ({ event_kind, payload }),
    randomIdFn: () => 'request_correlation',
  });
  await queue.enqueue({ content: 'agent directive', source: 'agent_control', source_kind: 'agent', request_id: 'nars_input_request_1', metadata: { agent_control_input: true } });
  await queue.drainUntilIdle();
  const correlated = sessionEvents.filter((entry) => entry.request_id === 'nars_input_request_1' || entry.payload?.request_id === 'nars_input_request_1');
  assert.ok(correlated.some((entry) => entry.event === 'input_event_queued'));
  assert.ok(correlated.some((entry) => entry.event === 'input_event_started'));
  assert.ok(correlated.some((entry) => entry.event === 'input_event_completed'));
});
