type AnyRecord = Record<string, any>;

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

const STATE_SET = new Set<string>(NARADA_AI_PROCESS_INVOCATION_STATES);
const TERMINAL_SET = new Set<string>(NARADA_AI_PROCESS_INVOCATION_TERMINAL_STATES);
const TRANSITION_SET = new Map<string, Set<string>>(
  Object.entries(NARADA_AI_PROCESS_INVOCATION_TRANSITIONS)
    .map(([state, nextStates]: [string, any]) => [state, new Set<string>(nextStates)]),
);

const EVENT_BY_STATE: Record<string, string> = Object.freeze({
  planned: 'planned',
  admitted: 'launch',
  spawned: 'spawn',
  exited: 'exit',
  released: 'release',
  refused: 'refusal',
  failed: 'failure',
  interrupted: 'interrupt',
});

export function isAiProcessInvocationState(state: any): boolean {
  return STATE_SET.has(String(state));
}

export function isAiProcessInvocationTerminalState(state: any): boolean {
  return TERMINAL_SET.has(String(state));
}

export function aiProcessInvocationEventForState(state: any): string | null {
  return EVENT_BY_STATE[String(state)] ?? null;
}

export function canTransitionAiProcessInvocation(previousState: any, nextState: any): boolean {
  if (!isAiProcessInvocationState(nextState)) return false;
  if (previousState === nextState) return true;
  if (!isAiProcessInvocationState(previousState)) return false;
  return TRANSITION_SET.get(String(previousState))?.has(String(nextState)) ?? false;
}

export function assertAiProcessInvocationTransition(previousState: any, nextState: any): any {
  if (!canTransitionAiProcessInvocation(previousState, nextState)) {
    throw new Error(`invalid_ai_process_invocation_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function transitionAiProcessInvocation(record: AnyRecord, nextState: any, evidence: AnyRecord = {}): AnyRecord {
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
