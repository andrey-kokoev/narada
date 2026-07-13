import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNarsHealthProjectionRequestStateMachine,
  isNarsHealthProjectionRequestTerminalState,
} from './health-projection-request-state.mjs';

function createMachine() {
  return createNarsHealthProjectionRequestStateMachine({
    requestId: 'health-test-1',
    metadata: { transport: 'http', endpoint: '/health' },
    now: () => '2026-07-13T00:00:00.000Z',
  });
}

test('health projection request FSM records successful child-runtime resolution', () => {
  const machine = createMachine();
  for (const state of ['requested', 'dispatched', 'awaiting_response', 'resolved']) machine.transition(state);
  assert.deepEqual(machine.history().map((record) => record.request_state), [
    'requested', 'dispatched', 'awaiting_response', 'resolved',
  ]);
  assert.equal(machine.snapshot().terminal_state, 'resolved');
  assert.equal(isNarsHealthProjectionRequestTerminalState(machine.state), true);
  assert.throws(() => machine.transition('failed'), /invalid_nars_health_projection_request_transition/);
});

test('health projection request FSM distinguishes timeout from transport failure', () => {
  const timedOut = createMachine();
  timedOut.transition('requested');
  timedOut.transition('dispatched');
  timedOut.transition('awaiting_response');
  timedOut.transition('timed_out', { error: 'session_health_timeout' });
  assert.equal(timedOut.snapshot().terminal_state, 'timed_out');

  const failed = createMachine();
  failed.transition('requested');
  failed.transition('failed', { error: 'child_stdin_unavailable' });
  assert.deepEqual(failed.history().map((record) => record.request_state), ['requested', 'failed']);
  assert.equal(failed.snapshot().terminal_state, 'failed');
});
