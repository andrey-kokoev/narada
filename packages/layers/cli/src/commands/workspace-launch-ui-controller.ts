import * as support from './workspace-launch-support.js';
import * as handoff from './workspace-launch-handoff.js';
import { ExitCode } from '../lib/exit-codes.js';
import { buildWorkspaceLaunchSelectionHtml } from './launcher-selection-ui.js';
import {
  closeWorkspaceLaunchUiServer,
  createWorkspaceLaunchUiServer,
  listenWorkspaceLaunchUiServer,
  readWorkspaceLaunchUiAsset,
} from './workspace-launch-ui-server.js';
import {
  loadRecoveredWorkspaceLaunchAttempts,
  persistWorkspaceLaunchDashboardState,
  readWorkspaceLaunchRememberedSelection,
  workspaceLaunchUiSessionPersistenceDir,
  writeWorkspaceLaunchRememberedSelection,
} from './workspace-launch-attempt-store.js';
import type { WorkspaceLaunchUiSessionRecord } from './workspace-launch-session-store.js';
import type { WorkspaceLaunchSelectionServices } from './workspace-launch-context.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchDashboardState,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRecord,
} from './workspace-launch-types.js';
import {
  requestWorkspaceLaunchSelectionUiProjectionOpen,
  resolveWorkspaceLaunchUiIngress,
  resolveWorkspaceLaunchUiPortPolicy,
} from './workspace-launch-ingress.js';
import type { WorkspaceLaunchUiIngress } from './workspace-launch-ingress.js';
import { resolveRegistryPaths } from './workspace-launch-registry.js';
import {
  createWorkspaceLaunchAttemptLifecycle,
  createWorkspaceLaunchUiSessionLifecycle,
  transitionWorkspaceLaunchAttempt,
  transitionWorkspaceLaunchUiSession,
  workspaceLaunchAttemptLifecycleFromStatus,
  workspaceLaunchUiSessionLifecycleFromStatus,
  type WorkspaceLaunchAttemptLifecycleState,
  type WorkspaceLaunchUiSessionLifecycleState,
} from './workspace-launch-lifecycle.js';

export async function runWorkspaceLaunchSelectionUi(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
  selectionServices: WorkspaceLaunchSelectionServices,
): Promise<WorkspaceLaunchBrowserSelection> {
  const host = '127.0.0.1';
  let server: ReturnType<typeof createWorkspaceLaunchUiServer> | null = null;
  let settled = false;
  const portPolicy = resolveWorkspaceLaunchUiPortPolicy(options);

  const rememberedSelection = await readWorkspaceLaunchRememberedSelection();
  const pageModel = selectionServices.buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog);
  const html = buildWorkspaceLaunchSelectionHtml(pageModel);

  const selectionPromise = new Promise<WorkspaceLaunchBrowserSelection>((resolveSelection, rejectSelection) => {
    server = createWorkspaceLaunchUiServer({
      page: () => html,
      asset: readWorkspaceLaunchUiAsset,
      selectorModel: (payload) => selectionServices.workspaceLaunchSelectorModel(records, payload as Partial<WorkspaceLaunchBrowserSelection>, siteCatalog),
      submit: async (payload) => {
        const selection = selectionServices.normalizeWorkspaceLaunchBrowserSelection(payload as Partial<WorkspaceLaunchBrowserSelection>);
        await writeWorkspaceLaunchRememberedSelection(selection);
        settled = true;
        return { status: 200, payload: { status: 'accepted' }, afterSend: () => resolveSelection(selection) };
      },
      cancel: async () => {
        settled = true;
        return {
          status: 200,
          payload: { status: 'cancelled' },
          afterSend: () => rejectSelection(new Error('interactive_selection_cancelled')),
        };
      },
    });
    server.on('error', rejectSelection);
  });

  let listening: Awaited<ReturnType<typeof listenWorkspaceLaunchUiServer>>;
  try {
    listening = await listenWorkspaceLaunchUiServer(server!, host, portPolicy);
  } catch (error) {
    throw error;
  }
  const { url, port, fallback_used } = listening;
  console.log(`Narada launcher selection UI: ${url}`);
  if (fallback_used) {
    console.log(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  }
  requestWorkspaceLaunchSelectionUiProjectionOpen(url);

  try {
    return await Promise.race([
      selectionPromise,
      new Promise<WorkspaceLaunchBrowserSelection>((_, rejectTimeout) => {
        const timer = setTimeout(() => {
          if (!settled) rejectTimeout(new Error('interactive_selection_ui_timeout'));
        }, 10 * 60 * 1000);
        timer.unref?.();
      }),
    ]);
  } finally {
    await closeWorkspaceLaunchUiServer(server);
  }
}

function setWorkspaceLaunchUiSessionLifecycle(
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
  session.lifecycle_schema = next.schema as 'narada.workspace_launch.ui_session.lifecycle_state.v1';
  session.lifecycle_state = next.state;
  session.lifecycle_history = next.history;
  if (nextState === 'closing' || nextState === 'closed' || nextState === 'timeout' || nextState === 'failed') {
    session.status = nextState;
  } else if (nextState === 'open' || nextState === 'starting' || nextState === 'created') {
    session.status = 'open';
  }
}

function setWorkspaceLaunchAttemptLifecycle(
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
  attempt.lifecycle_schema = next.schema as 'narada.workspace_launch.attempt.lifecycle_state.v1';
  attempt.lifecycle_state = next.state;
  attempt.lifecycle_history = next.history;
  if (nextState === 'queued' || nextState === 'planning' || nextState === 'launching' || nextState === 'launched' || nextState === 'failed' || nextState === 'forgotten') {
    attempt.status = nextState;
  }
}

export async function runPersistentWorkspaceLaunchSelectionUi(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  launchSelection: (selection: WorkspaceLaunchBrowserSelection) => Promise<{ exitCode: ExitCode; result: unknown }>,
  siteCatalog: ResolvedSiteRoot[] = [],
  selectionServices: WorkspaceLaunchSelectionServices,
): Promise<WorkspaceLaunchUiIngress & { status: 'cancelled' | 'timeout'; launch_count: number }> {
  const host = '127.0.0.1';
  let server: ReturnType<typeof createWorkspaceLaunchUiServer> | null = null;
  let settled = false;
  let launchCount = 0;
  const portPolicy = resolveWorkspaceLaunchUiPortPolicy(options);
  const registryPaths = resolveRegistryPaths(options);
  const launcherOutputs = support.normalizeLauncherOutput(options.launcherOutput, options);
  const recoveredAttempts = await loadRecoveredWorkspaceLaunchAttempts(registryPaths, {
    expectedLaunchSessionIds: handoff.workspaceLaunchExpectedSessionIds,
  });
  const attempts: WorkspaceLaunchAttemptRecord[] = [...recoveredAttempts];
  launchCount = attempts.filter((attempt) => attempt.status === 'launched').length;
  const uiSessionLifecycle = createWorkspaceLaunchUiSessionLifecycle();
  const uiSession: WorkspaceLaunchUiSessionRecord = {
    schema: 'narada.workspace_launch.ui_session.v1',
    ui_session_id: support.workspaceLaunchId('wls'),
    started_at: new Date().toISOString(),
    status: 'open',
    lifecycle_schema: uiSessionLifecycle.schema,
    lifecycle_state: uiSessionLifecycle.state,
    lifecycle_history: uiSessionLifecycle.history,
    url: null,
    registry_paths: registryPaths,
    owner: { package: '@narada2/cli', command: 'launcher workspace-launch', surface: 'interactive-selection-ui' },
  };
  const persistenceDir = workspaceLaunchUiSessionPersistenceDir(uiSession.ui_session_id);

  const rememberedSelection = await readWorkspaceLaunchRememberedSelection();
  const pageModel = selectionServices.buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog);
  const html = buildWorkspaceLaunchSelectionHtml(pageModel, { persistent: true });
  const dashboardState = (): WorkspaceLaunchDashboardState => ({
    schema: 'narada.workspace_launch.ui_session_state.v1',
    ui_session: uiSession,
    attempts: attempts.filter((attempt) => attempt.status !== 'forgotten'),
    observed_unowned: [],
    actions: ['submit', 'cancel'],
  });

  const runLaunchAttempt = async (selection: WorkspaceLaunchBrowserSelection): Promise<WorkspaceLaunchAttemptRecord> => {
    const attempt: WorkspaceLaunchAttemptRecord = {
      schema: 'narada.workspace_launch.attempt.v1',
      launch_attempt_id: support.workspaceLaunchId('wla'),
      ui_session_id: uiSession.ui_session_id,
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
    attempts.push(attempt);
    support.writeLauncherOutput(launcherOutputs, {
      schema: 'narada.workspace_launch.terminal_event.v1',
      event: 'selection_submitted',
      launch_attempt_id: attempt.launch_attempt_id,
      selection,
    }, `[launcher] selection submitted: ${support.formatWorkspaceLaunchSelection(selection)}`);
    setWorkspaceLaunchAttemptLifecycle(attempt, 'planning');
    attempt.result_summary = 'Planning workspace launch.';
    attempt.updated_at = new Date().toISOString();
    try {
      await handoff.workspaceLaunchReapStaleSessionOwnedDescendants(selection, records);
      setWorkspaceLaunchAttemptLifecycle(attempt, 'launching');
      attempt.result_summary = 'Executing host handoff.';
      attempt.updated_at = new Date().toISOString();
      const launch = await launchSelection(selection);
      const success = launch.exitCode === ExitCode.SUCCESS;
      attempt.result_summary = handoff.workspaceLaunchResultSummary(launch.result, success);
      attempt.plan_result_path = stringValue(isRecord(launch.result) ? launch.result.result_path : null);
      attempt.handoffs = [handoff.workspaceLaunchHandoffFromResult(attempt.launch_attempt_id, launch.result, success)];
      if (success) {
        setWorkspaceLaunchAttemptLifecycle(attempt, 'handoff_recorded');
        attempt.expected_launch_session_ids = handoff.workspaceLaunchExpectedSessionIds(launch.result);
        setWorkspaceLaunchAttemptLifecycle(attempt, 'observing');
        attempt.observations = await handoff.workspaceLaunchRuntimeObservations(
          attempt.launch_attempt_id,
          selection,
          records,
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
      if (success) launchCount += 1;
      await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
      support.writeLauncherOutput(launcherOutputs, {
        schema: 'narada.workspace_launch.terminal_event.v1',
        event: success ? 'launch_handed_off' : 'launch_failed',
        launch_attempt_id: attempt.launch_attempt_id,
        status: attempt.status,
        result_path: attempt.plan_result_path,
      }, `[launcher] ${success ? 'handed off' : 'failed'}: ${attempt.result_summary}${attempt.plan_result_path ? ` result=${attempt.plan_result_path}` : ''}`);
      support.writeWorkspaceLaunchCommandOutput(launcherOutputs, attempt);
      return attempt;
    } catch (error) {
      setWorkspaceLaunchAttemptLifecycle(attempt, 'failed');
      attempt.result_summary = error instanceof Error ? error.message : String(error);
      attempt.handoffs = [handoff.workspaceLaunchFailedHandoff(attempt.launch_attempt_id, error)];
      attempt.actions = ['retry', 'forget'];
      attempt.diagnostic = { error: attempt.result_summary };
      attempt.updated_at = new Date().toISOString();
      await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
      support.writeLauncherOutput(launcherOutputs, {
        schema: 'narada.workspace_launch.terminal_event.v1',
        event: 'launch_failed',
        launch_attempt_id: attempt.launch_attempt_id,
        error: attempt.result_summary,
      }, `[launcher] failed: ${attempt.result_summary}`);
      return attempt;
    }
  };

  const closed = new Promise<'cancelled'>((resolveClosed, rejectClosed) => {
    server = createWorkspaceLaunchUiServer({
      page: () => html,
      asset: readWorkspaceLaunchUiAsset,
      dashboard: dashboardState,
      selectorModel: (payload) => selectionServices.workspaceLaunchSelectorModel(records, payload as Partial<WorkspaceLaunchBrowserSelection>, siteCatalog),
      submit: async (payload) => {
        const selection = selectionServices.normalizeWorkspaceLaunchBrowserSelection(payload as Partial<WorkspaceLaunchBrowserSelection>);
        await writeWorkspaceLaunchRememberedSelection(selection);
        const attempt = await runLaunchAttempt(selection);
        return {
          status: attempt.status === 'launched' ? 200 : 500,
          payload: {
            schema: 'narada.workspace_launch.submit_result.v1',
            status: attempt.status,
            launch_count: launchCount,
            attempt,
            dashboard: dashboardState(),
          },
        };
      },
      action: async (launchAttemptId, action) => {
        const attempt = attempts.find((candidate) => candidate.launch_attempt_id === launchAttemptId);
        if (!attempt) return actionRefusal('launch_attempt_not_found', `Launch attempt not found: ${launchAttemptId}`, 404);
        if (action === 'forget') {
          setWorkspaceLaunchAttemptLifecycle(attempt, 'forgotten');
          attempt.updated_at = new Date().toISOString();
          await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
          return { status: 200, payload: { schema: 'narada.workspace_launch.action_result.v1', status: 'forgotten', dashboard: dashboardState() } };
        }
        if (action === 'retry') {
          const retryAttempt = await runLaunchAttempt(attempt.selection);
          return {
            status: retryAttempt.status === 'launched' ? 200 : 500,
            payload: { schema: 'narada.workspace_launch.action_result.v1', status: retryAttempt.status, attempt: retryAttempt, dashboard: dashboardState() },
          };
        }
        if (action === 'recheck') {
          attempt.updated_at = new Date().toISOString();
          setWorkspaceLaunchAttemptLifecycle(attempt, 'observing');
          try {
            attempt.observations = await handoff.workspaceLaunchRuntimeObservations(
              attempt.launch_attempt_id,
              attempt.selection,
              records,
              attempt.expected_launch_session_ids,
              support.workspaceLaunchSiteRootsFromLaunchResult(attempt.diagnostic),
            );
            setWorkspaceLaunchAttemptLifecycle(attempt, 'launched');
          } catch (error) {
            setWorkspaceLaunchAttemptLifecycle(attempt, 'failed');
            attempt.diagnostic = { error: error instanceof Error ? error.message : String(error) };
          }
          attempt.actions = handoff.workspaceLaunchActionsForAttempt(attempt);
          await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
          return { status: 200, payload: { schema: 'narada.workspace_launch.action_result.v1', status: 'rechecked', attempt, dashboard: dashboardState() } };
        }
        if (action === 'open-web-ui' || action === 'attach-cli') {
          const command = attachCommandForAction(attempt, action);
          if (!command) return actionRefusal('attach_command_not_available', `${action === 'open-web-ui' ? 'Open This UI' : 'Attach CLI To This Session'} requires a discovered attachable NARS session for this launch result.`, 409, dashboardState());
          const projection = await handoff.workspaceLaunchExecuteProjectionAction(attempt, action, command);
          attempt.projections.push(projection);
          attempt.updated_at = new Date().toISOString();
          await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
          return {
            status: 200,
            payload: {
              schema: 'narada.workspace_launch.action_result.v1',
              status: projection.status,
              action,
              command,
              projection,
              message: projection.message,
              dashboard: dashboardState(),
            },
          };
        }
        if (action === 'stop-runtime') {
          const result = await handoff.workspaceLaunchRequestRuntimeStop(attempt);
          if (result.status !== 'requested') return { status: 409, payload: { ...result, dashboard: dashboardState() } };
          attempt.updated_at = new Date().toISOString();
          attempt.actions = handoff.workspaceLaunchActionsForAttempt(attempt);
          await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
          return { status: 200, payload: { ...result, dashboard: dashboardState() } };
        }
        return actionRefusal('projection_lifecycle_not_admitted', 'Stop Projection requires admitted projection lifecycle authority.', 409, dashboardState());
      },
      cancel: async () => {
        settled = true;
        setWorkspaceLaunchUiSessionLifecycle(uiSession, 'closing');
        setWorkspaceLaunchUiSessionLifecycle(uiSession, 'closed');
        await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
        return {
          status: 200,
          payload: { status: 'closed', launch_count: launchCount },
          close: true,
          afterSend: () => resolveClosed('cancelled'),
        };
      },
    });
    server.on('error', rejectClosed);
  });
  const { url, port, fallback_used } = await listenWorkspaceLaunchUiServer(server!, host, portPolicy);
  const ingress = await resolveWorkspaceLaunchUiIngress({
    uiSessionId: uiSession.ui_session_id,
    directUrl: url,
    host,
    port: options.operatorRouterPort,
  });
  console.log(`Narada launcher selection UI: ${ingress.url}`);
  if (fallback_used) console.log(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  if (ingress.ingress_mode === 'diagnostic') console.log(`[launcher] direct UI URL is diagnostic; Operator Console projection unavailable (${ingress.reason ?? 'unknown'}).`);
  console.log('Selection UI will remain available for additional launches until you close it.');
  uiSession.url = url;
  await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
  requestWorkspaceLaunchSelectionUiProjectionOpen(ingress.url);

  try {
    const status = await Promise.race([
      closed,
      new Promise<'timeout'>((resolveTimeout) => {
        const timer = setTimeout(() => {
          if (!settled) {
            setWorkspaceLaunchUiSessionLifecycle(uiSession, 'timeout');
            resolveTimeout('timeout');
          }
        }, 8 * 60 * 60 * 1000);
        timer.unref?.();
      }),
    ]);
    await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
    return { ...ingress, status, launch_count: launchCount };
  } finally {
    await closeWorkspaceLaunchUiServer(server);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function attachCommandForAction(attempt: WorkspaceLaunchAttemptRecord, action: string): string | null {
  const key = action === 'open-web-ui' ? 'agent_web_ui' : action === 'attach-cli' ? 'agent_cli' : null;
  if (!key) return null;
  for (const observation of attempt.observations) {
    const command = observation.attach_commands?.[key];
    if (command) return command;
  }
  return null;
}

function actionRefusal(reason_code: string, message: string, status: number, dashboard?: WorkspaceLaunchDashboardState): { status: number; payload: Record<string, unknown> } {
  return {
    status,
    payload: {
      schema: 'narada.workspace_launch.action_refusal.v1',
      status: 'refused',
      reason_code,
      message,
      ...(dashboard ? { dashboard } : {}),
    },
  };
}
