import * as support from './workspace-launch-support.js';
import * as handoff from './workspace-launch-handoff.js';
import { emitCliOutputAdmission, emitLongLivedCommandStartup } from '../lib/cli-output.js';
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
  WorkspaceLaunchCommandOutput,
  WorkspaceLaunchCommandResult,
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
  createWorkspaceLaunchUiSessionLifecycle,
  transitionWorkspaceLaunchUiSession,
} from './workspace-launch-lifecycle.js';
import { createWorkspaceLaunchAttemptRunner } from './workspace-launch-ui-attempts.js';
import { executeWorkspaceLaunchUiAction } from './workspace-launch-ui-actions.js';
import { setWorkspaceLaunchUiSessionLifecycle } from './workspace-launch-ui-lifecycle.js';
import { workspaceLaunchAttemptActivityState } from './workspace-launch-observation.js';
import { ensureLaunchArtifact, naradaProperRoot } from '../lib/launch-artifact.js';

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
  const workspaceLaunchArtifact = ensureLaunchArtifact(naradaProperRoot(), 'workspace-launch');

  const rememberedSelection = await readWorkspaceLaunchRememberedSelection();
  const pageModel = selectionServices.buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog);
  const html = buildWorkspaceLaunchSelectionHtml(pageModel, { artifactRoot: workspaceLaunchArtifact.artifact_root });

  const selectionPromise = new Promise<WorkspaceLaunchBrowserSelection>((resolveSelection, rejectSelection) => {
    server = createWorkspaceLaunchUiServer({
      page: () => html,
      asset: (pathname) => readWorkspaceLaunchUiAsset(pathname, workspaceLaunchArtifact.artifact_root),
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
  const selectionUiOutput = [`Narada launcher selection UI: ${url}`];
  if (fallback_used) {
    selectionUiOutput.push(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  }
  emitCliOutputAdmission({ zone: 'interactive', lines: selectionUiOutput });
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

export async function runPersistentWorkspaceLaunchSelectionUi(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  launchSelection: (selection: WorkspaceLaunchBrowserSelection) => Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>>,
  siteCatalog: ResolvedSiteRoot[] = [],
  selectionServices: WorkspaceLaunchSelectionServices,
): Promise<WorkspaceLaunchUiIngress & { status: 'cancelled' | 'timeout'; launch_count: number }> {
  const host = '127.0.0.1';
  let server: ReturnType<typeof createWorkspaceLaunchUiServer> | null = null;
  let settled = false;
  let launchCount = 0;
  const portPolicy = resolveWorkspaceLaunchUiPortPolicy(options);
  const workspaceLaunchArtifact = ensureLaunchArtifact(naradaProperRoot(), 'workspace-launch');
  const registryPaths = resolveRegistryPaths(options);
  const launcherOutputs = support.normalizeLauncherOutput(options.launcherOutput, options);
  const recoveredAttempts = await loadRecoveredWorkspaceLaunchAttempts(registryPaths, {
    expectedLaunchSessionIds: handoff.workspaceLaunchExpectedSessionIds,
  });
  const attempts: WorkspaceLaunchAttemptRecord[] = [...recoveredAttempts];
  launchCount = attempts.filter((attempt) => attempt.status === 'launched').length;
  let uiSessionLifecycle = createWorkspaceLaunchUiSessionLifecycle();
  uiSessionLifecycle = transitionWorkspaceLaunchUiSession(uiSessionLifecycle, 'starting');
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
  const html = buildWorkspaceLaunchSelectionHtml(pageModel, {
    persistent: true,
    artifactRoot: workspaceLaunchArtifact.artifact_root,
  });
  const dashboardState = (): WorkspaceLaunchDashboardState => ({
    schema: 'narada.workspace_launch.ui_session_state.v1',
    ui_session: uiSession,
    attempts: attempts
      .filter((attempt) => attempt.status !== 'forgotten')
      .map((attempt) => ({
        ...attempt,
        activity_state: workspaceLaunchAttemptActivityState(attempt),
      })),
    observed_unowned: [],
    actions: ['submit', 'cancel'],
  });

  const refreshDashboardState = async (): Promise<WorkspaceLaunchDashboardState> => {
    const candidates = attempts.filter((attempt) => (
      attempt.status === 'launched'
      && attempt.expected_launch_session_ids.length > 0
    ));
    let changed = false;
    await Promise.all(candidates.map(async (attempt) => {
      try {
        attempt.observations = await handoff.workspaceLaunchRuntimeObservations(
          attempt.launch_attempt_id,
          attempt.selection,
          records,
          attempt.expected_launch_session_ids,
          support.workspaceLaunchSiteRootsFromLaunchResult(attempt.diagnostic),
          { cleanupStaleSessions: false, pollBudgetMs: 0 },
        );
        attempt.actions = handoff.workspaceLaunchActionsForAttempt(attempt);
        attempt.activity_state = workspaceLaunchAttemptActivityState(attempt);
        attempt.updated_at = new Date().toISOString();
        changed = true;
      } catch {
        // An unverifiable runtime is historical until NARS confirms it again.
        attempt.activity_state = 'historical';
        changed = true;
      }
    }));
    if (changed) {
      try {
        await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
      } catch {
        // The response still reflects fresh in-memory authority; persistence can recover on the next request.
      }
    }
    return dashboardState();
  };

  const runLaunchAttempt = createWorkspaceLaunchAttemptRunner({
    uiSession,
    persistenceDir,
    attempts,
    records,
    launcherOutputs,
    launchSelection,
    onLaunch: () => {
      launchCount += 1;
    },
  });


  const closed = new Promise<'cancelled'>((resolveClosed, rejectClosed) => {
    server = createWorkspaceLaunchUiServer({
      page: () => html,
      asset: (pathname) => readWorkspaceLaunchUiAsset(pathname, workspaceLaunchArtifact.artifact_root),
      dashboard: refreshDashboardState,
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
      action: (launchAttemptId, action) => executeWorkspaceLaunchUiAction({
        uiSession,
        persistenceDir,
        attempts,
        records,
        dashboardState,
        runLaunchAttempt,
      }, launchAttemptId, action),

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
  let listening: Awaited<ReturnType<typeof listenWorkspaceLaunchUiServer>>;
  let ingress: Awaited<ReturnType<typeof resolveWorkspaceLaunchUiIngress>>;
  try {
    listening = await listenWorkspaceLaunchUiServer(server!, host, portPolicy);
    setWorkspaceLaunchUiSessionLifecycle(uiSession, 'open');
    ingress = await resolveWorkspaceLaunchUiIngress({
      uiSessionId: uiSession.ui_session_id,
      directUrl: listening.url,
      host,
      port: options.operatorRouterPort,
    });
  } catch (error) {
    if (uiSession.lifecycle_state !== 'failed' && uiSession.lifecycle_state !== 'closed' && uiSession.lifecycle_state !== 'timeout') {
      setWorkspaceLaunchUiSessionLifecycle(uiSession, 'failed');
    }
    await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
    await closeWorkspaceLaunchUiServer(server);
    throw error;
  }
  const { url, port, fallback_used } = listening;
  const persistentUiOutput = [`Narada launcher selection UI: ${ingress.url}`];
  if (fallback_used) persistentUiOutput.push(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  if (ingress.ingress_mode === 'diagnostic') persistentUiOutput.push(`[launcher] direct UI URL is diagnostic; Operator Console projection unavailable (${ingress.reason ?? 'unknown'}).`);
  persistentUiOutput.push('Selection UI will remain available for additional launches until you close it.');
  emitLongLivedCommandStartup(persistentUiOutput);
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
  } catch (error) {
    if (uiSession.lifecycle_state && uiSession.lifecycle_state !== 'failed' && uiSession.lifecycle_state !== 'closed' && uiSession.lifecycle_state !== 'timeout') {
      setWorkspaceLaunchUiSessionLifecycle(uiSession, 'failed');
    }
    await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
    throw error;
  } finally {
    await closeWorkspaceLaunchUiServer(server);
  }
}

