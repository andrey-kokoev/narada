export const WORKSPACE_LAUNCH_UI_SESSION_LIFECYCLE_SCHEMA = 'narada.workspace_launch.ui_session.lifecycle_state.v1' as const;
export const WORKSPACE_LAUNCH_ATTEMPT_LIFECYCLE_SCHEMA = 'narada.workspace_launch.attempt.lifecycle_state.v1' as const;

export const WORKSPACE_LAUNCH_UI_SESSION_STATES = [
  'created',
  'starting',
  'open',
  'closing',
  'closed',
  'timeout',
  'failed',
] as const;

export type WorkspaceLaunchUiSessionLifecycleState = typeof WORKSPACE_LAUNCH_UI_SESSION_STATES[number];

export const WORKSPACE_LAUNCH_ATTEMPT_STATES = [
  'queued',
  'planning',
  'launching',
  'handoff_recorded',
  'observing',
  'launched',
  'failed',
  'forgotten',
] as const;

export type WorkspaceLaunchAttemptLifecycleState = typeof WORKSPACE_LAUNCH_ATTEMPT_STATES[number];

export interface WorkspaceLaunchLifecycleEvidence<State extends string, Schema extends string = string> {
  schema: Schema;
  state: State;
  history: State[];
}

export type WorkspaceLaunchUiSessionLifecycleEvidence = WorkspaceLaunchLifecycleEvidence<
  WorkspaceLaunchUiSessionLifecycleState,
  typeof WORKSPACE_LAUNCH_UI_SESSION_LIFECYCLE_SCHEMA
>;

export type WorkspaceLaunchAttemptLifecycleEvidence = WorkspaceLaunchLifecycleEvidence<
  WorkspaceLaunchAttemptLifecycleState,
  typeof WORKSPACE_LAUNCH_ATTEMPT_LIFECYCLE_SCHEMA
>;

const UI_SESSION_TRANSITIONS: Record<WorkspaceLaunchUiSessionLifecycleState, readonly WorkspaceLaunchUiSessionLifecycleState[]> = {
  created: ['starting', 'failed'],
  starting: ['open', 'failed'],
  open: ['closing', 'timeout', 'failed'],
  closing: ['closed', 'failed'],
  closed: [],
  timeout: ['closed'],
  failed: ['closing', 'closed'],
};

const ATTEMPT_TRANSITIONS: Record<WorkspaceLaunchAttemptLifecycleState, readonly WorkspaceLaunchAttemptLifecycleState[]> = {
  queued: ['planning', 'failed', 'forgotten'],
  planning: ['launching', 'failed', 'forgotten'],
  launching: ['handoff_recorded', 'failed', 'forgotten'],
  handoff_recorded: ['observing', 'failed', 'forgotten'],
  observing: ['launched', 'failed', 'forgotten'],
  launched: ['observing', 'forgotten'],
  failed: ['forgotten'],
  forgotten: [],
};

export function canTransitionWorkspaceLaunchUiSession(
  from: WorkspaceLaunchUiSessionLifecycleState,
  to: WorkspaceLaunchUiSessionLifecycleState,
): boolean {
  assertWorkspaceLaunchUiSessionState(from);
  assertWorkspaceLaunchUiSessionState(to);
  return from === to || UI_SESSION_TRANSITIONS[from].includes(to);
}

export function canTransitionWorkspaceLaunchAttempt(
  from: WorkspaceLaunchAttemptLifecycleState,
  to: WorkspaceLaunchAttemptLifecycleState,
): boolean {
  assertWorkspaceLaunchAttemptState(from);
  assertWorkspaceLaunchAttemptState(to);
  return from === to || ATTEMPT_TRANSITIONS[from].includes(to);
}

export function createWorkspaceLaunchUiSessionLifecycle(
  initialState: WorkspaceLaunchUiSessionLifecycleState = 'created',
): WorkspaceLaunchUiSessionLifecycleEvidence {
  assertWorkspaceLaunchUiSessionState(initialState);
  return {
    schema: WORKSPACE_LAUNCH_UI_SESSION_LIFECYCLE_SCHEMA,
    state: initialState,
    history: [initialState],
  };
}

export function createWorkspaceLaunchAttemptLifecycle(
  initialState: WorkspaceLaunchAttemptLifecycleState = 'queued',
): WorkspaceLaunchAttemptLifecycleEvidence {
  assertWorkspaceLaunchAttemptState(initialState);
  return {
    schema: WORKSPACE_LAUNCH_ATTEMPT_LIFECYCLE_SCHEMA,
    state: initialState,
    history: [initialState],
  };
}

export function transitionWorkspaceLaunchUiSession(
  lifecycle: WorkspaceLaunchUiSessionLifecycleEvidence,
  nextState: WorkspaceLaunchUiSessionLifecycleState,
): WorkspaceLaunchUiSessionLifecycleEvidence {
  assertWorkspaceLaunchUiSessionState(nextState);
  if (!canTransitionWorkspaceLaunchUiSession(lifecycle.state, nextState)) {
    throw new Error(`invalid_workspace_launch_ui_session_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : { schema: WORKSPACE_LAUNCH_UI_SESSION_LIFECYCLE_SCHEMA, state: nextState, history: [...lifecycle.history, nextState] };
}

export function transitionWorkspaceLaunchAttempt(
  lifecycle: WorkspaceLaunchAttemptLifecycleEvidence,
  nextState: WorkspaceLaunchAttemptLifecycleState,
): WorkspaceLaunchAttemptLifecycleEvidence {
  assertWorkspaceLaunchAttemptState(nextState);
  if (!canTransitionWorkspaceLaunchAttempt(lifecycle.state, nextState)) {
    throw new Error(`invalid_workspace_launch_attempt_transition: ${lifecycle.state}->${nextState}`);
  }
  return lifecycle.state === nextState
    ? lifecycle
    : { schema: WORKSPACE_LAUNCH_ATTEMPT_LIFECYCLE_SCHEMA, state: nextState, history: [...lifecycle.history, nextState] };
}

export function workspaceLaunchUiSessionLifecycleFromStatus(
  status: 'open' | 'closing' | 'closed' | 'timeout' | 'failed',
): WorkspaceLaunchUiSessionLifecycleEvidence {
  const state = status;
  return {
    schema: WORKSPACE_LAUNCH_UI_SESSION_LIFECYCLE_SCHEMA,
    state,
    history: state === 'open' ? ['created', 'starting', 'open'] : [state],
  };
}

export function workspaceLaunchAttemptLifecycleFromStatus(
  status: 'queued' | 'planning' | 'launching' | 'launched' | 'failed' | 'forgotten',
): WorkspaceLaunchAttemptLifecycleEvidence {
  const histories: Record<typeof status, WorkspaceLaunchAttemptLifecycleState[]> = {
    queued: ['queued'],
    planning: ['queued', 'planning'],
    launching: ['queued', 'planning', 'launching'],
    launched: ['queued', 'planning', 'launching', 'handoff_recorded', 'observing', 'launched'],
    failed: ['queued', 'planning', 'launching', 'failed'],
    forgotten: ['queued', 'forgotten'],
  };
  return {
    schema: WORKSPACE_LAUNCH_ATTEMPT_LIFECYCLE_SCHEMA,
    state: status,
    history: histories[status],
  };
}

function assertWorkspaceLaunchUiSessionState(state: string): asserts state is WorkspaceLaunchUiSessionLifecycleState {
  if (!(WORKSPACE_LAUNCH_UI_SESSION_STATES as readonly string[]).includes(state)) {
    throw new Error(`unsupported_workspace_launch_ui_session_state: ${state}`);
  }
}

function assertWorkspaceLaunchAttemptState(state: string): asserts state is WorkspaceLaunchAttemptLifecycleState {
  if (!(WORKSPACE_LAUNCH_ATTEMPT_STATES as readonly string[]).includes(state)) {
    throw new Error(`unsupported_workspace_launch_attempt_state: ${state}`);
  }
}
