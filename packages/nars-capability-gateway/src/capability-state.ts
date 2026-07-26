type AnyRecord = Record<string, any>;

export const NARS_CAPABILITY_GATEWAY_STATE_SCHEMA = 'narada.nars.capability_gateway_state.v1';
export const NARS_TOOL_EXECUTION_STATE_SCHEMA = 'narada.nars.tool_execution_state.v1';

export const NARS_CAPABILITY_GATEWAY_STATES: readonly string[] = Object.freeze([
  'idle',
  'starting',
  'healthy',
  'degraded',
  'closing',
  'closed',
  'failed',
]);

export const NARS_TOOL_EXECUTION_STATES: readonly string[] = Object.freeze([
  'requested',
  'admitted',
  'executing',
  'completed',
  'refused',
  'failed',
  'interrupted',
]);

export const NARS_CAPABILITY_GATEWAY_TRANSITIONS: Record<string, readonly string[]> = Object.freeze({
  idle: Object.freeze(['starting', 'closed']),
  starting: Object.freeze(['healthy', 'degraded', 'failed']),
  healthy: Object.freeze(['closing']),
  degraded: Object.freeze(['closing']),
  closing: Object.freeze(['closed', 'failed']),
  failed: Object.freeze(['starting', 'closed']),
  closed: Object.freeze([]),
});

export const NARS_TOOL_EXECUTION_TRANSITIONS: Record<string, readonly string[]> = Object.freeze({
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

export function isNarsCapabilityGatewayState(state: string): boolean {
  return NARS_CAPABILITY_GATEWAY_STATES.includes(state);
}

export function isNarsToolExecutionState(state: string): boolean {
  return NARS_TOOL_EXECUTION_STATES.includes(state);
}

export function isNarsToolExecutionTerminalState(state: string): boolean {
  return ['completed', 'refused', 'failed', 'interrupted'].includes(state);
}

export function canTransitionNarsCapabilityGateway(previousState: string, nextState: string): boolean {
  if (!isNarsCapabilityGatewayState(nextState)) return false;
  if (previousState === nextState) return true;
  return CAPABILITY_GATEWAY_TRANSITIONS.get(previousState)?.has(nextState) ?? false;
}

export function canTransitionNarsToolExecution(previousState: string | null | undefined, nextState: string): boolean {
  if (!isNarsToolExecutionState(nextState)) return false;
  if (previousState == null) return nextState === 'requested';
  if (previousState === nextState) return true;
  return TOOL_EXECUTION_TRANSITIONS.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsCapabilityGatewayTransition(previousState: string, nextState: string): string {
  if (!canTransitionNarsCapabilityGateway(previousState, nextState)) {
    throw new Error(`invalid_nars_capability_gateway_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function assertNarsToolExecutionTransition(previousState: string | null | undefined, nextState: string): string {
  if (!canTransitionNarsToolExecution(previousState, nextState)) {
    throw new Error(`invalid_nars_tool_execution_transition:${previousState ?? 'none'}:${nextState}`);
  }
  return nextState;
}

function transitionSets(table: Record<string, readonly string[]>): Map<string, Set<string>> {
  return new Map(Object.entries(table).map(([state, nextStates]) => [state, new Set(nextStates)]));
}
