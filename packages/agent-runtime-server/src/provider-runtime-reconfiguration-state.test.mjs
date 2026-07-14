import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionNarsProviderRuntimeReconfiguration,
  createNarsProviderRuntimeReconfigurationStateMachine,
} from './provider-runtime-reconfiguration-state.mjs';

test('provider runtime reconfiguration FSM admits only the clean lifecycle', () => {
  const machine = createNarsProviderRuntimeReconfigurationStateMachine({ requestId: 'reconfigure-1' });
  assert.deepEqual([
    machine.transition('requested').reconfiguration_state,
    machine.transition('validating').reconfiguration_state,
    machine.transition('admitted').reconfiguration_state,
    machine.transition('switching').reconfiguration_state,
    machine.transition('active').reconfiguration_state,
  ], ['requested', 'validating', 'admitted', 'switching', 'active']);
  assert.equal(machine.snapshot().terminal_state, 'active');
  assert.equal(canTransitionNarsProviderRuntimeReconfiguration('admitted', 'active'), false);
});

test('provider runtime reconfiguration FSM refuses invalid terminal re-entry', () => {
  const machine = createNarsProviderRuntimeReconfigurationStateMachine({ requestId: 'reconfigure-2' });
  machine.transition('requested');
  machine.transition('validating');
  machine.transition('refused', { reason: 'runtime_not_at_clean_turn_boundary' });
  assert.throws(() => machine.transition('failed'), /invalid_nars_provider_runtime_reconfiguration_transition:refused:failed/);
});

