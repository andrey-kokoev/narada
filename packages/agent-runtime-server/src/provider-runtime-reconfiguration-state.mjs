import { createNarsStateMachine } from './runtime-state-machine.mjs';

export const NARS_PROVIDER_RUNTIME_RECONFIGURATION_STATE_SCHEMA = 'narada.nars.provider_runtime_reconfiguration_state.v1';

export const NARS_PROVIDER_RUNTIME_RECONFIGURATION_STATES = Object.freeze([
  'requested',
  'validating',
  'admitted',
  'switching',
  'active',
  'refused',
  'failed',
]);

export const NARS_PROVIDER_RUNTIME_RECONFIGURATION_TERMINAL_STATES = Object.freeze([
  'active',
  'refused',
  'failed',
]);

export const NARS_PROVIDER_RUNTIME_RECONFIGURATION_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['validating', 'refused', 'failed']),
  validating: Object.freeze(['admitted', 'refused', 'failed']),
  admitted: Object.freeze(['switching', 'refused', 'failed']),
  switching: Object.freeze(['active', 'failed']),
  active: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
});

const stateSet = new Set(NARS_PROVIDER_RUNTIME_RECONFIGURATION_STATES);
const terminalStateSet = new Set(NARS_PROVIDER_RUNTIME_RECONFIGURATION_TERMINAL_STATES);
const transitionSets = new Map(Object.entries(NARS_PROVIDER_RUNTIME_RECONFIGURATION_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isNarsProviderRuntimeReconfigurationState(state) {
  return stateSet.has(state);
}

export function isNarsProviderRuntimeReconfigurationTerminalState(state) {
  return terminalStateSet.has(state);
}

export function canTransitionNarsProviderRuntimeReconfiguration(previousState, nextState) {
  if (!isNarsProviderRuntimeReconfigurationState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'requested';
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsProviderRuntimeReconfigurationTransition(previousState, nextState) {
  if (!canTransitionNarsProviderRuntimeReconfiguration(previousState, nextState)) {
    throw new Error(`invalid_nars_provider_runtime_reconfiguration_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsProviderRuntimeReconfigurationStateMachine({
  requestId,
  metadata = {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  if (!requestId) throw new Error('narada_provider_runtime_reconfiguration_request_id_required');
  const machine = createNarsStateMachine({
    identityFields: { request_id: requestId },
    metadata,
    schema: NARS_PROVIDER_RUNTIME_RECONFIGURATION_STATE_SCHEMA,
    event: 'provider_runtime_reconfiguration_state_transition',
    stateField: 'reconfiguration_state',
    isTerminalState: isNarsProviderRuntimeReconfigurationTerminalState,
    assertTransition: assertNarsProviderRuntimeReconfigurationTransition,
    now,
    onTransition,
  });
  return Object.freeze({
    get state() { return machine.state; },
    requestId,
    transition: machine.transition,
    snapshot: machine.snapshot,
    history: machine.history,
  });
}

