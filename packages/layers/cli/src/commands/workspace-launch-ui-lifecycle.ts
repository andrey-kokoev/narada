import type { WorkspaceLaunchUiSessionRecord } from './workspace-launch-session-store.js';
import type { WorkspaceLaunchAttemptRecord } from './workspace-launch-types.js';
import {
  transitionWorkspaceLaunchAttempt,
  transitionWorkspaceLaunchUiSession,
  workspaceLaunchAttemptLifecycleFromStatus,
  workspaceLaunchUiSessionLifecycleFromStatus,
  type WorkspaceLaunchAttemptLifecycleState,
  type WorkspaceLaunchUiSessionLifecycleState,
} from './workspace-launch-lifecycle.js';

export function setWorkspaceLaunchUiSessionLifecycle(
  session: WorkspaceLaunchUiSessionRecord,
  nextState: WorkspaceLaunchUiSessionLifecycleState,
): void {
  const current = session.lifecycle_schema && session.lifecycle_state && session.lifecycle_history
    ? {
      schema: session.lifecycle_schema,
      state: session.lifecycle_state,
      history: session.lifecycle_history,
    }
    : workspaceLaunchUiSessionLifecycleFromStatus(session.status);
  const next = transitionWorkspaceLaunchUiSession(current, nextState);
  session.lifecycle_schema = next.schema;
  session.lifecycle_state = next.state;
  session.lifecycle_history = next.history;
  if (nextState === 'closing' || nextState === 'closed' || nextState === 'timeout' || nextState === 'failed') {
    session.status = nextState;
  } else if (nextState === 'open' || nextState === 'starting' || nextState === 'created') {
    session.status = 'open';
  }
}

export function setWorkspaceLaunchAttemptLifecycle(
  attempt: WorkspaceLaunchAttemptRecord,
  nextState: WorkspaceLaunchAttemptLifecycleState,
): void {
  const current = attempt.lifecycle_schema && attempt.lifecycle_state && attempt.lifecycle_history
    ? {
      schema: attempt.lifecycle_schema,
      state: attempt.lifecycle_state,
      history: attempt.lifecycle_history,
    }
    : workspaceLaunchAttemptLifecycleFromStatus(attempt.status);
  const next = transitionWorkspaceLaunchAttempt(current, nextState);
  attempt.lifecycle_schema = next.schema;
  attempt.lifecycle_state = next.state;
  attempt.lifecycle_history = next.history;
  if (nextState === 'queued' || nextState === 'planning' || nextState === 'launching' || nextState === 'launched' || nextState === 'failed' || nextState === 'forgotten') {
    attempt.status = nextState;
  }
}
