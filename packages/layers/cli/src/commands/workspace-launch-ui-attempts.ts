import { ExitCode } from '../lib/exit-codes.js';
import * as support from './workspace-launch-support.js';
import * as handoff from './workspace-launch-handoff.js';
import {
  persistWorkspaceLaunchDashboardState,
} from './workspace-launch-attempt-store.js';
import type { WorkspaceLaunchUiSessionRecord } from './workspace-launch-session-store.js';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchCommandOutput,
  WorkspaceLaunchCommandResult,
  WorkspaceLaunchRecord,
  WorkspaceLauncherOutputProjection,
} from './workspace-launch-types.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import { createWorkspaceLaunchAttemptLifecycle } from './workspace-launch-lifecycle.js';
import { setWorkspaceLaunchAttemptLifecycle } from './workspace-launch-ui-lifecycle.js';

export interface WorkspaceLaunchAttemptRunnerContext {
  uiSession: WorkspaceLaunchUiSessionRecord;
  persistenceDir: string;
  attempts: WorkspaceLaunchAttemptRecord[];
  records: WorkspaceLaunchRecord[];
  launcherOutputs: WorkspaceLauncherOutputProjection[];
  launchSelection: (selection: WorkspaceLaunchBrowserSelection) => Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>>;
  onLaunch: () => void;
}

export function createWorkspaceLaunchAttemptRunner(context: WorkspaceLaunchAttemptRunnerContext) {
  return async function runWorkspaceLaunchAttempt(selection: WorkspaceLaunchBrowserSelection): Promise<WorkspaceLaunchAttemptRecord> {
    const attempt: WorkspaceLaunchAttemptRecord = {
      schema: 'narada.workspace_launch.attempt.v1',
      launch_attempt_id: support.workspaceLaunchId('wla'),
      ui_session_id: context.uiSession.ui_session_id,
      expected_launch_session_ids: [],
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      selection,
      status: 'queued',
      lifecycle_schema: createWorkspaceLaunchAttemptLifecycle().schema,
      lifecycle_state: 'queued',
      lifecycle_history: ['queued'],
      result_summary: 'Launch queued.',
      plan_result_path: null,
      handoffs: [],
      observations: [],
      projections: [],
      actions: ['recheck', 'forget'],
      diagnostic: null,
    };
    context.attempts.push(attempt);
    support.writeLauncherOutput(context.launcherOutputs, {
      schema: 'narada.workspace_launch.terminal_event.v1',
      event: 'selection_submitted',
      launch_attempt_id: attempt.launch_attempt_id,
      selection,
    }, `[launcher] selection submitted: ${support.formatWorkspaceLaunchSelection(selection)}`);
    setWorkspaceLaunchAttemptLifecycle(attempt, 'planning');
    attempt.result_summary = 'Planning workspace launch.';
    attempt.updated_at = new Date().toISOString();
    try {
      await handoff.workspaceLaunchReapStaleSessionOwnedDescendants(selection, context.records);
      setWorkspaceLaunchAttemptLifecycle(attempt, 'launching');
      attempt.result_summary = 'Executing host handoff.';
      attempt.updated_at = new Date().toISOString();
      const launch = await context.launchSelection(selection);
      const success = launch.exitCode === ExitCode.SUCCESS;
      attempt.result_summary = handoff.workspaceLaunchResultSummary(launch.result, success);
      attempt.plan_result_path = stringValue(support.isRecord(launch.result) ? launch.result.result_path : null);
      attempt.handoffs = [handoff.workspaceLaunchHandoffFromResult(attempt.launch_attempt_id, launch.result, success)];
      if (success) {
        setWorkspaceLaunchAttemptLifecycle(attempt, 'handoff_recorded');
        attempt.expected_launch_session_ids = handoff.workspaceLaunchExpectedSessionIds(launch.result);
        setWorkspaceLaunchAttemptLifecycle(attempt, 'observing');
        attempt.observations = await handoff.workspaceLaunchRuntimeObservations(
          attempt.launch_attempt_id,
          selection,
          context.records,
          attempt.expected_launch_session_ids,
          support.workspaceLaunchSiteRootsFromLaunchResult(launch.result),
        );
        setWorkspaceLaunchAttemptLifecycle(attempt, 'launched');
        attempt.actions = handoff.workspaceLaunchActionsForAttempt(attempt);
      } else {
        setWorkspaceLaunchAttemptLifecycle(attempt, 'failed');
        attempt.expected_launch_session_ids = [];
        attempt.observations = [];
        attempt.actions = ['retry', 'forget'];
      }
      attempt.diagnostic = launch.result;
      attempt.updated_at = new Date().toISOString();
      if (success) context.onLaunch();
      await persistWorkspaceLaunchDashboardState(context.persistenceDir, context.uiSession, context.attempts);
      support.writeLauncherOutput(context.launcherOutputs, {
        schema: 'narada.workspace_launch.terminal_event.v1',
        event: success ? 'launch_handed_off' : 'launch_failed',
        launch_attempt_id: attempt.launch_attempt_id,
        status: attempt.status,
        result_path: attempt.plan_result_path,
      }, `[launcher] ${success ? 'handed off' : 'failed'}: ${attempt.result_summary}${attempt.plan_result_path ? ` result=${attempt.plan_result_path}` : ''}`);
      return attempt;
    } catch (error) {
      setWorkspaceLaunchAttemptLifecycle(attempt, 'failed');
      attempt.result_summary = error instanceof Error ? error.message : String(error);
      attempt.handoffs = [handoff.workspaceLaunchFailedHandoff(attempt.launch_attempt_id, error)];
      attempt.actions = ['retry', 'forget'];
      attempt.diagnostic = { error: attempt.result_summary };
      attempt.updated_at = new Date().toISOString();
      await persistWorkspaceLaunchDashboardState(context.persistenceDir, context.uiSession, context.attempts);
      support.writeLauncherOutput(context.launcherOutputs, {
        schema: 'narada.workspace_launch.terminal_event.v1',
        event: 'launch_failed',
        launch_attempt_id: attempt.launch_attempt_id,
        error: attempt.result_summary,
      }, `[launcher] failed: ${attempt.result_summary}`);
      return attempt;
    }
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
