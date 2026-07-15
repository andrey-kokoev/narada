import { existsSync } from 'node:fs';
import type { WorkspaceLaunchAttemptRecord, WorkspaceLaunchProjectionObservationRecord } from './workspace-launch-types.js';
import * as support from './workspace-launch-support.js';
import {
  redactWorkspaceLaunchArgv,
  redactWorkspaceLaunchCommand,
  workspaceLaunchStartHiddenProjectionHost,
} from './workspace-launch-process.js';
import {
  captureWorkspaceLaunchTerminalInvocation,
  startWorkspaceLaunchWindowsTerminal,
} from './workspace-launch-terminal.js';
import { workspaceLaunchRequestRuntimeStop } from './workspace-launch-cleanup.js';

export { workspaceLaunchRequestRuntimeStop } from './workspace-launch-cleanup.js';

export function workspaceLaunchActionsForAttempt(attempt: WorkspaceLaunchAttemptRecord): string[] {
  const actions = ['recheck'];
  if (workspaceLaunchAttachCommandForAction(attempt, 'open-web-ui')) actions.push('open-web-ui');
  if (workspaceLaunchAttachCommandForAction(attempt, 'attach-cli')) actions.push('attach-cli');
  actions.push('retry');
  if (workspaceLaunchRuntimeStopControlPath(attempt)) actions.push('stop-runtime');
  actions.push('forget');
  return support.unique(actions);
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
      const host = await workspaceLaunchStartHiddenProjectionHost(command, cwd);
      return {
        schema: 'narada.workspace_launch.observed_projection.v1', observation_id: support.workspaceLaunchId('wlp'),
        launch_attempt_id: attempt.launch_attempt_id, projection_kind: projectionKind, session_id: sessionId,
        status: 'handed_off', command, authority: 'nars_client_projection_contract', ownership_posture: 'handoff_only',
        observed_at: new Date().toISOString(),
        message: `${projectionKind} projection host started hidden; browser projection owns visible operator surface.`,
        diagnostic: { ...host, command: redactWorkspaceLaunchCommand(command) },
      };
    } catch (error) {
      return {
        schema: 'narada.workspace_launch.observed_projection.v1', observation_id: support.workspaceLaunchId('wlp'),
        launch_attempt_id: attempt.launch_attempt_id, projection_kind: projectionKind, session_id: sessionId,
        status: 'failed', command, authority: 'nars_client_projection_contract', ownership_posture: 'handoff_only',
        observed_at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error),
        diagnostic: { command: redactWorkspaceLaunchCommand(command) },
      };
    }
  }
  const wtArgs = ['new-tab', '--title', title, '-d', cwd, 'pwsh', '-NoExit', '-Command', command];
  const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
  const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
  try {
    const launch = terminalCaptureLog
      ? await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs)
      : startWorkspaceLaunchWindowsTerminal(effectiveWtArgs);
    if (launch.error) throw launch.error;
    if (launch.status !== 0) throw new Error(`projection_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
    return {
      schema: 'narada.workspace_launch.observed_projection.v1', observation_id: support.workspaceLaunchId('wlp'),
      launch_attempt_id: attempt.launch_attempt_id, projection_kind: projectionKind, session_id: sessionId,
      status: 'handed_off', command, authority: 'nars_client_projection_contract', ownership_posture: 'handoff_only',
      observed_at: new Date().toISOString(), message: `${projectionKind} projection handoff accepted by operator terminal authority.`,
      diagnostic: { wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs), wt_exit_code: launch.status ?? 0 },
    };
  } catch (error) {
    return {
      schema: 'narada.workspace_launch.observed_projection.v1', observation_id: support.workspaceLaunchId('wlp'),
      launch_attempt_id: attempt.launch_attempt_id, projection_kind: projectionKind, session_id: sessionId,
      status: 'failed', command, authority: 'nars_client_projection_contract', ownership_posture: 'handoff_only',
      observed_at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error),
      diagnostic: { error: error instanceof Error ? error.message : String(error) },
    };
  }
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

function workspaceLaunchRuntimeStopControlPath(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.control_path && existsSync(observation.control_path)) return observation.control_path;
  }
  return null;
}

function workspaceLaunchProjectionSessionId(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) if (observation.session_id) return observation.session_id;
  return null;
}

function workspaceLaunchProjectionCwd(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) if (observation.site_root) return observation.site_root;
  for (const handoff of attempt.handoffs) if (handoff.cwd) return handoff.cwd;
  return null;
}
