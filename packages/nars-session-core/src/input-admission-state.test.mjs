import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNarsInputAdmissionTransition,
  canTransitionNarsInputAdmission,
  isNarsInputAdmissionTerminalState,
  normalizeNarsInputAdmissionRecord,
} from './input-admission-state.mjs';

test('input admission FSM separates queue admission from turn execution', () => {
  assert.equal(canTransitionNarsInputAdmission(null, 'accepted'), true);
  assert.equal(canTransitionNarsInputAdmission('accepted', 'queued'), true);
  assert.equal(canTransitionNarsInputAdmission('queued', 'held'), true);
  assert.equal(canTransitionNarsInputAdmission('held', 'queued'), true);
  assert.equal(canTransitionNarsInputAdmission('queued', 'admitted'), true);
  assert.equal(isNarsInputAdmissionTerminalState('admitted'), false);
  assert.equal(isNarsInputAdmissionTerminalState('dropped'), true);
  assert.equal(isNarsInputAdmissionTerminalState('abandoned'), true);
  assert.equal(canTransitionNarsInputAdmission('admitted', 'queued'), false);
  assert.equal(canTransitionNarsInputAdmission('admitted', 'queued', { recovery: true }), true);
  assert.throws(
    () => assertNarsInputAdmissionTransition('accepted', 'admitted'),
    /invalid_nars_input_admission_transition/,
  );
});

test('input admission records are normalized with a stable schema', () => {
  assert.deepEqual(normalizeNarsInputAdmissionRecord({
    event_id: 'input-1',
    previous_state: 'queued',
    state: 'admitted',
    reason: 'input_admitted_to_turn',
  }), {
    schema: 'narada.nars.input_admission_state.v1',
    input_event_id: 'input-1',
    previous_state: 'queued',
    admission_state: 'admitted',
    reason: 'input_admitted_to_turn',
    recovery: false,
  });
  assert.throws(
    () => normalizeNarsInputAdmissionRecord({ state: 'unknown' }),
    /invalid_nars_input_admission_state/,
  );
});
