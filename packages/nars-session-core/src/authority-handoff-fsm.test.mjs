import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionNarsAuthorityHandoff,
  createNarsAuthorityHandoffLifecycle,
  isTerminalNarsAuthorityHandoffState,
  narsAuthorityHandoffLifecycleFromRuntimeHostState,
  transitionNarsAuthorityHandoff,
} from './authority-handoff-fsm.mjs';

test('authority handoff follows the explicit orchestration path', () => {
  let lifecycle = createNarsAuthorityHandoffLifecycle();
  for (const state of ['validating', 'preparing', 'draining', 'source_sealed', 'target_activating', 'committed']) {
    lifecycle = transitionNarsAuthorityHandoff(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'committed');
  assert.deepEqual(lifecycle.history, [
    'proposed', 'validating', 'preparing', 'draining', 'source_sealed', 'target_activating', 'committed',
  ]);
  assert.equal(isTerminalNarsAuthorityHandoffState(lifecycle.state), true);
});

test('authority handoff rejects skipping validation and reopening terminal state', () => {
  assert.equal(canTransitionNarsAuthorityHandoff('proposed', 'preparing'), false);
  assert.equal(canTransitionNarsAuthorityHandoff('committed', 'validating'), false);
  assert.throws(
    () => transitionNarsAuthorityHandoff(createNarsAuthorityHandoffLifecycle(), 'preparing'),
    /invalid_nars_authority_handoff_transition: proposed->preparing/,
  );
});

test('authority handoff provides a compatibility projection from the mechanical FSM', () => {
  assert.equal(narsAuthorityHandoffLifecycleFromRuntimeHostState('preparing_target').state, 'preparing');
  assert.equal(narsAuthorityHandoffLifecycleFromRuntimeHostState('source_retired').state, 'committed');
  assert.equal(narsAuthorityHandoffLifecycleFromRuntimeHostState('transition_aborted').state, 'refused');
});
