export const NARS_SESSION_SHUTDOWN_STATE_SCHEMA = 'narada.nars.session_shutdown_state.v1' as const;

export const NARS_SESSION_SHUTDOWN_STATES = Object.freeze([
  'idle',
  'cancelling',
  'draining',
  'finalizing_queue',
  'closing_tools',
  'closed',
  'failed',
]) as readonly ['idle', 'cancelling', 'draining', 'finalizing_queue', 'closing_tools', 'closed', 'failed'];

export type NarsSessionShutdownState = typeof NARS_SESSION_SHUTDOWN_STATES[number];

export const NARS_SESSION_SHUTDOWN_TERMINAL_STATES = Object.freeze(['closed', 'failed']);

export const NARS_SESSION_SHUTDOWN_TRANSITIONS = Object.freeze({
  idle: Object.freeze(['cancelling', 'draining']),
  cancelling: Object.freeze(['draining', 'failed']),
  draining: Object.freeze(['finalizing_queue', 'failed']),
  finalizing_queue: Object.freeze(['closing_tools', 'failed']),
  closing_tools: Object.freeze(['closed', 'failed']),
  closed: Object.freeze([]),
  failed: Object.freeze([]),
});

const STATE_SET = new Set<NarsSessionShutdownState>(NARS_SESSION_SHUTDOWN_STATES);
const TERMINAL_SET = new Set<typeof NARS_SESSION_SHUTDOWN_TERMINAL_STATES[number]>(NARS_SESSION_SHUTDOWN_TERMINAL_STATES);
const TRANSITION_SET = new Map<NarsSessionShutdownState, ReadonlySet<NarsSessionShutdownState>>(
  Object.entries(NARS_SESSION_SHUTDOWN_TRANSITIONS)
    .map(([state, nextStates]) => [state as NarsSessionShutdownState, new Set(nextStates as readonly NarsSessionShutdownState[])]),
);

export function isNarsSessionShutdownState(state: unknown): state is NarsSessionShutdownState {
  return STATE_SET.has(state as NarsSessionShutdownState);
}

export function isNarsSessionShutdownTerminalState(state: unknown): state is typeof NARS_SESSION_SHUTDOWN_TERMINAL_STATES[number] {
  return TERMINAL_SET.has(state as typeof NARS_SESSION_SHUTDOWN_TERMINAL_STATES[number]);
}

export function canTransitionNarsSessionShutdown(previousState: unknown, nextState: unknown): nextState is NarsSessionShutdownState {
  if (!isNarsSessionShutdownState(nextState) || !isNarsSessionShutdownState(previousState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsSessionShutdownTransition(previousState: unknown, nextState: unknown): NarsSessionShutdownState {
  if (!canTransitionNarsSessionShutdown(previousState, nextState)) {
    throw new Error(`invalid_nars_session_shutdown_transition:${previousState}:${nextState}`);
  }
  return nextState as NarsSessionShutdownState;
}

export function transitionNarsSessionShutdown(previousState: NarsSessionShutdownState, nextState: unknown): NarsSessionShutdownState {
  return assertNarsSessionShutdownTransition(previousState, nextState);
}
