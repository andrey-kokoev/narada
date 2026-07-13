export const NARS_RUNTIME_HOST_STATE_SCHEMA = 'narada.nars.runtime_host_state.v1';

export const NARS_RUNTIME_HOST_STATES = Object.freeze([
  'created',
  'binding',
  'projections_ready',
  'serving',
  'closing',
  'stopped',
  'failed',
]);

export const NARS_RUNTIME_HOST_TRANSITIONS = Object.freeze({
  created: Object.freeze(['binding', 'failed']),
  binding: Object.freeze(['projections_ready', 'failed']),
  projections_ready: Object.freeze(['serving', 'failed']),
  serving: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['stopped', 'failed']),
  failed: Object.freeze(['closing', 'stopped']),
  stopped: Object.freeze([]),
});

const transitionSets = new Map(Object.entries(NARS_RUNTIME_HOST_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isNarsRuntimeHostState(state) {
  return NARS_RUNTIME_HOST_STATES.includes(state);
}

export function canTransitionNarsRuntimeHost(previousState, nextState) {
  if (!isNarsRuntimeHostState(nextState)) return false;
  if (previousState === nextState) return true;
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsRuntimeHostTransition(previousState, nextState) {
  if (!canTransitionNarsRuntimeHost(previousState, nextState)) {
    throw new Error(`invalid_nars_runtime_host_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsRuntimeHostStateMachine({
  initialState = 'created',
  metadata = {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  if (!isNarsRuntimeHostState(initialState)) throw new Error(`invalid_nars_runtime_host_state:${initialState}`);
  let state = initialState;
  const history = [];

  function transition(nextState, evidence = {}) {
    assertNarsRuntimeHostTransition(state, nextState);
    const previousState = state;
    state = nextState;
    const record = {
      schema: NARS_RUNTIME_HOST_STATE_SCHEMA,
      event: 'runtime_host_lifecycle_transition',
      timestamp: now(),
      previous_state: previousState,
      runtime_host_state: nextState,
      ...metadata,
      ...evidence,
    };
    history.push(record);
    onTransition(record);
    return record;
  }

  return Object.freeze({
    get state() { return state; },
    transition,
    snapshot: () => ({
      schema: NARS_RUNTIME_HOST_STATE_SCHEMA,
      runtime_host_state: state,
      ...metadata,
    }),
    history: () => history.slice(),
  });
}
