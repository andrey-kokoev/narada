export const NARS_TURN_STATE_SCHEMA = 'narada.nars.turn_state.v1';

export const NARS_TURN_STATES = Object.freeze([
  'accepted',
  'contextualized',
  'evaluating',
  'tool_requested',
  'tool_admitted',
  'tool_refused',
  'executing',
  'reconciling',
  'completed',
  'blocked',
  'interrupted',
  'failed',
  'refused',
]);

export const NARS_TURN_TERMINAL_STATES = Object.freeze([
  'completed',
  'blocked',
  'interrupted',
  'failed',
  'refused',
]);

const TERMINAL_STATES = new Set(NARS_TURN_TERMINAL_STATES);

export const NARS_TURN_TRANSITIONS = Object.freeze({
  accepted: Object.freeze(['contextualized', 'blocked', 'interrupted', 'failed', 'refused']),
  contextualized: Object.freeze(['evaluating', 'blocked', 'interrupted', 'failed', 'refused']),
  evaluating: Object.freeze(['tool_requested', 'reconciling', 'completed', 'blocked', 'interrupted', 'failed', 'refused']),
  tool_requested: Object.freeze(['tool_admitted', 'tool_refused', 'blocked', 'interrupted', 'failed']),
  tool_admitted: Object.freeze(['executing', 'blocked', 'interrupted', 'failed']),
  tool_refused: Object.freeze(['evaluating', 'refused', 'blocked', 'interrupted', 'failed']),
  executing: Object.freeze(['reconciling', 'blocked', 'interrupted', 'failed']),
  reconciling: Object.freeze(['evaluating', 'completed', 'blocked', 'interrupted', 'failed']),
  completed: Object.freeze([]),
  blocked: Object.freeze([]),
  interrupted: Object.freeze([]),
  failed: Object.freeze([]),
  refused: Object.freeze([]),
});

const TRANSITIONS = new Map(Object.entries(NARS_TURN_TRANSITIONS).map(([state, next]) => [state, new Set(next)]));

export function isNarsTurnState(state) {
  return NARS_TURN_STATES.includes(state);
}

export function isNarsTurnTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

export function canTransitionNarsTurn(previousState, nextState, { retry = false } = {}) {
  if (!isNarsTurnState(nextState)) return false;
  if (previousState === nextState) return true;
  if (previousState == null) return nextState === 'accepted';
  if (!isNarsTurnState(previousState)) return false;
  if (retry && isNarsTurnTerminalState(previousState) && nextState === 'accepted') return true;
  return TRANSITIONS.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsTurnTransition(previousState, nextState, options = {}) {
  if (!canTransitionNarsTurn(previousState, nextState, options)) {
    throw new Error(`invalid_nars_turn_transition:${previousState ?? 'none'}:${nextState}`);
  }
  return nextState;
}

export function terminalStateForTurnState(state) {
  return isNarsTurnTerminalState(state) ? state : null;
}

export function normalizeNarsTurnRecord(record = {}) {
  const turnId = record.turn_id ?? record.input_event_id;
  if (!turnId) throw new Error('nars_turn_id_required');
  const turnState = record.turn_state ?? 'accepted';
  if (!isNarsTurnState(turnState)) throw new Error(`invalid_nars_turn_state:${turnState}`);
  return {
    schema: NARS_TURN_STATE_SCHEMA,
    turn_id: String(turnId),
    input_event_id: String(record.input_event_id ?? turnId),
    session_id: record.session_id ?? null,
    agent_id: record.agent_id ?? null,
    input_ref: record.input_ref ?? { kind: 'session_input', event_id: String(record.input_event_id ?? turnId) },
    authority_posture: record.authority_posture ?? null,
    turn_state: turnState,
    terminal_state: terminalStateForTurnState(turnState),
    attempt: Math.max(1, Number(record.attempt ?? 1)),
    updated_at: record.updated_at ?? null,
    last_error: record.last_error ?? null,
  };
}
