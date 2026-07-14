export const NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA = 'narada.nars.authority_handoff.lifecycle_state.v1';

export const NARS_AUTHORITY_HANDOFF_STATES = Object.freeze([
  'proposed',
  'validating',
  'preparing',
  'draining',
  'source_sealed',
  'target_activating',
  'committed',
  'refused',
  'failed',
  'rolled_back',
]);

const TRANSITIONS = Object.freeze({
  proposed: Object.freeze(['validating', 'refused', 'failed']),
  validating: Object.freeze(['preparing', 'refused', 'failed']),
  preparing: Object.freeze(['draining', 'refused', 'failed']),
  draining: Object.freeze(['source_sealed', 'rolled_back', 'failed']),
  source_sealed: Object.freeze(['target_activating', 'rolled_back', 'failed']),
  target_activating: Object.freeze(['committed', 'rolled_back', 'failed']),
  committed: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
  rolled_back: Object.freeze([]),
});

const TERMINAL_STATES = new Set(['committed', 'refused', 'failed', 'rolled_back']);

export function createNarsAuthorityHandoffLifecycle(initialState = 'proposed') {
  assertState(initialState);
  return { schema: NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionNarsAuthorityHandoff(from, to) {
  assertState(from);
  assertState(to);
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertNarsAuthorityHandoffTransition(from, to) {
  if (!canTransitionNarsAuthorityHandoff(from, to)) {
    throw new Error(`invalid_nars_authority_handoff_transition: ${from}->${to}`);
  }
}

function normalizeLifecycle(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle)) return null;
  if (!NARS_AUTHORITY_HANDOFF_STATES.includes(lifecycle.state)) return null;
  const history = Array.isArray(lifecycle.history) && lifecycle.history.length > 0
    ? lifecycle.history.filter((state) => NARS_AUTHORITY_HANDOFF_STATES.includes(state))
    : [lifecycle.state];
  return {
    schema: NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA,
    state: lifecycle.state,
    history: history.length > 0 ? history : [lifecycle.state],
  };
}

export function transitionNarsAuthorityHandoff(lifecycle, nextState) {
  assertState(lifecycle?.state);
  assertNarsAuthorityHandoffTransition(lifecycle.state, nextState);
  return lifecycle.state === nextState
    ? lifecycle
    : {
      schema: NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA,
      state: nextState,
      history: [...lifecycle.history, nextState],
    };
}

export function isTerminalNarsAuthorityHandoffState(state) {
  assertState(state);
  return TERMINAL_STATES.has(state);
}

export function narsAuthorityHandoffLifecycleFromRuntimeHostState(state) {
  const mapped = {
    not_requested: 'proposed',
    proposed: 'proposed',
    preparing_target: 'preparing',
    source_draining: 'draining',
    source_sealed: 'source_sealed',
    target_activating: 'target_activating',
    target_active: 'committed',
    source_retired: 'committed',
    preparation_failed: 'failed',
    drain_failed: 'failed',
    seal_failed: 'failed',
    target_activation_failed: 'failed',
    transition_aborted: 'refused',
  }[String(state)];
  return createNarsAuthorityHandoffLifecycle(mapped ?? 'proposed');
}

export function synchronizeNarsAuthorityHandoffLifecycle(lifecycle, runtimeHostState) {
  const targetState = narsAuthorityHandoffLifecycleFromRuntimeHostState(runtimeHostState).state;
  const current = normalizeLifecycle(lifecycle) ?? createNarsAuthorityHandoffLifecycle(targetState);
  if (current.state === targetState) return current;

  // The legacy authority host persists only final states for atomic validation
  // and activation. Preserve the finer-grained lifecycle evidence here without
  // creating a second authority owner.
  if (current.state === 'proposed' && targetState === 'preparing') {
    return transitionNarsAuthorityHandoff(
      transitionNarsAuthorityHandoff(current, 'validating'),
      'preparing',
    );
  }
  if (current.state === 'source_sealed' && targetState === 'committed') {
    return transitionNarsAuthorityHandoff(
      transitionNarsAuthorityHandoff(current, 'target_activating'),
      'committed',
    );
  }
  return transitionNarsAuthorityHandoff(current, targetState);
}

function assertState(state) {
  if (!NARS_AUTHORITY_HANDOFF_STATES.includes(state)) {
    throw new Error(`unsupported_nars_authority_handoff_state: ${state}`);
  }
}
