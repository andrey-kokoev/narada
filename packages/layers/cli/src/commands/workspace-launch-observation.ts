import { resolve } from 'node:path';
import {
  discoverNarsSessions,
  type NarsSessionObservation,
} from '@narada2/nars-session-core/session-index';
import { WORKSPACE_LAUNCH_ACTIVE_OBSERVATION_MAX_AGE_MS } from '@narada2/workspace-launch-contract';
import type { WorkspaceLaunchAttemptRecord, WorkspaceLaunchObservationRecord, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type {
  WorkspaceLaunchAttemptActivityState,
  WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection,
} from '@narada2/workspace-launch-contract';
import * as support from './workspace-launch-support.js';
import { workspaceLaunchRequestStaleSessionCleanup } from './workspace-launch-cleanup.js';
import {
  normalizeWorkspaceLaunchSiteToken,
  workspaceLaunchControlPathFromSession,
  workspaceLaunchInteger,
  workspaceLaunchSessionIsTerminalForCleanup,
  workspaceLaunchSessionLaunchSessionId,
  workspaceLaunchSessionMatchesSelection,
  workspaceLaunchSessionOwnedCleanupAllowed,
  workspaceLaunchSessionOwnership,
  workspaceLaunchSiteRootsForSelection,
  workspaceLaunchString,
} from './workspace-launch-session.js';

export interface WorkspaceLaunchRuntimeObservationOptions {
  cleanupStaleSessions?: boolean;
  pollBudgetMs?: number;
  pollIntervalMs?: number;
}

export function workspaceLaunchAttemptActivityState(
  attempt: Pick<WorkspaceLaunchAttemptRecord, 'status' | 'expected_launch_session_ids' | 'observations'>,
  now = Date.now(),
): WorkspaceLaunchAttemptActivityState {
  if (attempt.status !== 'launched' || attempt.expected_launch_session_ids.length === 0) return 'historical';
  const observation = workspaceLaunchLatestObservation(attempt.observations);
  if (!observation
    || observation.health !== 'healthy'
    || observation.ownership_posture !== 'owned_by_runtime_authority'
    || !observation.session_id
    || !attempt.expected_launch_session_ids.includes(observation.session_id)) return 'historical';
  const checkedAt = Date.parse(observation.last_checked_at);
  if (!Number.isFinite(checkedAt)) return 'historical';
  const ageMs = now - checkedAt;
  return ageMs >= 0 && ageMs <= WORKSPACE_LAUNCH_ACTIVE_OBSERVATION_MAX_AGE_MS ? 'active' : 'historical';
}

export function workspaceLaunchAttemptDashboardActivityState(
  attempt: Pick<WorkspaceLaunchAttemptRecord, 'status' | 'expected_launch_session_ids' | 'observations' | 'activity_state'>,
  now = Date.now(),
): WorkspaceLaunchAttemptActivityState {
  if (attempt.activity_state === 'historical') return 'historical';
  return workspaceLaunchAttemptActivityState(attempt, now);
}

export function workspaceLaunchLatestObservation(
  observations: WorkspaceLaunchObservationRecord[],
): WorkspaceLaunchObservationRecord | undefined {
  return [...observations]
    .sort((left, right) => {
      const leftCheckedAt = Date.parse(left.last_checked_at);
      const rightCheckedAt = Date.parse(right.last_checked_at);
      return (Number.isFinite(leftCheckedAt) ? leftCheckedAt : Number.NEGATIVE_INFINITY)
        - (Number.isFinite(rightCheckedAt) ? rightCheckedAt : Number.NEGATIVE_INFINITY);
    })
    .at(-1);
}

export async function workspaceLaunchRuntimeObservations(
  launchAttemptId: string,
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
  expectedLaunchSessionIds: string[] = [],
  launchSiteRoots: string[] = [],
  options: WorkspaceLaunchRuntimeObservationOptions = {},
): Promise<WorkspaceLaunchObservationRecord[]> {
  const siteRoots = support.unique(
    (launchSiteRoots.length > 0 ? launchSiteRoots : workspaceLaunchSiteRootsForSelection(selection, records))
      .map((siteRoot) => resolve(siteRoot)),
  );
  if (siteRoots.length === 0) return [workspaceLaunchWaitingObservation(launchAttemptId, selection)];
  const expectedLaunchSessionIdSet = new Set(expectedLaunchSessionIds.map((value) => value.trim()).filter(Boolean));
  const pollBudgetMs = options.pollBudgetMs ?? workspaceLaunchRuntimeObservationPollBudgetMs();
  const pollIntervalMs = options.pollIntervalMs ?? workspaceLaunchRuntimeObservationPollIntervalMs();
  const deadline = Date.now() + pollBudgetMs;
  let sawDiscoveredSession = false;
  const staleCleanupAttempted = new Set<string>();

  while (true) {
    const discoveredSessions: NarsSessionObservation[] = [];
    const candidates: NarsSessionObservation[] = [];
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
          } else if (options.cleanupStaleSessions !== false && workspaceLaunchSessionIsStaleSessionOwnedCandidate(normalized, expectedLaunchSessionIdSet)) {
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
      await workspaceLaunchObservationPause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
      continue;
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

function workspaceLaunchSessionMatchesExpectedLaunch(session: NarsSessionObservation, expectedLaunchSessionIds: Set<string>): boolean {
  if (expectedLaunchSessionIds.size === 0) return true;
  const launchSessionId = workspaceLaunchSessionLaunchSessionId(session);
  return launchSessionId !== null && expectedLaunchSessionIds.has(launchSessionId);
}

function workspaceLaunchSessionIsStaleSessionOwnedCandidate(session: NarsSessionObservation, expectedLaunchSessionIds: Set<string>): boolean {
  if (expectedLaunchSessionIds.size === 0) return false;
  if (!workspaceLaunchSessionOwnedCleanupAllowed(session)) return false;
  const launchSessionId = workspaceLaunchSessionLaunchSessionId(session);
  return launchSessionId !== null && !expectedLaunchSessionIds.has(launchSessionId);
}

function workspaceLaunchObservationFromSession(launchAttemptId: string, session: NarsSessionObservation): WorkspaceLaunchObservationRecord {
  const health = workspaceLaunchHealthFromSession(session);
  const attachCommands = workspaceLaunchAttachCommandsFromSession(session);
  const controlPath = workspaceLaunchControlPathFromSession(session);
  const record = session.record;
  const agentId = workspaceLaunchString(session.agent_id) ?? workspaceLaunchString(record?.agent_id);
  const siteId = workspaceLaunchString(session.site_id) ?? workspaceLaunchString(record?.site_id);
  const processOwnership = workspaceLaunchSessionOwnership(session);
  const runtimePid = typeof processOwnership?.pid === 'number' && Number.isInteger(processOwnership.pid) ? processOwnership.pid : null;
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

function workspaceLaunchAttachCommandsFromSession(session: NarsSessionObservation): WorkspaceLaunchObservationRecord['attach_commands'] {
  const record = session.record;
  const recordedCommands = record?.attach_commands;
  const eventEndpoint = workspaceLaunchString(session.event_endpoint) ?? workspaceLaunchString(record?.event_endpoint);
  const healthEndpoint = workspaceLaunchString(session.health_endpoint) ?? workspaceLaunchString(record?.health_endpoint);
  return {
    agent_web_ui: workspaceLaunchString(recordedCommands?.agent_web_ui)
      ?? (eventEndpoint ? `narada-agent-web-ui --event-endpoint ${eventEndpoint}${healthEndpoint ? ` --health-endpoint ${healthEndpoint}` : ''}` : null),
    agent_cli: workspaceLaunchString(recordedCommands?.agent_cli)
      ?? (eventEndpoint ? `narada-agent-cli --attach ${eventEndpoint}` : null),
  };
}

function workspaceLaunchHealthFromSession(session: NarsSessionObservation): WorkspaceLaunchObservationRecord['health'] {
  const healthStatus = workspaceLaunchString(session.health_status);
  if (healthStatus === 'healthy') return 'healthy';
  const displayState = workspaceLaunchString(session.display_state);
  if (displayState === 'stale') return 'stale';
  if (displayState === 'closed' || workspaceLaunchString(session.terminal_state) === 'closed') return 'failed';
  if (displayState === 'active') return 'healthy';
  if (displayState === 'starting_or_degraded') return 'failed';
  return 'failed';
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

function workspaceLaunchAmbiguousObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection, sessions: NarsSessionObservation[]): WorkspaceLaunchObservationRecord {
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

async function workspaceLaunchProbeHealthBySessionId(sessions: NarsSessionObservation[]): Promise<Map<string, unknown>> {
  const healthBySessionId = new Map<string, unknown>();
  const pairs = await Promise.all(sessions.map(async (session) => {
    const sessionId = workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id);
    if (!sessionId) return null;
    const health = await workspaceLaunchProbeSessionHealth(session);
    return health === null ? null : [sessionId, health] as const;
  }));
  for (const pair of pairs) if (pair !== null) healthBySessionId.set(pair[0], pair[1]);
  return healthBySessionId;
}

async function workspaceLaunchProbeSessionHealth(session: NarsSessionObservation): Promise<unknown | null> {
  const record = session.record;
  const endpoint = workspaceLaunchString(session.health_endpoint) ?? workspaceLaunchString(record?.health_endpoint);
  if (!endpoint) return null;
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    const text = await response.text().catch(() => '');
    if (!response.ok) return { ok: false, status: 'unhealthy', http_status: response.status };
    if (text.trim()) {
      try { return JSON.parse(text); } catch { return { ok: true, status: 'healthy', text }; }
    }
    return { ok: true, status: 'healthy' };
  } catch { return null; } finally { clearTimeout(timer); }
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
