export const NARS_SESSION_LIFECYCLE_STATE_SCHEMA = 'narada.nars.session_lifecycle_state.v1' as const;

export const NARS_SESSION_LIFECYCLE_STATES = Object.freeze([
  'starting',
  'ready',
  'closing',
  'closed',
  'failed',
]) as readonly ['starting', 'ready', 'closing', 'closed', 'failed'];

export type NarsSessionLifecycleState = typeof NARS_SESSION_LIFECYCLE_STATES[number];

export const NARS_SESSION_LIFECYCLE_TERMINAL_STATES = Object.freeze(['closed']);

export const NARS_SESSION_LIFECYCLE_TRANSITIONS = Object.freeze({
  starting: Object.freeze(['ready', 'closing', 'failed']),
  ready: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['closed', 'failed']),
  failed: Object.freeze(['closed']),
  closed: Object.freeze([]),
});

const STATE_SET = new Set<NarsSessionLifecycleState>(NARS_SESSION_LIFECYCLE_STATES);
const TERMINAL_SET = new Set<typeof NARS_SESSION_LIFECYCLE_TERMINAL_STATES[number]>(NARS_SESSION_LIFECYCLE_TERMINAL_STATES);
const TRANSITION_SET = new Map<NarsSessionLifecycleState, ReadonlySet<NarsSessionLifecycleState>>(
  Object.entries(NARS_SESSION_LIFECYCLE_TRANSITIONS)
    .map(([state, nextStates]) => [state as NarsSessionLifecycleState, new Set(nextStates as readonly NarsSessionLifecycleState[])]),
);

interface SessionLifecycleEvent {
  event?: unknown;
  lifecycle_state?: unknown;
}

export function isNarsSessionLifecycleState(state: unknown): state is NarsSessionLifecycleState {
  return STATE_SET.has(state as NarsSessionLifecycleState);
}

export function isNarsSessionLifecycleTerminalState(state: unknown): state is typeof NARS_SESSION_LIFECYCLE_TERMINAL_STATES[number] {
  return TERMINAL_SET.has(state as typeof NARS_SESSION_LIFECYCLE_TERMINAL_STATES[number]);
}

export function canTransitionNarsSessionLifecycle(previousState: unknown, nextState: unknown): nextState is NarsSessionLifecycleState {
  if (!isNarsSessionLifecycleState(nextState) || !isNarsSessionLifecycleState(previousState)) return false;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsSessionLifecycleTransition(previousState: unknown, nextState: unknown): NarsSessionLifecycleState {
  if (!canTransitionNarsSessionLifecycle(previousState, nextState)) {
    throw new Error(`invalid_nars_session_transition:${previousState}:${nextState}`);
  }
  return nextState as NarsSessionLifecycleState;
}

export function normalizeNarsSessionLifecycleState(state: unknown = 'starting'): NarsSessionLifecycleState {
  if (!isNarsSessionLifecycleState(state)) {
    throw new Error(`invalid_nars_session_lifecycle_state:${state}`);
  }
  return state;
}

export function transitionNarsSessionLifecycle(previousState: NarsSessionLifecycleState, nextState: unknown): NarsSessionLifecycleState {
  return assertNarsSessionLifecycleTransition(previousState, nextState);
}

export function rehydrateNarsSessionLifecycle(events: readonly unknown[] = []): NarsSessionLifecycleState {
  let lifecycle: NarsSessionLifecycleState = 'starting';
  for (const event of events) {
    const candidate = event !== null && typeof event === 'object' ? event as SessionLifecycleEvent : {};
    if (candidate.event === 'session_lifecycle_transition' && canTransitionNarsSessionLifecycle(lifecycle, candidate.lifecycle_state)) {
      lifecycle = candidate.lifecycle_state as NarsSessionLifecycleState;
    } else if (candidate.event === 'session_closed') {
      lifecycle = 'closed';
    }
  }
  return normalizeNarsSessionLifecycleState(lifecycle);
}
