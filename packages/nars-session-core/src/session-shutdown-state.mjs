export const NARS_SESSION_SHUTDOWN_STATE_SCHEMA = 'narada.nars.session_shutdown_state.v1';

export const NARS_SESSION_SHUTDOWN_STATES = Object.freeze([
  'idle',
  'cancelling',
  'draining',
  'finalizing_queue',
  'closing_tools',
  'closed',
  'failed',
]);

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

const STATE_SET = new Set(NARS_SESSION_SHUTDOWN_STATES);
const TERMINAL_SET = new Set(NARS_SESSION_SHUTDOWN_TERMINAL_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_SESSION_SHUTDOWN_TRANSITIONS)
    .map(([state, nextStates]) => [state, new Set(nextStates)]),
);

export function isNarsSessionShutdownState(state) {
  return STATE_SET.has(state);
}

export function isNarsSessionShutdownTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function canTransitionNarsSessionShutdown(previousState, nextState) {
  if (!isNarsSessionShutdownState(nextState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsSessionShutdownTransition(previousState, nextState) {
  if (!canTransitionNarsSessionShutdown(previousState, nextState)) {
    throw new Error(`invalid_nars_session_shutdown_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function transitionNarsSessionShutdown(previousState, nextState) {
  assertNarsSessionShutdownTransition(previousState, nextState);
  return nextState;
}
