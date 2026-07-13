export const NARS_OWNED_PROCESS_STATE_SCHEMA = 'narada.nars.owned_process_state.v1';

export const NARS_OWNED_PROCESS_STATES = Object.freeze([
  'created',
  'running',
  'terminating',
  'exited',
  'failed',
  'released',
]);

export const NARS_OWNED_PROCESS_TERMINAL_STATES = Object.freeze(['released']);

export const NARS_OWNED_PROCESS_TRANSITIONS = Object.freeze({
  created: Object.freeze(['running', 'failed', 'released']),
  running: Object.freeze(['terminating', 'exited', 'failed']),
  terminating: Object.freeze(['exited', 'failed']),
  exited: Object.freeze(['released']),
  failed: Object.freeze(['released']),
  released: Object.freeze([]),
});

const STATE_SET = new Set(NARS_OWNED_PROCESS_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_OWNED_PROCESS_TRANSITIONS).map(([state, nextStates]) => [state, new Set(nextStates)]),
);

export function canTransitionNarsOwnedProcess(previousState, nextState) {
  if (!STATE_SET.has(nextState)) return false;
  if (previousState === nextState) return true;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsOwnedProcessTransition(previousState, nextState) {
  if (!canTransitionNarsOwnedProcess(previousState, nextState)) {
    throw new Error(`invalid_nars_owned_process_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsOwnedProcessStateMachine({ initialState = 'created', onTransition = null } = {}) {
  if (!STATE_SET.has(initialState)) throw new Error(`invalid_nars_owned_process_state:${initialState}`);
  let state = initialState;
  const history = [{
    schema: NARS_OWNED_PROCESS_STATE_SCHEMA,
    previous_state: null,
    state,
    evidence: { reason: 'initial_state' },
  }];
  return Object.freeze({
    get state() { return state; },
    get history() { return history.map((entry) => ({ ...entry, evidence: { ...entry.evidence } })); },
    transition(nextState, evidence = {}) {
      assertNarsOwnedProcessTransition(state, nextState);
      if (nextState === state) return history.at(-1);
      const transition = {
        schema: NARS_OWNED_PROCESS_STATE_SCHEMA,
        previous_state: state,
        state: nextState,
        evidence: { ...evidence },
      };
      state = nextState;
      history.push(transition);
      onTransition?.(transition);
      return transition;
    },
  });
}

