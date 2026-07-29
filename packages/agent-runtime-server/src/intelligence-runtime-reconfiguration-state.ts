import { createNarsStateMachine } from './runtime-state-machine.js';

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATE_SCHEMA: any = 'narada.nars.intelligence_runtime_reconfiguration_state.v1';

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATES: any = Object.freeze([
  'requested',
  'validating',
  'admitted',
  'switching',
  'active',
  'cancelled',
  'refused',
  'failed',
]);

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TERMINAL_STATES: any = Object.freeze([
  'active',
  'cancelled',
  'refused',
  'failed',
]);

export const NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TRANSITIONS: any = Object.freeze({
  requested: Object.freeze(['validating', 'cancelled', 'refused', 'failed']),
  validating: Object.freeze(['admitted', 'cancelled', 'refused', 'failed']),
  admitted: Object.freeze(['switching', 'cancelled', 'refused', 'failed']),
  switching: Object.freeze(['active', 'failed']),
  active: Object.freeze([]),
  cancelled: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze([]),
});

const stateSet: any = new Set(NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_STATES);
const terminalStateSet: any = new Set(NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TERMINAL_STATES);
const transitionSets: any = new Map(Object.entries(NARS_INTELLIGENCE_RUNTIME_RECONFIGURATION_TRANSITIONS)
  .map(([state, nextStates]: any) => [state, new Set(nextStates)]));

export function isNarsIntelligenceRuntimeReconfigurationState(state: any) {
  return stateSet.has(state);
}

export function isNarsIntelligenceRuntimeReconfigurationTerminalState(state: any) {
  return terminalStateSet.has(state);
}

export function canTransitionNarsIntelligenceRuntimeReconfiguration(previousState: any, nextState: any) {
  if (!isNarsIntelligenceRuntimeReconfigurationState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'requested';
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsIntelligenceRuntimeReconfigurationTransition(previousState: any, nextState: any) {
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
}: any = {}) {
  if (!requestId) throw new Error('narada_intelligence_runtime_reconfiguration_request_id_required');
  const machine: any = createNarsStateMachine({
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
