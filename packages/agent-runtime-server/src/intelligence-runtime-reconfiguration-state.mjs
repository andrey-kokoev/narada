import { createNarsStateMachine } from './runtime-state-machine.mjs';

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATE_SCHEMA = 'narada.nars.intelligence_runtime_reconfiguration_state.v1';

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATES = Object.freeze([
  'requested',
  'validating',
  'admitted',
  'switching',
  'active',
  'refused',
  'failed',
]);

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TERMINAL_STATES = Object.freeze([
  'active',
  'refused',
  'failed',
]);

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['validating', 'refused', 'failed']),
  validating: Object.freeze(['admitted', 'refused', 'failed']),
  admitted: Object.freeze(['switching', 'refused', 'failed']),
  switching: Object.freeze(['active', 'failed']),
  active: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
});

const stateSet = new Set(NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATES);
const terminalStateSet = new Set(NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TERMINAL_STATES);
const transitionSets = new Map(Object.entries(NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isNarsIntelligenceRuntimeReconfigurationState(state) {
  return stateSet.has(state);
}

export function isNarsIntelligenceRuntimeReconfigurationTerminalState(state) {
  return terminalStateSet.has(state);
}

export function canTransitionNarsIntelligenceRuntimeReconfiguration(previousState, nextState) {
  if (!isNarsIntelligenceRuntimeReconfigurationState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'requested';
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsIntelligenceRuntimeReconfigurationTransition(previousState, nextState) {
  if (!canTransitionNarsIntelligenceRuntimeReconfiguration(previousState, nextState)) {
    throw new Error(`invalid_nars_intelligence_runtime_reconfiguration_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsIntelligenceRuntimeReconfigurationStateMachine({
  requestId,
  metadata = {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
} = {}) {
  if (!requestId) throw new Error('narada_intelligence_runtime_reconfiguration_request_id_required');
  const machine = createNarsStateMachine({
    identityFields: { request_id: requestId },
    metadata,
    schema: NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATE_SCHEMA,
    event: 'intelligence_runtime_reconfiguration_state_transition',
    stateField: 'reconfiguration_state',
    isTerminalState: isNarsIntelligenceRuntimeReconfigurationTerminalState,
    assertTransition: assertNarsIntelligenceRuntimeReconfigurationTransition,
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

