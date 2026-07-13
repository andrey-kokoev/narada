export const NARS_SESSION_LIFECYCLE_STATE_SCHEMA = 'narada.nars.session_lifecycle_state.v1';

export const NARS_SESSION_LIFECYCLE_STATES = Object.freeze([
  'starting',
  'ready',
  'closing',
  'closed',
  'failed',
]);

export const NARS_SESSION_LIFECYCLE_TERMINAL_STATES = Object.freeze(['closed']);

export const NARS_SESSION_LIFECYCLE_TRANSITIONS = Object.freeze({
  starting: Object.freeze(['ready', 'closing', 'failed']),
  ready: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['closed', 'failed']),
  failed: Object.freeze(['closed']),
  closed: Object.freeze([]),
});

const STATE_SET = new Set(NARS_SESSION_LIFECYCLE_STATES);
const TERMINAL_SET = new Set(NARS_SESSION_LIFECYCLE_TERMINAL_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_SESSION_LIFECYCLE_TRANSITIONS)
    .map(([state, nextStates]) => [state, new Set(nextStates)]),
);

export function isNarsSessionLifecycleState(state) {
  return STATE_SET.has(state);
}

export function isNarsSessionLifecycleTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function canTransitionNarsSessionLifecycle(previousState, nextState) {
  if (!isNarsSessionLifecycleState(nextState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsSessionLifecycleTransition(previousState, nextState) {
  if (!canTransitionNarsSessionLifecycle(previousState, nextState)) {
    throw new Error(`invalid_nars_session_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function normalizeNarsSessionLifecycleState(state = 'starting') {
  if (!isNarsSessionLifecycleState(state)) {
    throw new Error(`invalid_nars_session_lifecycle_state:${state}`);
  }
  return state;
}

export function transitionNarsSessionLifecycle(previousState, nextState) {
  assertNarsSessionLifecycleTransition(previousState, nextState);
  return nextState;
}

export function rehydrateNarsSessionLifecycle(events = []) {
  let lifecycle = 'starting';
  for (const event of events) {
    if (event?.event === 'session_lifecycle_transition' && canTransitionNarsSessionLifecycle(lifecycle, event.lifecycle_state)) {
      lifecycle = event.lifecycle_state;
    } else if (event?.event === 'session_closed') {
      lifecycle = 'closed';
    }
  }
  return normalizeNarsSessionLifecycleState(lifecycle);
}
