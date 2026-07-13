import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNarsSessionShutdownTransition,
  canTransitionNarsSessionShutdown,
  isNarsSessionShutdownTerminalState,
  transitionNarsSessionShutdown,
} from './session-shutdown-state.mjs';

test('session shutdown FSM expresses the close barrier order', () => {
  assert.equal(canTransitionNarsSessionShutdown('idle', 'cancelling'), true);
  assert.equal(canTransitionNarsSessionShutdown('idle', 'draining'), true);
  assert.equal(canTransitionNarsSessionShutdown('cancelling', 'draining'), true);
  assert.equal(canTransitionNarsSessionShutdown('draining', 'finalizing_queue'), true);
  assert.equal(canTransitionNarsSessionShutdown('finalizing_queue', 'closing_tools'), true);
  assert.equal(canTransitionNarsSessionShutdown('closing_tools', 'closed'), true);
  assert.equal(isNarsSessionShutdownTerminalState('closed'), true);
  assert.equal(isNarsSessionShutdownTerminalState('failed'), true);
  assert.equal(canTransitionNarsSessionShutdown('draining', 'closed'), false);
  assert.throws(
    () => assertNarsSessionShutdownTransition('idle', 'closed'),
    /invalid_nars_session_shutdown_transition/,
  );
  assert.equal(transitionNarsSessionShutdown('closing_tools', 'closed'), 'closed');
});
