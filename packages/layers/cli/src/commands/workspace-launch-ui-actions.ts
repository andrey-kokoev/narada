import * as support from './workspace-launch-support.js';
import * as handoff from './workspace-launch-handoff.js';
import { persistWorkspaceLaunchDashboardState } from './workspace-launch-attempt-store.js';
import type { WorkspaceLaunchUiSessionRecord } from './workspace-launch-session-store.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchActionRefusalPayload,
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchDashboardState,
  WorkspaceLaunchRecord,
} from './workspace-launch-types.js';
import type { WorkspaceLaunchUiAction, WorkspaceLaunchUiResponse } from './workspace-launch-ui-server.js';
import { setWorkspaceLaunchAttemptLifecycle } from './workspace-launch-ui-lifecycle.js';

export interface WorkspaceLaunchUiActionContext {
  uiSession: WorkspaceLaunchUiSessionRecord;
  persistenceDir: string;
  attempts: WorkspaceLaunchAttemptRecord[];
  records: WorkspaceLaunchRecord[];
  dashboardState: () => WorkspaceLaunchDashboardState;
  runLaunchAttempt: (selection: WorkspaceLaunchBrowserSelection) => Promise<WorkspaceLaunchAttemptRecord>;
}

export async function executeWorkspaceLaunchUiAction(
  context: WorkspaceLaunchUiActionContext,
  launchAttemptId: string,
  action: WorkspaceLaunchUiAction,
): Promise<WorkspaceLaunchUiResponse> {
  const attempt = context.attempts.find((candidate) => candidate.launch_attempt_id === launchAttemptId);
  if (!attempt) return actionRefusal('launch_attempt_not_found', `Launch attempt not found: ${launchAttemptId}`, 404);
  if (action === 'forget') {
    setWorkspaceLaunchAttemptLifecycle(attempt, 'forgotten');
    attempt.updated_at = new Date().toISOString();
    await persistWorkspaceLaunchDashboardState(context.persistenceDir, context.uiSession, context.attempts);
    return { status: 200, payload: { schema: 'narada.workspace_launch.action_result.v1', status: 'forgotten', dashboard: context.dashboardState() } };
  }
  if (action === 'retry') {
    const retryAttempt = await context.runLaunchAttempt(attempt.selection);
    return {
      status: retryAttempt.status === 'launched' ? 200 : 500,
      payload: { schema: 'narada.workspace_launch.action_result.v1', status: retryAttempt.status, attempt: retryAttempt, dashboard: context.dashboardState() },
    };
  }
  if (action === 'recheck') {
    attempt.updated_at = new Date().toISOString();
    setWorkspaceLaunchAttemptLifecycle(attempt, 'observing');
    try {
      attempt.observations = await handoff.workspaceLaunchRuntimeObservations(
        attempt.launch_attempt_id,
        attempt.selection,
        context.records,
        attempt.expected_launch_session_ids,
        support.workspaceLaunchSiteRootsFromLaunchResult(attempt.diagnostic),
      );
      setWorkspaceLaunchAttemptLifecycle(attempt, 'launched');
    } catch (error) {
      setWorkspaceLaunchAttemptLifecycle(attempt, 'failed');
      attempt.diagnostic = { error: error instanceof Error ? error.message : String(error) };
    }
    attempt.actions = handoff.workspaceLaunchActionsForAttempt(attempt);
    await persistWorkspaceLaunchDashboardState(context.persistenceDir, context.uiSession, context.attempts);
    return { status: 200, payload: { schema: 'narada.workspace_launch.action_result.v1', status: 'rechecked', attempt, dashboard: context.dashboardState() } };
  }
  if (action === 'open-web-ui' || action === 'attach-cli') {
    const command = attachCommandForAction(attempt, action);
    if (!command) return actionRefusal(
      'attach_command_not_available',
      `${action === 'open-web-ui' ? 'Open This UI' : 'Attach CLI To This Session'} requires a discovered attachable NARS session for this launch result.`,
      409,
      context.dashboardState(),
    );
    const projection = await handoff.workspaceLaunchExecuteProjectionAction(attempt, action, command);
    attempt.projections.push(projection);
    attempt.updated_at = new Date().toISOString();
    await persistWorkspaceLaunchDashboardState(context.persistenceDir, context.uiSession, context.attempts);
    return {
      status: 200,
      payload: {
        schema: 'narada.workspace_launch.action_result.v1',
        status: projection.status,
        action,
        command,
        projection,
        message: projection.message,
        dashboard: context.dashboardState(),
      },
    };
  }
  if (action === 'stop-runtime') {
    const result = await handoff.workspaceLaunchRequestRuntimeStop(attempt);
    if (result.status !== 'requested') return { status: 409, payload: { ...result, dashboard: context.dashboardState() } };
    attempt.updated_at = new Date().toISOString();
    attempt.actions = handoff.workspaceLaunchActionsForAttempt(attempt);
    await persistWorkspaceLaunchDashboardState(context.persistenceDir, context.uiSession, context.attempts);
    return { status: 200, payload: { ...result, dashboard: context.dashboardState() } };
  }
  return actionRefusal('projection_lifecycle_not_admitted', 'Stop Projection requires admitted projection lifecycle authority.', 409, context.dashboardState());
}

function attachCommandForAction(attempt: WorkspaceLaunchAttemptRecord, action: WorkspaceLaunchUiAction): string | null {
  const key = action === 'open-web-ui' ? 'agent_web_ui' : action === 'attach-cli' ? 'agent_cli' : null;
  if (!key) return null;
  for (const observation of attempt.observations) {
    const command = observation.attach_commands?.[key];
    if (command) return command;
  }
  return null;
}

function actionRefusal(
  reason_code: string,
  message: string,
  status: number,
  dashboard?: WorkspaceLaunchDashboardState,
): WorkspaceLaunchUiResponse {
  const payload: WorkspaceLaunchActionRefusalPayload = {
    schema: 'narada.workspace_launch.action_refusal.v1',
    status: 'refused',
    reason_code,
    message,
    ...(dashboard ? { dashboard } : {}),
  };
  return { status, payload };
}
