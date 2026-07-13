import { existsSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { runGovernedCommandSync, startOperatorTerminal } from '@narada2/process-launch-posture';
import { discoverNarsSessions } from '@narada2/nars-session-core/session-index';
import * as support from './workspace-launch-support.js';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchHandoffRecord,
  WorkspaceLaunchObservationRecord,
  WorkspaceLaunchProjectionObservationRecord,
  WorkspaceLaunchRecord,
} from './workspace-launch-types.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import { selectLaunchRecords } from './workspace-launch-registry.js';

function workspaceLaunchString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function workspaceLaunchReapStaleSessionOwnedDescendants(
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
): Promise<{ scanned: number; cleanup_requested: number }> {
  const siteRoots = workspaceLaunchSiteRootsForSelection(selection, records);
  const attempted = new Set<string>();
  let scanned = 0;
  for (const siteRoot of siteRoots) {
    try {
      const discovery = discoverNarsSessions({ siteRoot });
      for (const session of discovery.sessions) {
        const normalized = { ...session, site_root: session.site_root ?? siteRoot };
        scanned += 1;
        if (!workspaceLaunchSessionMatchesSelection(normalized, selection)) continue;
        if (!workspaceLaunchSessionOwnedCleanupAllowed(normalized)) continue;
        if (!workspaceLaunchSessionIsTerminalForCleanup(normalized)) continue;
        await workspaceLaunchRequestStaleSessionCleanup(normalized, attempted);
      }
    } catch {
      // Reaper preflight is best-effort; unreadable indexes must not block a fresh launch.
    }
  }
  return { scanned, cleanup_requested: attempted.size };
}

export function workspaceLaunchResultSummary(result: unknown, success: boolean): string {
  if (!success) {
    const error = support.isRecord(result) ? workspaceLaunchString(result.error) ?? workspaceLaunchString(result.reason) : null;
    return error ?? 'Launch failed.';
  }
  const record = support.isRecord(result) ? result : {};
  const count = typeof record.count === 'number' ? record.count : null;
  if (count !== null) return `Launch accepted for ${count} workspace launch${count === 1 ? '' : 'es'}.`;
  return 'Launch accepted.';
}

export function workspaceLaunchActionsForAttempt(attempt: WorkspaceLaunchAttemptRecord): string[] {
  const actions = ['recheck'];
  if (workspaceLaunchAttachCommandForAction(attempt, 'open-web-ui')) actions.push('open-web-ui');
  if (workspaceLaunchAttachCommandForAction(attempt, 'attach-cli')) actions.push('attach-cli');
  actions.push('retry');
  if (workspaceLaunchRuntimeStopControlPath(attempt)) actions.push('stop-runtime');
  actions.push('forget');
  return support.unique(actions);
}

export async function workspaceLaunchRequestRuntimeStop(attempt: WorkspaceLaunchAttemptRecord): Promise<Record<string, unknown>> {
  const controlPath = workspaceLaunchRuntimeStopControlPath(attempt);
  if (!controlPath) {
    return {
      schema: 'narada.workspace_launch.action_refusal.v1',
      status: 'refused',
      reason_code: 'runtime_lifecycle_not_admitted',
      message: 'Stop Runtime requires an admitted NARS control path for this session.',
    };
  }
  const requestId = support.workspaceLaunchId('stop_runtime');
  const frame = {
    id: requestId,
    method: 'session.close',
    params: {
      source: 'launcher-session-dashboard',
      launch_attempt_id: attempt.launch_attempt_id,
    },
  };
  await appendFile(controlPath, `${JSON.stringify(frame)}\n`, 'utf8');
  return {
    schema: 'narada.workspace_launch.action_result.v1',
    status: 'requested',
    action: 'stop-runtime',
    request_id: requestId,
    control_path: controlPath,
    message: 'Stop Runtime requested through NARS session control path.',
  };
}

function workspaceLaunchRuntimeStopControlPath(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.control_path && existsSync(observation.control_path)) return observation.control_path;
  }
  return null;
}

function workspaceLaunchAttachCommandForAction(attempt: WorkspaceLaunchAttemptRecord, action: string): string | null {
  const commandKey = action === 'open-web-ui' ? 'agent_web_ui' : action === 'attach-cli' ? 'agent_cli' : null;
  if (!commandKey) return null;
  for (const observation of attempt.observations) {
    const command = observation.attach_commands?.[commandKey];
    if (command) return command;
  }
  return null;
}

export async function workspaceLaunchExecuteProjectionAction(
  attempt: WorkspaceLaunchAttemptRecord,
  action: string,
  command: string,
): Promise<WorkspaceLaunchProjectionObservationRecord> {
  const projectionKind = action === 'open-web-ui' ? 'agent-web-ui' : 'agent-cli';
  const sessionId = workspaceLaunchProjectionSessionId(attempt);
  const qualifiedAgentId = support.workspaceLaunchProjectionQualifiedAgentId(attempt);
  const titleSuffix = qualifiedAgentId
    ? (projectionKind === 'agent-web-ui' ? 'web ui' : 'runtime')
    : (sessionId ?? attempt.launch_attempt_id);
  const title = `${qualifiedAgentId ?? projectionKind} ${titleSuffix}`;
  const cwd = workspaceLaunchProjectionCwd(attempt) ?? process.cwd();
  if (action === 'open-web-ui') {
    try {
      const host = await support.workspaceLaunchStartHiddenProjectionHost(command, cwd);
      return {
        schema: 'narada.workspace_launch.observed_projection.v1',
        observation_id: support.workspaceLaunchId('wlp'),
        launch_attempt_id: attempt.launch_attempt_id,
        projection_kind: projectionKind,
        session_id: sessionId,
        status: 'handed_off',
        command,
        authority: 'nars_client_projection_contract',
        ownership_posture: 'handoff_only',
        observed_at: new Date().toISOString(),
        message: `${projectionKind} projection host started hidden; browser projection owns visible operator surface.`,
        diagnostic: { ...host, command: support.redactWorkspaceLaunchCommand(command) },
      };
    } catch (error) {
      return {
        schema: 'narada.workspace_launch.observed_projection.v1',
        observation_id: support.workspaceLaunchId('wlp'),
        launch_attempt_id: attempt.launch_attempt_id,
        projection_kind: projectionKind,
        session_id: sessionId,
        status: 'failed',
        command,
        authority: 'nars_client_projection_contract',
        ownership_posture: 'handoff_only',
        observed_at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        diagnostic: { command: support.redactWorkspaceLaunchCommand(command) },
      };
    }
  }
  const wtArgs = ['new-tab', '--title', title, '-d', cwd, 'pwsh', '-NoExit', '-Command', command];
  const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
  const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
  try {
    const launch = terminalCaptureLog
      ? (await support.captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs))
      : startOperatorTerminal('wt', effectiveWtArgs).result;
    if (launch.error) throw launch.error;
    if (launch.status !== 0) throw new Error(`projection_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
    return {
      schema: 'narada.workspace_launch.observed_projection.v1',
      observation_id: support.workspaceLaunchId('wlp'),
      launch_attempt_id: attempt.launch_attempt_id,
      projection_kind: projectionKind,
      session_id: sessionId,
      status: 'handed_off',
      command,
      authority: 'nars_client_projection_contract',
      ownership_posture: 'handoff_only',
      observed_at: new Date().toISOString(),
      message: `${projectionKind} projection handoff accepted by operator terminal authority.`,
      diagnostic: { wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs), wt_exit_code: launch.status ?? 0 },
    };
  } catch (error) {
    return {
      schema: 'narada.workspace_launch.observed_projection.v1',
      observation_id: support.workspaceLaunchId('wlp'),
      launch_attempt_id: attempt.launch_attempt_id,
      projection_kind: projectionKind,
      session_id: sessionId,
      status: 'failed',
      command,
      authority: 'nars_client_projection_contract',
      ownership_posture: 'handoff_only',
      observed_at: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      diagnostic: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

function workspaceLaunchProjectionSessionId(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.session_id) return observation.session_id;
  }
  return null;
}

function workspaceLaunchProjectionCwd(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.site_root) return observation.site_root;
  }
  for (const handoff of attempt.handoffs) {
    if (handoff.cwd) return handoff.cwd;
  }
  return null;
}

export function workspaceLaunchHandoffFromResult(launchAttemptId: string, result: unknown, success: boolean): WorkspaceLaunchHandoffRecord {
  const record = support.isRecord(result) ? result : {};
  const hiddenRuntimeLaunches = Array.isArray(record.hidden_runtime_launches) ? record.hidden_runtime_launches : [];
  if (record.hidden_runtime_invoked === true || hiddenRuntimeLaunches.length > 0) {
    const selectedAgents = Array.isArray(record.selected_agents) ? record.selected_agents.filter(support.isRecord) : [];
    const firstAgent = selectedAgents.find((agent) => agent.runtime_start_execution_mode === 'hidden_detached') ?? selectedAgents[0];
    return {
      schema: 'narada.workspace_launch.handoff.v1',
      handoff_id: support.workspaceLaunchId('wlh'),
      launch_attempt_id: launchAttemptId,
      posture: 'hidden_runtime_host',
      status: success ? 'handed_off' : 'failed',
      command: 'hidden_runtime_host',
      argv_redacted: redactWorkspaceLaunchArgv(support.stringArray(firstAgent?.hidden_runtime_start_command ?? firstAgent?.runtime_start_command)),
      cwd: workspaceLaunchString(firstAgent?.runtime_start_cwd) ?? workspaceLaunchHandoffCwd(record),
      exit_code: null,
      ownership_posture: 'handoff_only',
      diagnostic_ref: workspaceLaunchString(record.result_path),
    };
  }
  const wtArgs = support.workspaceLaunchLegacyTerminalWtArgs(record);
  return {
    schema: 'narada.workspace_launch.handoff.v1',
    handoff_id: support.workspaceLaunchId('wlh'),
    launch_attempt_id: launchAttemptId,
    posture: 'operator_terminal',
    status: success ? 'handed_off' : 'failed',
    command: wtArgs.length > 0 ? 'wt' : null,
    argv_redacted: redactWorkspaceLaunchArgv(wtArgs),
    cwd: workspaceLaunchHandoffCwd(record),
    exit_code: typeof record.wt_exit_code === 'number' ? record.wt_exit_code : null,
    ownership_posture: 'handoff_only',
    diagnostic_ref: workspaceLaunchString(record.result_path),
  };
}

export function workspaceLaunchFailedHandoff(launchAttemptId: string, error: unknown): WorkspaceLaunchHandoffRecord {
  return {
    schema: 'narada.workspace_launch.handoff.v1',
    handoff_id: support.workspaceLaunchId('wlh'),
    launch_attempt_id: launchAttemptId,
    posture: 'operator_terminal',
    status: 'failed',
    command: null,
    argv_redacted: [],
    cwd: null,
    exit_code: null,
    ownership_posture: 'handoff_only',
    diagnostic_ref: error instanceof Error ? error.message : String(error),
  };
}

function workspaceLaunchWaitingObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection): WorkspaceLaunchObservationRecord {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: support.workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: null,
    site_root: null,
    health: 'waiting',
    authority: 'nars_session_management',
    ownership_posture: 'not_yet_observed',
    last_checked_at: new Date().toISOString(),
    message: `Waiting for NARS session discovery for ${selection.site.join(', ')} / ${selection.role.join(', ')}.`,
  };
}

export async function workspaceLaunchRuntimeObservations(
  launchAttemptId: string,
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
  expectedLaunchSessionIds: string[] = [],
  launchSiteRoots: string[] = [],
): Promise<WorkspaceLaunchObservationRecord[]> {
  const siteRoots = support.unique(
    (launchSiteRoots.length > 0 ? launchSiteRoots : workspaceLaunchSiteRootsForSelection(selection, records))
      .map((siteRoot) => resolve(siteRoot)),
  );
  if (siteRoots.length === 0) return [workspaceLaunchWaitingObservation(launchAttemptId, selection)];
  const expectedLaunchSessionIdSet = new Set(expectedLaunchSessionIds.map((value) => value.trim()).filter(Boolean));
  const pollBudgetMs = workspaceLaunchRuntimeObservationPollBudgetMs();
  const pollIntervalMs = workspaceLaunchRuntimeObservationPollIntervalMs();
  const deadline = Date.now() + pollBudgetMs;
  let sawDiscoveredSession = false;
  const staleCleanupAttempted = new Set<string>();

  while (true) {
    const discoveredSessions: Record<string, unknown>[] = [];
    const candidates: Record<string, unknown>[] = [];
    for (const siteRoot of siteRoots) {
      try {
        const initialDiscovery = discoverNarsSessions({ siteRoot });
        const healthBySessionId = await workspaceLaunchProbeHealthBySessionId(initialDiscovery.sessions);
        const discovery = healthBySessionId.size > 0 ? discoverNarsSessions({ siteRoot, healthBySessionId }) : initialDiscovery;
        for (const session of discovery.sessions) {
          const normalized = { ...session, site_root: session.site_root ?? siteRoot };
          discoveredSessions.push(normalized);
          if (!workspaceLaunchSessionMatchesSelection(normalized, selection)) continue;
          if (workspaceLaunchSessionMatchesExpectedLaunch(normalized, expectedLaunchSessionIdSet)) {
            candidates.push(normalized);
          } else if (workspaceLaunchSessionIsStaleSessionOwnedCandidate(normalized, expectedLaunchSessionIdSet)) {
            await workspaceLaunchRequestStaleSessionCleanup(normalized, staleCleanupAttempted);
          }
        }
      } catch {
        // Missing or unreadable session indexes keep the launch in waiting state; they are not launch failures.
      }
    }
    sawDiscoveredSession ||= discoveredSessions.length > 0;
    if (candidates.length === 0) {
      if (Date.now() >= deadline) break;
      await workspaceLaunchObservationPause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));      continue;
    }
    const activeCandidates = candidates.filter((session) => {
      const displayState = workspaceLaunchString(session.display_state);
      const terminalState = workspaceLaunchString(session.terminal_state);
      return terminalState !== 'closed' && (displayState === 'active' || displayState === 'starting_or_degraded' || displayState === 'stale');
    });
    const matched = activeCandidates.length > 0 ? activeCandidates : candidates;
    if (matched.length > 1) return [workspaceLaunchAmbiguousObservation(launchAttemptId, selection, matched)];
    return [workspaceLaunchObservationFromSession(launchAttemptId, matched[0])];
  }
  if (!sawDiscoveredSession) return [workspaceLaunchWaitingObservation(launchAttemptId, selection)];
  return [workspaceLaunchUnownedObservation(launchAttemptId, selection)];
}

export function workspaceLaunchExpectedSessionIds(result: unknown): string[] {
  const resultRecord = support.isRecord(result) ? result : null;
  const selectedAgents = Array.isArray(resultRecord?.selected_agents) ? resultRecord.selected_agents : [];
  return selectedAgents
    .map((agent) => support.isRecord(agent) ? workspaceLaunchString(agent.launch_session_id) : null)
    .filter((value): value is string => Boolean(value));
}

function workspaceLaunchSessionMatchesExpectedLaunch(session: Record<string, unknown>, expectedLaunchSessionIds: Set<string>): boolean {
  if (expectedLaunchSessionIds.size === 0) return true;
  const launchSessionId = workspaceLaunchSessionLaunchSessionId(session);
  return launchSessionId !== null && expectedLaunchSessionIds.has(launchSessionId);
}

function workspaceLaunchSessionLaunchSessionId(session: Record<string, unknown>): string | null {
  const record = support.isRecord(session.record) ? session.record : null;
  const ownership = support.isRecord(session.process_ownership) ? session.process_ownership : support.isRecord(record?.process_ownership) ? record.process_ownership : null;
  return workspaceLaunchString(session.launch_session_id)
    ?? workspaceLaunchString(record?.launch_session_id)
    ?? workspaceLaunchString(ownership?.launch_session_id);
}

function workspaceLaunchSessionOwnership(session: Record<string, unknown>): Record<string, unknown> | null {
  const record = support.isRecord(session.record) ? session.record : null;
  return support.isRecord(session.process_ownership) ? session.process_ownership : support.isRecord(record?.process_ownership) ? record.process_ownership : null;
}

function workspaceLaunchSessionIsStaleSessionOwnedCandidate(session: Record<string, unknown>, expectedLaunchSessionIds: Set<string>): boolean {
  if (expectedLaunchSessionIds.size === 0) return false;
  if (!workspaceLaunchSessionOwnedCleanupAllowed(session)) return false;
  const launchSessionId = workspaceLaunchSessionLaunchSessionId(session);
  return launchSessionId !== null && !expectedLaunchSessionIds.has(launchSessionId);
}

export function workspaceLaunchSessionOwnedCleanupAllowed(session: Record<string, unknown>): boolean {
  const ownership = workspaceLaunchSessionOwnership(session);
  return Boolean(ownership && ownership.ownership === 'session_owned' && ownership.cleanup_policy === 'terminate_with_launch_session');
}

export function workspaceLaunchSessionIsTerminalForCleanup(session: Record<string, unknown>): boolean {
  const displayState = workspaceLaunchString(session.display_state);
  const terminalState = workspaceLaunchString(session.terminal_state);
  return terminalState === 'closed' || displayState === 'closed';
}

export async function workspaceLaunchRequestStaleSessionCleanup(session: Record<string, unknown>, attempted: Set<string>): Promise<void> {
  const sessionId = workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id) ?? workspaceLaunchSessionLaunchSessionId(session);
  if (!sessionId || attempted.has(sessionId)) return;
  attempted.add(sessionId);
  const controlPath = workspaceLaunchControlPathFromSession(session);
  if (controlPath && existsSync(controlPath)) {
    const frame = {
      id: support.workspaceLaunchId('stale_cleanup'),
      method: 'session.close',
      params: {
        source: 'launcher-session-owned-process-cleanup',
        reason: 'stale_session_owned_launch_session_superseded',
        stale_launch_session_id: workspaceLaunchSessionLaunchSessionId(session),
      },
    };
    try {
      await appendFile(controlPath, `${JSON.stringify(frame)}\n`, 'utf8');
    } catch {
      // Process-tree termination below is the hard cleanup fallback for session-owned stale runtime processes.
    }
  }
  const ownership = workspaceLaunchSessionOwnership(session);
  const pid = workspaceLaunchInteger(session.pid) ?? workspaceLaunchInteger(ownership?.pid);
  if (pid && pid !== process.pid) workspaceLaunchTerminateStaleProcessTree(pid);
}

function workspaceLaunchTerminateStaleProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      runGovernedCommandSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    process.kill(pid, 'SIGTERM');
  } catch {
    // Cleanup is best-effort; launch observation must not fail because an already-dead process raced cleanup.
  }
}

function workspaceLaunchInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

async function workspaceLaunchProbeHealthBySessionId(sessions: Record<string, unknown>[]): Promise<Map<string, unknown>> {
  const healthBySessionId = new Map<string, unknown>();
  const pairs = await Promise.all(sessions.map(async (session) => {
    const sessionId = workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id);
    if (!sessionId) return null;
    const health = await workspaceLaunchProbeSessionHealth(session);
    return health === null ? null : [sessionId, health] as const;
  }));
  for (const pair of pairs) {
    if (pair !== null) healthBySessionId.set(pair[0], pair[1]);
  }
  return healthBySessionId;
}

async function workspaceLaunchProbeSessionHealth(session: Record<string, unknown>): Promise<unknown | null> {
  const record = support.isRecord(session.record) ? session.record : null;
  const endpoint = workspaceLaunchString(session.health_endpoint) ?? workspaceLaunchString(record?.health_endpoint);
  if (!endpoint) return null;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    const text = await response.text().catch(() => '');
    if (!response.ok) return { ok: false, status: 'unhealthy', http_status: response.status };
    if (text.trim()) {
      try {
        return JSON.parse(text);
      } catch {
        return { ok: true, status: 'healthy', text };
      }
    }
    return { ok: true, status: 'healthy' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function workspaceLaunchSiteRootsForSelection(selection: WorkspaceLaunchBrowserSelection, records: WorkspaceLaunchRecord[]): string[] {
  const selected = selectLaunchRecords(records, { all: true, site: selection.site, role: selection.role });
  return support.unique(selected.map((record) => resolve(record.site_root)));
}

export function workspaceLaunchSessionMatchesSelection(session: Record<string, unknown>, selection: WorkspaceLaunchBrowserSelection): boolean {
  const roles = new Set(selection.role.map((role) => role.toLowerCase()));
  const sites = new Set(selection.site.map((site) => normalizeWorkspaceLaunchSiteToken(site)));
  const agentId = workspaceLaunchString(session.agent_id);
  const role = agentId ? agentId.split('.').filter(Boolean).at(-1)?.toLowerCase() : null;
  const siteId = workspaceLaunchString(session.site_id) ?? (agentId ? agentId.split('.')[0] : null);
  if (roles.size > 0 && role && !roles.has(role)) return false;
  if (sites.size > 0 && siteId && !sites.has(normalizeWorkspaceLaunchSiteToken(siteId))) return false;
  return true;
}

function workspaceLaunchObservationFromSession(launchAttemptId: string, session: Record<string, unknown>): WorkspaceLaunchObservationRecord {
  const health = workspaceLaunchHealthFromSession(session);
  const attachCommands = workspaceLaunchAttachCommandsFromSession(session);
  const controlPath = workspaceLaunchControlPathFromSession(session);
  const record = support.isRecord(session.record) ? session.record : null;
  const agentId = workspaceLaunchString(session.agent_id) ?? workspaceLaunchString(record?.agent_id);
  const siteId = workspaceLaunchString(session.site_id) ?? workspaceLaunchString(record?.site_id);
  const processOwnership = workspaceLaunchSessionOwnership(session);
  const runtimePid = typeof processOwnership?.pid === 'number' && Number.isInteger(processOwnership.pid)
    ? processOwnership.pid
    : null;
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: support.workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id),
    site_root: workspaceLaunchString(session.site_root),
    health,
    authority: 'nars_session_management',
    ownership_posture: 'owned_by_runtime_authority',
    last_checked_at: new Date().toISOString(),
    message: `NARS session ${workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id) ?? 'unknown'} is ${health}.`,
    agent_id: agentId,
    site_id: siteId,
    agent_identity_ref: support.workspaceLaunchSessionIdentityRef(session),
    control_path: controlPath,
    process_ownership: processOwnership,
    runtime_pid: runtimePid,
    attach_commands: attachCommands,
  };
}

function workspaceLaunchControlPathFromSession(session: Record<string, unknown>): string | null {
  const record = support.isRecord(session.record) ? session.record : null;
  const direct = workspaceLaunchString(session.control_path) ?? workspaceLaunchString(record?.control_path);
  if (direct) return direct;
  const sessionPath = workspaceLaunchString(session.session_path) ?? workspaceLaunchString(record?.session_path);
  return sessionPath ? join(dirname(sessionPath), 'control.jsonl') : null;
}

function workspaceLaunchAttachCommandsFromSession(session: Record<string, unknown>): WorkspaceLaunchObservationRecord['attach_commands'] {
  const record = support.isRecord(session.record) ? session.record : null;
  const recordedCommands = support.isRecord(record?.attach_commands) ? record.attach_commands : null;
  const eventEndpoint = workspaceLaunchString(session.event_endpoint) ?? workspaceLaunchString(record?.event_endpoint);
  const healthEndpoint = workspaceLaunchString(session.health_endpoint) ?? workspaceLaunchString(record?.health_endpoint);
  return {
    agent_web_ui: workspaceLaunchString(recordedCommands?.agent_web_ui)
      ?? (eventEndpoint ? `narada-agent-web-ui --event-endpoint ${eventEndpoint}${healthEndpoint ? ` --health-endpoint ${healthEndpoint}` : ''}` : null),
    agent_cli: workspaceLaunchString(recordedCommands?.agent_cli)
      ?? (eventEndpoint ? `narada-agent-cli --attach ${eventEndpoint}` : null),
  };
}

function workspaceLaunchAmbiguousObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection, sessions: Record<string, unknown>[]): WorkspaceLaunchObservationRecord {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: support.workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: null,
    site_root: null,
    health: 'ambiguous',
    authority: 'nars_session_management',
    ownership_posture: 'not_yet_observed',
    last_checked_at: new Date().toISOString(),
    message: `Found ${sessions.length} possible NARS sessions for ${selection.site.join(', ')} / ${selection.role.join(', ')}; operator selection is required before treating one as owned.`,
  };
}

function workspaceLaunchHealthFromSession(session: Record<string, unknown>): WorkspaceLaunchObservationRecord['health'] {
  const healthStatus = workspaceLaunchString(session.health_status);
  if (healthStatus === 'healthy') return 'healthy';
  const displayState = workspaceLaunchString(session.display_state);
  if (displayState === 'stale') return 'stale';
  if (displayState === 'closed' || workspaceLaunchString(session.terminal_state) === 'closed') return 'failed';
  if (displayState === 'active') return 'healthy';
  if (displayState === 'starting_or_degraded') return 'failed';
  return 'failed';
}

function workspaceLaunchUnownedObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection): WorkspaceLaunchObservationRecord {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: support.workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: null,
    site_root: null,
    health: 'unowned',
    authority: 'nars_session_management',
    ownership_posture: 'observed_unowned',
    last_checked_at: new Date().toISOString(),
    message: `Found NARS sessions for ${selection.site.join(', ')} / ${selection.role.join(', ')} but none matched the requested selection.`,
  };
}

function workspaceLaunchRuntimeObservationPollBudgetMs(): number {
  const raw = process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
}

function workspaceLaunchRuntimeObservationPollIntervalMs(): number {
  const raw = process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_INTERVAL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
}

async function workspaceLaunchObservationPause(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWorkspaceLaunchSiteToken(value: string): string {
  return value.toLowerCase().replace(/^narada[-.]/, '').replace(/^narada/, '').replace(/^[-.]/, '');
}

function workspaceLaunchHandoffCwd(record: Record<string, unknown>): string | null {
  const selectedAgents = Array.isArray(record.selected_agents) ? record.selected_agents : [];
  const firstAgent = selectedAgents.find(support.isRecord);
  return firstAgent ? workspaceLaunchString(firstAgent.workspace_root) ?? workspaceLaunchString(firstAgent.site_root) : null;
}

export function redactWorkspaceLaunchArgv(args: string[]): string[] {
  return args.map((arg) => {
    if (/api[_-]?key|token|secret|password/i.test(arg)) return '<redacted>';
    return arg;
  });
}
