import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAiProcessInvocationTransition,
  canTransitionAiProcessInvocation,
  transitionAiProcessInvocation,
} from './ai-process-invocation-state.mjs';

test('AI process invocation FSM records planned through released lifecycle', () => {
  let record = { id: 'invocation-1', lifecycle_state: 'planned' };
  for (const state of ['admitted', 'spawned', 'exited', 'released']) {
    record = transitionAiProcessInvocation(record, state, { test: true });
  }
  assert.equal(record.event, 'release');
  assert.equal(record.terminal_state, 'released');
  assert.deepEqual(record.lifecycle_history.map((entry) => entry.state), ['admitted', 'spawned', 'exited', 'released']);
});

test('AI process invocation FSM rejects release before exit and terminal replay', () => {
  assert.equal(canTransitionAiProcessInvocation('admitted', 'released'), false);
  assert.throws(
    () => assertAiProcessInvocationTransition('released', 'spawned'),
    /invalid_ai_process_invocation_transition:released:spawned/,
  );
  assert.equal(canTransitionAiProcessInvocation('planned', 'refused'), true);
});

