import { randomUUID } from 'node:crypto';

export const NARS_RECOVERY_ATTEMPT_STATE_SCHEMA = 'narada.nars.recovery_attempt_state.v1';

export const NARS_RECOVERY_ATTEMPT_STATES = Object.freeze([
  'requested',
  'claimed',
  'replaying',
  'reconciled',
  'completed',
  'skipped',
  'interrupted',
  'failed',
  'abandoned',
]);

export const NARS_RECOVERY_ATTEMPT_TERMINAL_STATES = Object.freeze([
  'completed',
  'skipped',
  'interrupted',
  'failed',
  'abandoned',
]);

export const NARS_RECOVERY_ATTEMPT_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['claimed', 'skipped', 'failed', 'abandoned']),
  claimed: Object.freeze(['replaying', 'skipped', 'failed', 'abandoned']),
  replaying: Object.freeze(['reconciled', 'interrupted', 'failed', 'abandoned']),
  reconciled: Object.freeze(['completed', 'failed']),
  completed: Object.freeze([]),
  skipped: Object.freeze([]),
  interrupted: Object.freeze([]),
  failed: Object.freeze([]),
  abandoned: Object.freeze([]),
});

const STATE_SET = new Set(NARS_RECOVERY_ATTEMPT_STATES);
const TERMINAL_SET = new Set(NARS_RECOVERY_ATTEMPT_TERMINAL_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_RECOVERY_ATTEMPT_TRANSITIONS).map(([state, nextStates]) => [state, new Set(nextStates)]),
);

export function createNarsRecoveryAttemptId(idFn = randomUUID) {
  const raw = String(idFn()).replace(/[^0-9A-Za-z_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `recovery_${raw || randomUUID()}`;
}

export function isNarsRecoveryAttemptState(state) {
  return STATE_SET.has(state);
}

export function isNarsRecoveryAttemptTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function canTransitionNarsRecoveryAttempt(previousState, nextState) {
  if (!STATE_SET.has(nextState)) return false;
  if (previousState === nextState) return true;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsRecoveryAttemptTransition(previousState, nextState) {
  if (!canTransitionNarsRecoveryAttempt(previousState, nextState)) {
    throw new Error(`invalid_nars_recovery_attempt_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsRecoveryAttemptRecord({
  attemptId = createNarsRecoveryAttemptId(),
  turnId = null,
  inputEventId = null,
  sessionId = null,
  attemptNumber = 1,
  recoveryKind = 'queue_replay',
  requestedAt = null,
  reason = null,
} = {}) {
  return {
    schema: NARS_RECOVERY_ATTEMPT_STATE_SCHEMA,
    attempt_id: String(attemptId),
    turn_id: turnId == null ? null : String(turnId),
    input_event_id: inputEventId == null ? null : String(inputEventId),
    session_id: sessionId == null ? null : String(sessionId),
    attempt_number: Number.isInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1,
    recovery_kind: recoveryKind,
    recovery_attempt_state: 'requested',
    terminal_state: null,
    requested_at: requestedAt,
    updated_at: requestedAt,
    reason,
    error: null,
  };
}

export function normalizeNarsRecoveryAttemptRecord(record = {}) {
  const normalized = createNarsRecoveryAttemptRecord({
    attemptId: record.attempt_id,
    turnId: record.turn_id,
    inputEventId: record.input_event_id,
    sessionId: record.session_id,
    attemptNumber: record.attempt_number,
    recoveryKind: record.recovery_kind,
    requestedAt: record.requested_at,
    reason: record.reason,
  });
  const state = record.recovery_attempt_state ?? 'requested';
  if (!STATE_SET.has(state)) throw new Error(`invalid_nars_recovery_attempt_state:${state}`);
  return {
    ...normalized,
    recovery_attempt_state: state,
    terminal_state: isNarsRecoveryAttemptTerminalState(state) ? state : null,
    updated_at: record.updated_at ?? normalized.updated_at,
    error: record.error ?? null,
  };
}

export function transitionNarsRecoveryAttempt(record, nextState, evidence = {}) {
  const current = normalizeNarsRecoveryAttemptRecord(record);
  assertNarsRecoveryAttemptTransition(current.recovery_attempt_state, nextState);
  if (current.recovery_attempt_state === nextState) return current;
  return normalizeNarsRecoveryAttemptRecord({
    ...current,
    recovery_attempt_state: nextState,
    updated_at: evidence.updated_at ?? current.updated_at,
    reason: evidence.reason ?? current.reason,
    error: evidence.error ?? current.error,
  });
}

