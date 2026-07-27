import { createNarsStateMachine } from './runtime-state-machine.ts';

export const NARS_RUNTIME_HOST_STATE_SCHEMA: any = 'narada.nars.runtime_host_state.v1';

export const NARS_RUNTIME_HOST_STATES: any = Object.freeze([
  'created',
  'binding',
  'projections_ready',
  'serving',
  'closing',
  'stopped',
  'failed',
]);

export const NARS_RUNTIME_HOST_TRANSITIONS: any = Object.freeze({
  created: Object.freeze(['binding', 'failed']),
  binding: Object.freeze(['projections_ready', 'failed']),
  projections_ready: Object.freeze(['serving', 'failed']),
  serving: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['stopped', 'failed']),
  failed: Object.freeze(['closing', 'stopped']),
  stopped: Object.freeze([]),
});

const transitionSets: any = new Map(Object.entries(NARS_RUNTIME_HOST_TRANSITIONS)
  .map(([state, nextStates]: any) => [state, new Set(nextStates)]));

export function isNarsRuntimeHostState(state: any) {
  return NARS_RUNTIME_HOST_STATES.includes(state);
}

export function canTransitionNarsRuntimeHost(previousState: any, nextState: any) {
  if (!isNarsRuntimeHostState(nextState)) return false;
  if (previousState === nextState) return true;
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsRuntimeHostTransition(previousState: any, nextState: any) {
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
}: any = {}) {
  if (!isNarsRuntimeHostState(initialState)) throw new Error(`invalid_nars_runtime_host_state:${initialState}`);
  return Object.freeze(createNarsStateMachine({
    initialState,
    metadata,
    schema: NARS_RUNTIME_HOST_STATE_SCHEMA,
    event: 'runtime_host_lifecycle_transition',
    stateField: 'runtime_host_state',
    includeTerminalState: false,
    isTerminalState: () => false,
    assertTransition: assertNarsRuntimeHostTransition,
    recordSameState: true,
    now,
    onTransition,
  }));
}
