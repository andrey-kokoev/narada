export const NARADA_AI_PROCESS_INVOCATION_STATE_SCHEMA = 'narada.ai_process_invocation_state.v2';

export const NARADA_AI_PROCESS_INVOCATION_STATES = Object.freeze([
  'planned',
  'admitted',
  'spawned',
  'exited',
  'released',
  'refused',
  'failed',
  'interrupted',
]);

export const NARADA_AI_PROCESS_INVOCATION_TERMINAL_STATES = Object.freeze([
  'released',
  'refused',
  'failed',
  'interrupted',
]);

export const NARADA_AI_PROCESS_INVOCATION_TRANSITIONS = Object.freeze({
  planned: Object.freeze(['admitted', 'refused', 'failed', 'interrupted']),
  admitted: Object.freeze(['spawned', 'refused', 'failed', 'interrupted']),
  spawned: Object.freeze(['exited', 'failed', 'interrupted']),
  exited: Object.freeze(['released']),
  released: Object.freeze([]),
  refused: Object.freeze([]),
  failed: Object.freeze(['released']),
  interrupted: Object.freeze(['released']),
});

const STATE_SET = new Set(NARADA_AI_PROCESS_INVOCATION_STATES);
const TERMINAL_SET = new Set(NARADA_AI_PROCESS_INVOCATION_TERMINAL_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARADA_AI_PROCESS_INVOCATION_TRANSITIONS)
    .map(([state, nextStates]) => [state, new Set(nextStates)]),
);

const EVENT_BY_STATE = Object.freeze({
  planned: 'planned',
  admitted: 'launch',
  spawned: 'spawn',
  exited: 'exit',
  released: 'release',
  refused: 'refusal',
  failed: 'failure',
  interrupted: 'interrupt',
});

export function isAiProcessInvocationState(state) {
  return STATE_SET.has(state);
}

export function isAiProcessInvocationTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function aiProcessInvocationEventForState(state) {
  return EVENT_BY_STATE[state] ?? null;
}

export function canTransitionAiProcessInvocation(previousState, nextState) {
  if (!isAiProcessInvocationState(nextState)) return false;
  if (previousState === nextState) return true;
  if (!isAiProcessInvocationState(previousState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertAiProcessInvocationTransition(previousState, nextState) {
  if (!canTransitionAiProcessInvocation(previousState, nextState)) {
    throw new Error(`invalid_ai_process_invocation_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function transitionAiProcessInvocation(record, nextState, evidence = {}) {
  const previousState = record?.lifecycle_state ?? 'planned';
  assertAiProcessInvocationTransition(previousState, nextState);
  if (previousState === nextState) return record;
  const transition = {
    schema: NARADA_AI_PROCESS_INVOCATION_STATE_SCHEMA,
    previous_state: previousState,
    state: nextState,
    event: aiProcessInvocationEventForState(nextState),
    evidence: { ...evidence },
  };
  return {
    ...record,
    event: transition.event,
    lifecycle_state: nextState,
    previous_lifecycle_state: previousState,
    lifecycle_transition: transition,
    lifecycle_history: [...(record.lifecycle_history ?? []), transition],
    terminal_state: isAiProcessInvocationTerminalState(nextState) ? nextState : null,
  };
}

