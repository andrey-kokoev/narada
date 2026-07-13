import { NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES } from '@narada2/carrier-protocol';

export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATE_SCHEMA = 'narada.nars.authority_runtime_host_transition_state.v1';

export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TRANSITIONS = Object.freeze({
  not_requested: Object.freeze(['proposed', 'preparing_target', 'transition_aborted']),
  proposed: Object.freeze(['preparing_target', 'preparation_failed', 'transition_aborted']),
  preparing_target: Object.freeze(['source_draining', 'preparation_failed', 'transition_aborted']),
  source_draining: Object.freeze(['source_sealed', 'drain_failed', 'transition_aborted']),
  source_sealed: Object.freeze(['target_activating', 'seal_failed', 'transition_aborted']),
  target_activating: Object.freeze(['target_active', 'target_activation_failed', 'transition_aborted']),
  target_active: Object.freeze(['source_retired']),
  source_retired: Object.freeze([]),
  preparation_failed: Object.freeze([]),
  drain_failed: Object.freeze([]),
  seal_failed: Object.freeze([]),
  target_activation_failed: Object.freeze([]),
  transition_aborted: Object.freeze([]),
});

const STATE_SET = new Set(NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TRANSITIONS)
    .map(([state, nextStates]) => [state, new Set(nextStates)]),
);
const TERMINAL_SET = new Set([
  'source_retired',
  'preparation_failed',
  'drain_failed',
  'seal_failed',
  'target_activation_failed',
  'transition_aborted',
]);

export function isNarsAuthorityRuntimeHostTransitionState(state) {
  return STATE_SET.has(state);
}

export function isNarsAuthorityRuntimeHostTransitionTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function canTransitionNarsAuthorityRuntimeHost(previousState, nextState) {
  if (!isNarsAuthorityRuntimeHostTransitionState(nextState)) return false;
  if (previousState === nextState) return true;
  const normalizedPrevious = previousState ?? 'not_requested';
  if (!isNarsAuthorityRuntimeHostTransitionState(normalizedPrevious)) return false;
  return TRANSITION_SET.get(normalizedPrevious)?.has(nextState) ?? false;
}

export function assertNarsAuthorityRuntimeHostTransition(previousState, nextState) {
  if (!canTransitionNarsAuthorityRuntimeHost(previousState, nextState)) {
    throw new Error(`invalid_nars_authority_runtime_host_transition:${previousState ?? 'not_requested'}:${nextState}`);
  }
  return nextState;
}

export function createNarsAuthorityRuntimeHostTransitionStateMachine(initialState = 'not_requested', options = {}) {
  if (!isNarsAuthorityRuntimeHostTransitionState(initialState)) {
    throw new Error(`invalid_nars_authority_runtime_host_transition_state:${initialState}`);
  }
  let state = initialState;
  const history = [{
    schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATE_SCHEMA,
    previous_state: null,
    state,
    evidence: { reason: 'initial_state' },
  }];
  const onTransition = typeof options.onTransition === 'function' ? options.onTransition : null;
  return Object.freeze({
    get state() { return state; },
    get history() { return history.map((entry) => ({ ...entry, evidence: { ...entry.evidence } })); },
    canTransition(nextState) { return canTransitionNarsAuthorityRuntimeHost(state, nextState); },
    transition(nextState, evidence = {}) {
      assertNarsAuthorityRuntimeHostTransition(state, nextState);
      if (nextState === state) return history.at(-1);
      const transition = {
        schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATE_SCHEMA,
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

