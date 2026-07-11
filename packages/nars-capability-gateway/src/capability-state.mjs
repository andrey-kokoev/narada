export const NARS_CAPABILITY_GATEWAY_STATE_SCHEMA = 'narada.nars.capability_gateway_state.v1';
export const NARS_TOOL_EXECUTION_STATE_SCHEMA = 'narada.nars.tool_execution_state.v1';

export const NARS_CAPABILITY_GATEWAY_STATES = Object.freeze([
  'idle',
  'starting',
  'healthy',
  'degraded',
  'closing',
  'closed',
  'failed',
]);

export const NARS_TOOL_EXECUTION_STATES = Object.freeze([
  'requested',
  'admitted',
  'executing',
  'completed',
  'refused',
  'failed',
  'interrupted',
]);

export const NARS_CAPABILITY_GATEWAY_TRANSITIONS = Object.freeze({
  idle: Object.freeze(['starting', 'closed']),
  starting: Object.freeze(['healthy', 'degraded', 'failed']),
  healthy: Object.freeze(['closing']),
  degraded: Object.freeze(['closing']),
  closing: Object.freeze(['closed', 'failed']),
  failed: Object.freeze(['starting', 'closed']),
  closed: Object.freeze([]),
});

export const NARS_TOOL_EXECUTION_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['admitted', 'refused', 'failed', 'interrupted']),
  admitted: Object.freeze(['executing', 'failed', 'interrupted']),
  executing: Object.freeze(['completed', 'failed', 'interrupted']),
  completed: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
  interrupted: Object.freeze([]),
});

const CAPABILITY_GATEWAY_TRANSITIONS = transitionSets(NARS_CAPABILITY_GATEWAY_TRANSITIONS);
const TOOL_EXECUTION_TRANSITIONS = transitionSets(NARS_TOOL_EXECUTION_TRANSITIONS);

export function isNarsCapabilityGatewayState(state) {
  return NARS_CAPABILITY_GATEWAY_STATES.includes(state);
}

export function isNarsToolExecutionState(state) {
  return NARS_TOOL_EXECUTION_STATES.includes(state);
}

export function isNarsToolExecutionTerminalState(state) {
  return ['completed', 'refused', 'failed', 'interrupted'].includes(state);
}

export function canTransitionNarsCapabilityGateway(previousState, nextState) {
  if (!isNarsCapabilityGatewayState(nextState)) return false;
  if (previousState === nextState) return true;
  return CAPABILITY_GATEWAY_TRANSITIONS.get(previousState)?.has(nextState) ?? false;
}

export function canTransitionNarsToolExecution(previousState, nextState) {
  if (!isNarsToolExecutionState(nextState)) return false;
  if (previousState == null) return nextState === 'requested';
  if (previousState === nextState) return true;
  return TOOL_EXECUTION_TRANSITIONS.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsCapabilityGatewayTransition(previousState, nextState) {
  if (!canTransitionNarsCapabilityGateway(previousState, nextState)) {
    throw new Error(`invalid_nars_capability_gateway_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function assertNarsToolExecutionTransition(previousState, nextState) {
  if (!canTransitionNarsToolExecution(previousState, nextState)) {
    throw new Error(`invalid_nars_tool_execution_transition:${previousState ?? 'none'}:${nextState}`);
  }
  return nextState;
}

function transitionSets(table) {
  return new Map(Object.entries(table).map(([state, nextStates]) => [state, new Set(nextStates)]));
}
