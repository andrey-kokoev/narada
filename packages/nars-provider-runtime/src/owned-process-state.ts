type AnyRecord = Record<string, any>;

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

export function canTransitionNarsOwnedProcess(previousState: any, nextState: any): any {
  if (!STATE_SET.has(nextState)) return false;
  if (previousState === nextState) return true;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsOwnedProcessTransition(previousState: any, nextState: any): any {
  if (!canTransitionNarsOwnedProcess(previousState, nextState)) {
    throw new Error(`invalid_nars_owned_process_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsOwnedProcessStateMachine({ initialState = 'created', onTransition = null }: AnyRecord = {}): any {
  if (!STATE_SET.has(initialState)) throw new Error(`invalid_nars_owned_process_state:${initialState}`);
  let state = initialState;
  const history: AnyRecord[] = [{
    schema: NARS_OWNED_PROCESS_STATE_SCHEMA,
    previous_state: null,
    state,
    evidence: { reason: 'initial_state' },
  }];
  return Object.freeze({
    get state(): any { return state; },
    get history(): any { return history.map((entry: any) => ({ ...entry, evidence: { ...entry.evidence } })); },
    transition(nextState: any, evidence: AnyRecord = {}): any {
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

