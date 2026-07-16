import { randomUUID } from 'node:crypto';

export const NARS_PROVIDER_INVOCATION_STATE_SCHEMA = 'narada.nars.provider_invocation_state.v2';

export const NARS_PROVIDER_INVOCATION_STATES = Object.freeze([
  'requested',
  'validated',
  'shaped',
  'dispatched',
  'admitting',
  'admitted',
  'receiving',
  'completed',
  'refused',
  'interrupted',
  'failed',
]);

export const NARS_PROVIDER_INVOCATION_TERMINAL_STATES = Object.freeze([
  'completed',
  'refused',
  'interrupted',
  'failed',
]);

export const NARS_PROVIDER_INVOCATION_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['validated', 'refused', 'interrupted', 'failed']),
  validated: Object.freeze(['shaped', 'refused', 'interrupted', 'failed']),
  shaped: Object.freeze(['dispatched', 'refused', 'interrupted', 'failed']),
  dispatched: Object.freeze(['admitting', 'interrupted', 'failed']),
  admitting: Object.freeze(['admitted', 'refused', 'interrupted', 'failed']),
  admitted: Object.freeze(['receiving', 'interrupted', 'failed']),
  receiving: Object.freeze(['completed', 'interrupted', 'failed']),
  completed: Object.freeze([]),
  refused: Object.freeze([]),
  interrupted: Object.freeze([]),
  failed: Object.freeze([]),
});

const TERMINAL_STATES = new Set(NARS_PROVIDER_INVOCATION_TERMINAL_STATES);
const TRANSITIONS = new Map(
  Object.entries(NARS_PROVIDER_INVOCATION_TRANSITIONS).map(([state, next]) => [state, new Set(next)]),
);

export class NarsProviderInvocationRefusalError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'NarsProviderInvocationRefusalError';
    this.code = 'provider_invocation_refused';
    this.reason = details.reason ?? details.admission?.reason ?? null;
    this.admission = details.admission ?? null;
  }
}

export function createNarsProviderInvocationId(idFn = randomUUID) {
  const raw = String(idFn()).replace(/[^0-9A-Za-z_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `prov_inv_${raw || randomUUID()}`;
}

export function isNarsProviderInvocationState(state) {
  return NARS_PROVIDER_INVOCATION_STATES.includes(state);
}

export function isNarsProviderInvocationTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

export function canTransitionNarsProviderInvocation(previousState, nextState) {
  if (!isNarsProviderInvocationState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'requested';
  if (!isNarsProviderInvocationState(previousState)) return false;
  return TRANSITIONS.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsProviderInvocationTransition(previousState, nextState) {
  if (!canTransitionNarsProviderInvocation(previousState, nextState)) {
    throw new Error(`invalid_nars_provider_invocation_transition:${previousState ?? 'none'}:${nextState}`);
  }
  return nextState;
}

export function terminalStateForNarsProviderInvocation(state) {
  return isNarsProviderInvocationTerminalState(state) ? state : null;
}

export function normalizeNarsProviderInvocationRecord(record = {}) {
  const invocationId = record.invocation_id ?? record.provider_invocation_id;
  if (!invocationId) throw new Error('nars_provider_invocation_id_required');
  const invocationState = record.invocation_state ?? 'requested';
  if (!isNarsProviderInvocationState(invocationState)) {
    throw new Error(`invalid_nars_provider_invocation_state:${invocationState}`);
  }
  return {
    schema: NARS_PROVIDER_INVOCATION_STATE_SCHEMA,
    invocation_id: String(invocationId),
    provider: record.provider ?? null,
    adapter_kind: record.adapter_kind ?? null,
    transport: record.transport ?? null,
    turn_id: record.turn_id ?? null,
    input_event_id: record.input_event_id ?? null,
    request_id: record.request_id ?? null,
    thread_id: record.thread_id ?? null,
    invocation_scope: record.invocation_scope ?? null,
    admission: record.admission ?? null,
    invocation_state: invocationState,
    terminal_state: terminalStateForNarsProviderInvocation(invocationState),
    reason: record.reason ?? null,
    error: record.error ?? null,
    updated_at: record.updated_at ?? null,
  };
}
