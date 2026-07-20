import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionNarsIntelligenceRuntimeReconfiguration,
  createNarsIntelligenceRuntimeReconfigurationStateMachine,
} from './intelligence-runtime-reconfiguration-state.mjs';

test('intelligence runtime reconfiguration FSM admits only the clean lifecycle', () => {
  const machine = createNarsIntelligenceRuntimeReconfigurationStateMachine({ requestId: 'reconfigure-1' });
  assert.deepEqual([
    machine.transition('requested').reconfiguration_state,
    machine.transition('validating').reconfiguration_state,
    machine.transition('admitted').reconfiguration_state,
    machine.transition('switching').reconfiguration_state,
    machine.transition('active').reconfiguration_state,
  ], ['requested', 'validating', 'admitted', 'switching', 'active']);
  assert.equal(machine.snapshot().terminal_state, 'active');
  assert.equal(canTransitionNarsIntelligenceRuntimeReconfiguration('admitted', 'active'), false);
});

test('intelligence runtime reconfiguration FSM refuses invalid terminal re-entry', () => {
  const machine = createNarsIntelligenceRuntimeReconfigurationStateMachine({ requestId: 'reconfigure-2' });
  machine.transition('requested');
  machine.transition('validating');
  machine.transition('refused', { reason: 'runtime_not_at_clean_turn_boundary' });
  assert.throws(() => machine.transition('failed'), /invalid_nars_intelligence_runtime_reconfiguration_transition:refused:failed/);
});

