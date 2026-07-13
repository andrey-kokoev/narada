import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NARS_SESSION_LIFECYCLE_STATES,
  NARS_SESSION_LIFECYCLE_TERMINAL_STATES,
  NARS_SESSION_LIFECYCLE_TRANSITIONS,
  assertNarsSessionLifecycleTransition,
  canTransitionNarsSessionLifecycle,
  isNarsSessionLifecycleTerminalState,
  normalizeNarsSessionLifecycleState,
  rehydrateNarsSessionLifecycle,
  transitionNarsSessionLifecycle,
} from './session-lifecycle-state.mjs';

test('session lifecycle FSM exposes the governed transition table', () => {
  assert.deepEqual(NARS_SESSION_LIFECYCLE_STATES, ['starting', 'ready', 'closing', 'closed', 'failed']);
  assert.deepEqual(NARS_SESSION_LIFECYCLE_TERMINAL_STATES, ['closed']);
  assert.deepEqual(NARS_SESSION_LIFECYCLE_TRANSITIONS, {
    starting: ['ready', 'closing', 'failed'],
    ready: ['closing', 'failed'],
    closing: ['closed', 'failed'],
    failed: ['closed'],
    closed: [],
  });
  assert.equal(canTransitionNarsSessionLifecycle('starting', 'ready'), true);
  assert.equal(canTransitionNarsSessionLifecycle('ready', 'ready'), false);
  assert.equal(isNarsSessionLifecycleTerminalState('closed'), true);
  assert.equal(isNarsSessionLifecycleTerminalState('ready'), false);
});

test('session lifecycle FSM rejects reversal, same-state, and invalid transitions', () => {
  assert.equal(normalizeNarsSessionLifecycleState(), 'starting');
  assert.equal(transitionNarsSessionLifecycle('starting', 'ready'), 'ready');
  assert.equal(assertNarsSessionLifecycleTransition('closing', 'failed'), 'failed');
  assert.throws(
    () => transitionNarsSessionLifecycle('ready', 'ready'),
    /invalid_nars_session_transition:ready:ready/,
  );
  assert.throws(
    () => transitionNarsSessionLifecycle('closed', 'ready'),
    /invalid_nars_session_transition:closed:ready/,
  );
  assert.throws(
    () => normalizeNarsSessionLifecycleState('unknown'),
    /invalid_nars_session_lifecycle_state:unknown/,
  );
});

test('session lifecycle rehydration accepts legal history and preserves close evidence', () => {
  assert.equal(rehydrateNarsSessionLifecycle([
    { event: 'session_lifecycle_transition', lifecycle_state: 'ready' },
    { event: 'session_lifecycle_transition', lifecycle_state: 'closing' },
    { event: 'session_lifecycle_transition', lifecycle_state: 'closed' },
  ]), 'closed');
  assert.equal(rehydrateNarsSessionLifecycle([
    { event: 'session_lifecycle_transition', lifecycle_state: 'ready' },
    { event: 'session_lifecycle_transition', lifecycle_state: 'starting' },
  ]), 'ready');
  assert.equal(rehydrateNarsSessionLifecycle([{ event: 'session_closed' }]), 'closed');
});
