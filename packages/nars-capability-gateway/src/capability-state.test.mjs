import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNarsCapabilityGatewayTransition,
  assertNarsToolExecutionTransition,
  canTransitionNarsCapabilityGateway,
  canTransitionNarsToolExecution,
  isNarsToolExecutionTerminalState,
} from './capability-state.mjs';

test('capability gateway state machine accepts lifecycle paths and rejects shortcuts', () => {
  assert.equal(canTransitionNarsCapabilityGateway('idle', 'starting'), true);
  assert.equal(canTransitionNarsCapabilityGateway('starting', 'healthy'), true);
  assert.equal(canTransitionNarsCapabilityGateway('starting', 'degraded'), true);
  assert.equal(canTransitionNarsCapabilityGateway('failed', 'starting'), true);
  assert.equal(canTransitionNarsCapabilityGateway('healthy', 'closed'), false);
  assert.equal(canTransitionNarsCapabilityGateway('closed', 'starting'), false);
  assert.doesNotThrow(() => assertNarsCapabilityGatewayTransition('degraded', 'closing'));
  assert.throws(() => assertNarsCapabilityGatewayTransition('healthy', 'closed'), /invalid_nars_capability_gateway_transition/);
});

test('tool execution state machine requires request admission and has immutable terminal states', () => {
  let state = null;
  for (const nextState of ['requested', 'admitted', 'executing', 'completed']) {
    assert.equal(canTransitionNarsToolExecution(state, nextState), true);
    assertNarsToolExecutionTransition(state, nextState);
    state = nextState;
  }
  assert.equal(isNarsToolExecutionTerminalState(state), true);
  assert.equal(canTransitionNarsToolExecution('requested', 'executing'), false);
  assert.equal(canTransitionNarsToolExecution('completed', 'failed'), false);
  assert.equal(canTransitionNarsToolExecution('requested', 'refused'), true);
  assert.equal(canTransitionNarsToolExecution('executing', 'interrupted'), true);
  assert.throws(() => assertNarsToolExecutionTransition('completed', 'failed'), /invalid_nars_tool_execution_transition/);
});
