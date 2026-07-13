import { existsSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import {
  discoverNarsSessions,
  type NarsSessionObservation,
} from '@narada2/nars-session-core/session-index';
import type { WorkspaceLaunchAttemptRecord, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import * as support from './workspace-launch-support.js';
import {
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

export async function workspaceLaunchRequestRuntimeStop(attempt: WorkspaceLaunchAttemptRecord): Promise<WorkspaceLaunchRuntimeActionResult> {
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

export interface WorkspaceLaunchRuntimeActionResult {
  schema: 'narada.workspace_launch.action_result.v1' | 'narada.workspace_launch.action_refusal.v1';
  status: 'requested' | 'refused';
  action?: 'stop-runtime';
  reason_code?: string;
  request_id?: string;
  control_path?: string;
  message: string;
}

export async function workspaceLaunchRequestStaleSessionCleanup(session: NarsSessionObservation, attempted: Set<string>): Promise<void> {
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

function workspaceLaunchRuntimeStopControlPath(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.control_path && existsSync(observation.control_path)) return observation.control_path;
  }
  return null;
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
