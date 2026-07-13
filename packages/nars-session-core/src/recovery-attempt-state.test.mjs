import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNarsRecoveryAttemptTransition,
  canTransitionNarsRecoveryAttempt,
  createNarsRecoveryAttemptRecord,
  transitionNarsRecoveryAttempt,
} from './recovery-attempt-state.mjs';

test('recovery attempt FSM records a replay and reconciliation path', () => {
  let attempt = createNarsRecoveryAttemptRecord({ attemptId: 'recovery-1', turnId: 'turn-1' });
  for (const state of ['claimed', 'replaying', 'reconciled', 'completed']) {
    attempt = transitionNarsRecoveryAttempt(attempt, state, { reason: 'test' });
  }
  assert.equal(attempt.recovery_attempt_state, 'completed');
  assert.equal(attempt.terminal_state, 'completed');
});

test('recovery attempt FSM distinguishes skipped recovery and rejects terminal replay', () => {
  let attempt = createNarsRecoveryAttemptRecord({ attemptId: 'recovery-2' });
  attempt = transitionNarsRecoveryAttempt(attempt, 'skipped', { reason: 'already_completed' });
  assert.equal(attempt.terminal_state, 'skipped');
  assert.equal(canTransitionNarsRecoveryAttempt('skipped', 'replaying'), false);
  assert.throws(
    () => assertNarsRecoveryAttemptTransition('completed', 'claimed'),
    /invalid_nars_recovery_attempt_transition:completed:claimed/,
  );
});

