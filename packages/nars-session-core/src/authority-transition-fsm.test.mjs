import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNarsAuthorityRuntimeHostTransition,
  canTransitionNarsAuthorityRuntimeHost,
  createNarsAuthorityRuntimeHostTransitionStateMachine,
  isNarsAuthorityRuntimeHostTransitionTerminalState,
} from './authority-transition-fsm.mjs';

test('authority runtime host FSM permits the governed handoff path and terminal retirement', () => {
  const machine = createNarsAuthorityRuntimeHostTransitionStateMachine();
  for (const state of ['proposed', 'preparing_target', 'source_draining', 'source_sealed', 'target_activating', 'target_active', 'source_retired']) {
    machine.transition(state, { test: true });
  }
  assert.equal(machine.state, 'source_retired');
  assert.equal(machine.history.length, 8);
  assert.equal(isNarsAuthorityRuntimeHostTransitionTerminalState(machine.state), true);
  assert.equal(machine.canTransition('target_active'), false);
});

test('authority runtime host FSM rejects reversal and missing boundary order', () => {
  assert.equal(canTransitionNarsAuthorityRuntimeHost('source_sealed', 'target_active'), false);
  assert.throws(
    () => assertNarsAuthorityRuntimeHostTransition('target_active', 'source_draining'),
    /invalid_nars_authority_runtime_host_transition:target_active:source_draining/,
  );
  assert.throws(
    () => createNarsAuthorityRuntimeHostTransitionStateMachine('unknown'),
    /invalid_nars_authority_runtime_host_transition_state:unknown/,
  );
});

