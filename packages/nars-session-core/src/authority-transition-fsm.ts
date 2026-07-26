import { NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES } from '@narada2/carrier-protocol';

export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATE_SCHEMA = 'narada.nars.authority_runtime_host_transition_state.v1' as const;

export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TYPE_STATES = [
  'not_requested',
  'proposed',
  'preparing_target',
  'source_draining',
  'source_sealed',
  'target_activating',
  'target_active',
  'source_retired',
  'preparation_failed',
  'drain_failed',
  'seal_failed',
  'target_activation_failed',
  'transition_aborted',
] as const;
export type NaradaAuthorityRuntimeHostTransitionState = (typeof NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TYPE_STATES)[number];

export interface NaradaAuthorityRuntimeHostTransitionEvidence {
  reason?: string;
  [key: string]: unknown;
}

export interface NaradaAuthorityRuntimeHostTransition {
  schema: typeof NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATE_SCHEMA;
  previous_state: NaradaAuthorityRuntimeHostTransitionState | null;
  state: NaradaAuthorityRuntimeHostTransitionState;
  evidence: NaradaAuthorityRuntimeHostTransitionEvidence;
}

export interface NaradaAuthorityRuntimeHostTransitionMachineOptions {
  onTransition?: (transition: NaradaAuthorityRuntimeHostTransition) => void;
}

export interface NaradaAuthorityRuntimeHostTransitionMachine {
  readonly state: NaradaAuthorityRuntimeHostTransitionState;
  readonly history: NaradaAuthorityRuntimeHostTransition[];
  canTransition(nextState: NaradaAuthorityRuntimeHostTransitionState): boolean;
  transition(nextState: NaradaAuthorityRuntimeHostTransitionState, evidence?: NaradaAuthorityRuntimeHostTransitionEvidence): NaradaAuthorityRuntimeHostTransition;
}

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
  transition_aborted: [],
} as const);

const STATE_SET = new Set<string>(NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES);
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

export function isNarsAuthorityRuntimeHostTransitionState(state: unknown): state is NaradaAuthorityRuntimeHostTransitionState {
  return typeof state === 'string'
    && STATE_SET.has(state)
    && (NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TYPE_STATES as readonly string[]).includes(state);
}

export function isNarsAuthorityRuntimeHostTransitionTerminalState(state: unknown): boolean {
  return typeof state === 'string' && TERMINAL_SET.has(state);
}

export function canTransitionNarsAuthorityRuntimeHost(previousState: unknown, nextState: unknown): boolean {
  if (!isNarsAuthorityRuntimeHostTransitionState(nextState)) return false;
  if (previousState === nextState) return true;
  const normalizedPrevious = previousState ?? 'not_requested';
  if (!isNarsAuthorityRuntimeHostTransitionState(normalizedPrevious)) return false;
  return TRANSITION_SET.get(normalizedPrevious)?.has(nextState) ?? false;
}

export function assertNarsAuthorityRuntimeHostTransition(
  previousState: unknown,
  nextState: unknown,
): asserts nextState is NaradaAuthorityRuntimeHostTransitionState {
  if (!canTransitionNarsAuthorityRuntimeHost(previousState, nextState)) {
    throw new Error(`invalid_nars_authority_runtime_host_transition:${previousState ?? 'not_requested'}:${nextState}`);
  }
}

export function createNarsAuthorityRuntimeHostTransitionStateMachine(
  initialState: NaradaAuthorityRuntimeHostTransitionState = 'not_requested',
  options: NaradaAuthorityRuntimeHostTransitionMachineOptions = {},
): NaradaAuthorityRuntimeHostTransitionMachine {
  if (!isNarsAuthorityRuntimeHostTransitionState(initialState)) {
    throw new Error(`invalid_nars_authority_runtime_host_transition_state:${initialState}`);
  }
  let state = initialState;
  const history: NaradaAuthorityRuntimeHostTransition[] = [{
    schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATE_SCHEMA,
    previous_state: null,
    state,
    evidence: { reason: 'initial_state' },
  }];
  const onTransition = typeof options.onTransition === 'function' ? options.onTransition : null;
  return Object.freeze({
    get state() { return state; },
    get history() { return history.map((entry) => ({ ...entry, evidence: { ...entry.evidence } })); },
    canTransition(nextState: NaradaAuthorityRuntimeHostTransitionState) { return canTransitionNarsAuthorityRuntimeHost(state, nextState); },
    transition(nextState: NaradaAuthorityRuntimeHostTransitionState, evidence: NaradaAuthorityRuntimeHostTransitionEvidence = {}) {
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
  }) as NaradaAuthorityRuntimeHostTransitionMachine;
}

