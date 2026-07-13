export const NARS_INPUT_ADMISSION_STATE_SCHEMA = 'narada.nars.input_admission_state.v1';

export const NARS_INPUT_ADMISSION_STATES = Object.freeze([
  'accepted',
  'queued',
  'held',
  'admitted',
  'dropped',
  'abandoned',
]);

export const NARS_INPUT_ADMISSION_TERMINAL_STATES = Object.freeze([
  'dropped',
  'abandoned',
]);

export const NARS_INPUT_ADMISSION_TRANSITIONS = Object.freeze({
  accepted: Object.freeze(['queued', 'dropped', 'abandoned']),
  queued: Object.freeze(['held', 'admitted', 'dropped', 'abandoned']),
  held: Object.freeze(['queued', 'admitted', 'dropped', 'abandoned']),
  admitted: Object.freeze(['queued', 'abandoned']),
  dropped: Object.freeze([]),
  abandoned: Object.freeze([]),
});

const transitionSets = new Map(Object.entries(NARS_INPUT_ADMISSION_TRANSITIONS)
  .map(([state, nextStates]) => [state, new Set(nextStates)]));

export function isNarsInputAdmissionState(state) {
  return NARS_INPUT_ADMISSION_STATES.includes(state);
}

export function isNarsInputAdmissionTerminalState(state) {
  return NARS_INPUT_ADMISSION_TERMINAL_STATES.includes(state);
}

export function canTransitionNarsInputAdmission(previousState, nextState, { recovery = false } = {}) {
  if (!isNarsInputAdmissionState(nextState)) return false;
  if (previousState == null) return nextState === 'accepted';
  if (previousState === nextState) return true;
  if (previousState === 'admitted' && nextState === 'queued') return recovery;
  return transitionSets.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsInputAdmissionTransition(previousState, nextState, options = {}) {
  if (!canTransitionNarsInputAdmission(previousState, nextState, options)) {
    throw new Error(`invalid_nars_input_admission_transition:${previousState ?? 'none'}:${nextState}`);
  }
  return nextState;
}

export function normalizeNarsInputAdmissionRecord(record = {}) {
  const admissionState = record.admission_state ?? record.state ?? null;
  if (admissionState != null && !isNarsInputAdmissionState(admissionState)) {
    throw new Error(`invalid_nars_input_admission_state:${admissionState}`);
  }
  return {
    schema: NARS_INPUT_ADMISSION_STATE_SCHEMA,
    input_event_id: record.input_event_id ?? record.event_id ?? null,
    previous_state: record.previous_state ?? null,
    admission_state: admissionState,
    reason: record.reason ?? null,
    recovery: record.recovery === true,
  };
}
