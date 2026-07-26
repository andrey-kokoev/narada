import { randomUUID } from 'node:crypto';

export const NARS_RECOVERY_ATTEMPT_STATE_SCHEMA = 'narada.nars.recovery_attempt_state.v1' as const;

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
]) as readonly ['requested', 'claimed', 'replaying', 'reconciled', 'completed', 'skipped', 'interrupted', 'failed', 'abandoned'];

export type NarsRecoveryAttemptState = typeof NARS_RECOVERY_ATTEMPT_STATES[number];

export const NARS_RECOVERY_ATTEMPT_TERMINAL_STATES = Object.freeze([
  'completed',
  'skipped',
  'interrupted',
  'failed',
  'abandoned',
]) as readonly ['completed', 'skipped', 'interrupted', 'failed', 'abandoned'];

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

const STATE_SET = new Set<NarsRecoveryAttemptState>(NARS_RECOVERY_ATTEMPT_STATES);
const TERMINAL_SET = new Set<typeof NARS_RECOVERY_ATTEMPT_TERMINAL_STATES[number]>(NARS_RECOVERY_ATTEMPT_TERMINAL_STATES);
const TRANSITION_SET = new Map<NarsRecoveryAttemptState, ReadonlySet<NarsRecoveryAttemptState>>(
  Object.entries(NARS_RECOVERY_ATTEMPT_TRANSITIONS).map(([state, nextStates]) => [state as NarsRecoveryAttemptState, new Set(nextStates as readonly NarsRecoveryAttemptState[])]),
);

export interface NarsRecoveryAttemptRecord {
  schema: typeof NARS_RECOVERY_ATTEMPT_STATE_SCHEMA;
  attempt_id: string;
  turn_id: string | null;
  input_event_id: string | null;
  session_id: string | null;
  attempt_number: number;
  recovery_kind: unknown;
  recovery_attempt_state: NarsRecoveryAttemptState;
  terminal_state: NarsRecoveryAttemptState | null;
  requested_at: unknown;
  updated_at: unknown;
  reason: unknown;
  error: unknown;
}

export interface CreateNarsRecoveryAttemptRecordOptions {
  attemptId?: string;
  turnId?: string | null;
  inputEventId?: string | null;
  sessionId?: string | null;
  attemptNumber?: number;
  recoveryKind?: unknown;
  requestedAt?: unknown;
  reason?: unknown;
}

export interface NarsRecoveryAttemptTransitionEvidence {
  updated_at?: unknown;
  reason?: unknown;
  error?: unknown;
}

export function createNarsRecoveryAttemptId(idFn: () => string = randomUUID): string {
  const raw = String(idFn()).replace(/[^0-9A-Za-z_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `recovery_${raw || randomUUID()}`;
}

export function isNarsRecoveryAttemptState(state: unknown): state is NarsRecoveryAttemptState {
  return STATE_SET.has(state as NarsRecoveryAttemptState);
}

export function isNarsRecoveryAttemptTerminalState(state: unknown): state is typeof NARS_RECOVERY_ATTEMPT_TERMINAL_STATES[number] {
  return TERMINAL_SET.has(state as typeof NARS_RECOVERY_ATTEMPT_TERMINAL_STATES[number]);
}

export function canTransitionNarsRecoveryAttempt(
  previousState: NarsRecoveryAttemptState | null | undefined,
  nextState: unknown,
): nextState is NarsRecoveryAttemptState {
  if (!isNarsRecoveryAttemptState(nextState)) return false;
  if (previousState === nextState) return true;
  if (!isNarsRecoveryAttemptState(previousState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsRecoveryAttemptTransition(
  previousState: NarsRecoveryAttemptState | null | undefined,
  nextState: unknown,
): NarsRecoveryAttemptState {
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
}: CreateNarsRecoveryAttemptRecordOptions = {}): NarsRecoveryAttemptRecord {
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

export function normalizeNarsRecoveryAttemptRecord(record: Record<string, unknown> | NarsRecoveryAttemptRecord = {}): NarsRecoveryAttemptRecord {
  const source = { ...record } as Record<string, unknown>;
  const normalized = createNarsRecoveryAttemptRecord({
    attemptId: source.attempt_id == null ? undefined : String(source.attempt_id),
    turnId: source.turn_id == null ? null : String(source.turn_id),
    inputEventId: source.input_event_id == null ? null : String(source.input_event_id),
    sessionId: source.session_id == null ? null : String(source.session_id),
    attemptNumber: Number(source.attempt_number ?? 1),
    recoveryKind: source.recovery_kind,
    requestedAt: source.requested_at,
    reason: source.reason,
  });
  const state = source.recovery_attempt_state ?? 'requested';
  if (!isNarsRecoveryAttemptState(state)) throw new Error(`invalid_nars_recovery_attempt_state:${state}`);
  return {
    ...normalized,
    recovery_attempt_state: state,
    terminal_state: isNarsRecoveryAttemptTerminalState(state) ? state : null,
    updated_at: source.updated_at ?? normalized.updated_at,
    error: source.error ?? null,
  };
}

export function transitionNarsRecoveryAttempt(
  record: Record<string, unknown> | NarsRecoveryAttemptRecord,
  nextState: unknown,
  evidence: NarsRecoveryAttemptTransitionEvidence = {},
): NarsRecoveryAttemptRecord {
  const current = normalizeNarsRecoveryAttemptRecord(record);
  const transitionState = assertNarsRecoveryAttemptTransition(current.recovery_attempt_state, nextState);
  if (current.recovery_attempt_state === transitionState) return current;
  return normalizeNarsRecoveryAttemptRecord({
    ...current,
    recovery_attempt_state: transitionState,
    updated_at: evidence.updated_at ?? current.updated_at,
    reason: evidence.reason ?? current.reason,
    error: evidence.error ?? current.error,
  });
}

