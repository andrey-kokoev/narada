export const NARS_HEALTH_PROJECTION_REQUEST_STATE_SCHEMA = 'narada.nars.health_projection_request_state.v1';

export const NARS_HEALTH_PROJECTION_REQUEST_STATES = Object.freeze([
  'requested',
  'dispatched',
  'awaiting_response',
  'resolved',
  'timed_out',
  'failed',
]);

export const NARS_HEALTH_PROJECTION_REQUEST_TERMINAL_STATES = Object.freeze([
  'resolved',
  'timed_out',
  'failed',
]);

export const NARS_HEALTH_PROJECTION_REQUEST_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['dispatched', 'failed']),
  dispatched: Object.freeze(['awaiting_response', 'resolved', 'failed']),
  awaiting_response: Object.freeze(['resolved', 'timed_out', 'failed']),
  resolved: Object.freeze([]),
  timed_out: Object.freeze([]),
  failed: Object.freeze([]),
});

const stateSet = new Set(NARS_HEALTH_PROJECTION_REQUEST_STATES);
const terminalStateSet = new Set(NARS_HEALTH_PROJECTION_REQUEST_TERMINAL_STATES);
const transitionSets = new Map(Object.entries(NARS_HEALTH_PROJECTION_REQUEST_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isNarsHealthProjectionRequestState(state) {
  return stateSet.has(state);
}

export function isNarsHealthProjectionRequestTerminalState(state) {
  return terminalStateSet.has(state);
}

export function canTransitionNarsHealthProjectionRequest(previousState, nextState) {
  if (!isNarsHealthProjectionRequestState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'requested';
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsHealthProjectionRequestTransition(previousState, nextState) {
  if (!canTransitionNarsHealthProjectionRequest(previousState, nextState)) {
    throw new Error(`invalid_nars_health_projection_request_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsHealthProjectionRequestStateMachine({
  requestId,
  metadata = {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  if (!requestId) throw new Error('narada_health_projection_request_id_required');
  let state = null;
  const history = [];

  function transition(nextState, evidence = {}) {
    assertNarsHealthProjectionRequestTransition(state, nextState);
    if (state === nextState) return history.at(-1) ?? null;
    const previousState = state;
    state = nextState;
    const record = {
      schema: NARS_HEALTH_PROJECTION_REQUEST_STATE_SCHEMA,
      event: 'health_projection_request_state_transition',
      timestamp: now(),
      request_id: requestId,
      previous_state: previousState,
      request_state: nextState,
      terminal_state: isNarsHealthProjectionRequestTerminalState(nextState) ? nextState : null,
      ...metadata,
      ...evidence,
    };
    history.push(record);
    onTransition(record);
    return record;
  }

  return Object.freeze({
    get state() { return state; },
    requestId,
    transition,
    snapshot: () => ({
      schema: NARS_HEALTH_PROJECTION_REQUEST_STATE_SCHEMA,
      request_id: requestId,
      request_state: state,
      terminal_state: isNarsHealthProjectionRequestTerminalState(state) ? state : null,
      ...metadata,
    }),
    history: () => history.slice(),
  });
}
