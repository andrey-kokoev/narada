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
 ] as const);

export type NaradaAuthorityHandoffState = (typeof NARS_AUTHORITY_HANDOFF_STATES)[number];

export interface NaradaAuthorityHandoffLifecycle {
  schema: typeof NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA;
  state: NaradaAuthorityHandoffState;
  history: NaradaAuthorityHandoffState[];
}

const TRANSITIONS: Readonly<Record<NaradaAuthorityHandoffState, readonly NaradaAuthorityHandoffState[]>> = Object.freeze({
  proposed: ['validating', 'refused', 'failed'],
  validating: ['preparing', 'refused', 'failed'],
  preparing: ['draining', 'refused', 'failed'],
  draining: ['source_sealed', 'rolled_back', 'failed'],
  source_sealed: ['target_activating', 'rolled_back', 'failed'],
  target_activating: ['committed', 'rolled_back', 'failed'],
  committed: [],
  refused: [],
  failed: [],
  rolled_back: [],
} as const);

const TERMINAL_STATES = new Set(['committed', 'refused', 'failed', 'rolled_back']);

export function createNarsAuthorityHandoffLifecycle(initialState: NaradaAuthorityHandoffState = 'proposed'): NaradaAuthorityHandoffLifecycle {
  assertState(initialState);
  return { schema: NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionNarsAuthorityHandoff(from: NaradaAuthorityHandoffState, to: NaradaAuthorityHandoffState): boolean {
  assertState(from);
  assertState(to);
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertNarsAuthorityHandoffTransition(from: NaradaAuthorityHandoffState, to: NaradaAuthorityHandoffState): void {
  if (!canTransitionNarsAuthorityHandoff(from, to)) {
    throw new Error(`invalid_nars_authority_handoff_transition: ${from}->${to}`);
  }
}

function normalizeLifecycle(lifecycle: unknown): NaradaAuthorityHandoffLifecycle | null {
  if (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle)) return null;
  const candidate = lifecycle as Record<string, unknown>;
  if (!isAuthorityHandoffState(candidate.state)) return null;
  const history = Array.isArray(candidate.history) && candidate.history.length > 0
    ? candidate.history.filter(isAuthorityHandoffState)
    : [candidate.state];
  return {
    schema: NARS_AUTHORITY_HANDOFF_LIFECYCLE_SCHEMA,
    state: candidate.state,
    history: history.length > 0 ? history : [candidate.state],
  };
}

export function transitionNarsAuthorityHandoff(
  lifecycle: NaradaAuthorityHandoffLifecycle,
  nextState: NaradaAuthorityHandoffState,
): NaradaAuthorityHandoffLifecycle {
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

export function isTerminalNarsAuthorityHandoffState(state: NaradaAuthorityHandoffState): boolean {
  assertState(state);
  return TERMINAL_STATES.has(state);
}

export function narsAuthorityHandoffLifecycleFromRuntimeHostState(state: unknown): NaradaAuthorityHandoffLifecycle {
  const mapped: Readonly<Record<string, NaradaAuthorityHandoffState>> = {
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
  };
  return createNarsAuthorityHandoffLifecycle(mapped[String(state)] ?? 'proposed');
}

export function synchronizeNarsAuthorityHandoffLifecycle(
  lifecycle: unknown,
  runtimeHostState: unknown,
): NaradaAuthorityHandoffLifecycle {
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

function isAuthorityHandoffState(value: unknown): value is NaradaAuthorityHandoffState {
  return typeof value === 'string'
    && (NARS_AUTHORITY_HANDOFF_STATES as readonly string[]).includes(value);
}

function assertState(state: unknown): asserts state is NaradaAuthorityHandoffState {
  if (!isAuthorityHandoffState(state)) {
    throw new Error(`unsupported_nars_authority_handoff_state: ${state}`);
  }
}
