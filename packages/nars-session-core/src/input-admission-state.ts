export const NARS_INPUT_ADMISSION_STATE_SCHEMA = 'narada.nars.input_admission_state.v1' as const;

export const NARS_INPUT_ADMISSION_STATES = Object.freeze([
  'accepted',
  'queued',
  'held',
  'admitted',
  'dropped',
  'abandoned',
]) as readonly ['accepted', 'queued', 'held', 'admitted', 'dropped', 'abandoned'];

export type NarsInputAdmissionState = typeof NARS_INPUT_ADMISSION_STATES[number];

export const NARS_INPUT_ADMISSION_TERMINAL_STATES = Object.freeze([
  'dropped',
  'abandoned',
]) as readonly ['dropped', 'abandoned'];

export const NARS_INPUT_ADMISSION_TRANSITIONS = Object.freeze({
  accepted: Object.freeze(['queued', 'dropped', 'abandoned']),
  queued: Object.freeze(['held', 'admitted', 'dropped', 'abandoned']),
  held: Object.freeze(['queued', 'admitted', 'dropped', 'abandoned']),
  admitted: Object.freeze(['queued', 'abandoned']),
  dropped: Object.freeze([]),
  abandoned: Object.freeze([]),
});

const transitionSets = new Map<NarsInputAdmissionState, ReadonlySet<NarsInputAdmissionState>>(Object.entries(NARS_INPUT_ADMISSION_TRANSITIONS)
  .map(([state, nextStates]) => [state as NarsInputAdmissionState, new Set(nextStates as readonly NarsInputAdmissionState[])]));

const stateSet = new Set<NarsInputAdmissionState>(NARS_INPUT_ADMISSION_STATES);

export interface NarsInputAdmissionTransitionOptions {
  recovery?: boolean;
}

export interface NarsInputAdmissionRecord {
  schema: typeof NARS_INPUT_ADMISSION_STATE_SCHEMA;
  input_event_id: unknown;
  previous_state: unknown;
  admission_state: NarsInputAdmissionState | null;
  reason: unknown;
  recovery: boolean;
}

export function isNarsInputAdmissionState(state: unknown): state is NarsInputAdmissionState {
  return stateSet.has(state as NarsInputAdmissionState);
}

export function isNarsInputAdmissionTerminalState(state: unknown): state is typeof NARS_INPUT_ADMISSION_TERMINAL_STATES[number] {
  return state === 'dropped' || state === 'abandoned';
}

export function canTransitionNarsInputAdmission(
  previousState: NarsInputAdmissionState | null | undefined,
  nextState: unknown,
  { recovery = false }: NarsInputAdmissionTransitionOptions = {},
): nextState is NarsInputAdmissionState {
  if (!isNarsInputAdmissionState(nextState)) return false;
  if (previousState == null) return nextState === 'accepted';
  if (previousState === nextState) return true;
  if (previousState === 'admitted' && nextState === 'queued') return recovery;
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsInputAdmissionTransition(
  previousState: NarsInputAdmissionState | null | undefined,
  nextState: unknown,
  options: NarsInputAdmissionTransitionOptions = {},
): NarsInputAdmissionState {
  if (!canTransitionNarsInputAdmission(previousState, nextState, options)) {
    throw new Error(`invalid_nars_input_admission_transition:${previousState ?? 'none'}:${nextState}`);
  }
  return nextState;
}

export function normalizeNarsInputAdmissionRecord(record: Record<string, unknown> = {}): NarsInputAdmissionRecord {
  const rawAdmissionState = record.admission_state ?? record.state ?? null;
  const admissionState = rawAdmissionState == null ? null : rawAdmissionState;
  if (admissionState != null && !isNarsInputAdmissionState(admissionState)) {
    throw new Error(`invalid_nars_input_admission_state:${admissionState}`);
  }
  return {
    schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
    input_event_id: record.input_event_id ?? record.event_id ?? null,
    previous_state: record.previous_state ?? null,
    admission_state: admissionState as NarsInputAdmissionState | null,
    reason: record.reason ?? null,
    recovery: record.recovery === true,
  };
}
