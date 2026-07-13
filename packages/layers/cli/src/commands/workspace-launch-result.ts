import {
  redactWorkspaceLaunchArgv,
} from './workspace-launch-process.js';
import { workspaceLaunchTerminalHandoffArgs } from './workspace-launch-terminal.js';
import type {
  WorkspaceLaunchHandoffRecord,
  WorkspaceLaunchInvocationDetails,
  WorkspaceLaunchLaunchResult,
  WorkspaceLaunchPlanResult,
  WorkspaceLaunchResultAgentInput,
  WorkspaceLaunchResultRecord,
} from './workspace-launch-types.js';
import * as support from './workspace-launch-support.js';
import { workspaceLaunchString } from './workspace-launch-session.js';

export function finalizeWorkspaceLaunchResult(
  plan: WorkspaceLaunchPlanResult,
  invocation: WorkspaceLaunchInvocationDetails,
): WorkspaceLaunchLaunchResult {
  const { wt_args: wtArgs, ...planWithoutTopLevelTerminalPlan } = plan;
  const launchResult: WorkspaceLaunchLaunchResult = {
    ...planWithoutTopLevelTerminalPlan,
    schema: 'narada.workspace_launch.launch_result.v1',
    status: 'launched',
    mode: 'launch',
    mutation_performed: true,
    windows_terminal_invoked: invocation.windows_terminal_invoked,
    launch_agents: plan.selected_agents,
    selected_agents_authority: 'narada-cli.plan_selection',
    hidden_runtime_invoked: invocation.hidden_runtime_invoked,
    launcher_execution_owner: 'narada-cli',
    ...(invocation.hidden_runtime_launches ? { hidden_runtime_launches: invocation.hidden_runtime_launches } : {}),
    ...(invocation.wt_exit_code === undefined ? {} : { wt_exit_code: invocation.wt_exit_code }),
    ...(wtArgs.length > 0
      ? {
          operator_terminal_handoff: {
            schema: 'narada.workspace_launch.operator_terminal_handoff.v1',
            authority: 'narada-cli.workspace-launch-executor',
            wt_args: wtArgs,
          },
        }
      : {}),
  };
  assertWorkspaceLaunchResultInvariants(launchResult);
  return launchResult;
}

export function assertWorkspaceLaunchResultInvariants(result: WorkspaceLaunchLaunchResult): void {
  if (result.schema !== 'narada.workspace_launch.launch_result.v1') {
    throw new Error(`workspace_launch_result_schema_invalid: ${String(result.schema ?? '')}`);
  }
  if (result.mode !== 'launch') {
    throw new Error(`workspace_launch_result_mode_invalid: ${String(result.mode ?? '')}`);
  }
  if (result.status !== 'launched') {
    throw new Error(`workspace_launch_result_status_invalid: ${String(result.status ?? '')}`);
  }
  if (result.mutation_performed !== true) {
    throw new Error('workspace_launch_result_mutation_performed_required');
  }
  const windowsTerminalInvoked = result.windows_terminal_invoked === true;
  const hiddenRuntimeInvoked = result.hidden_runtime_invoked === true;
  if (windowsTerminalInvoked === hiddenRuntimeInvoked) {
    throw new Error('workspace_launch_result_invocation_posture_ambiguous');
  }
  if ('wt_args' in result) {
    throw new Error('workspace_launch_result_top_level_wt_args_forbidden');
  }
  const terminalHandoff = support.isRecord(result.operator_terminal_handoff) ? result.operator_terminal_handoff : null;
  if (windowsTerminalInvoked && (!terminalHandoff || terminalHandoff.authority !== 'narada-cli.workspace-launch-executor')) {
    throw new Error('workspace_launch_result_operator_terminal_handoff_required');
  }
  if (!Array.isArray(result.launch_agents)) {
    throw new Error('workspace_launch_result_launch_agents_required');
  }
  if (hiddenRuntimeInvoked && result.selected_agents.some((agent) => agent.runtime_start_execution_mode !== 'hidden_detached')) {
    throw new Error('workspace_launch_result_hidden_runtime_requires_hidden_agent_modes');
  }
}

export function workspaceLaunchResultSummary(result: unknown, success: boolean): string {
  const record = workspaceLaunchResultRecord(result);
  if (!success) {
    const error = workspaceLaunchString(record.error) ?? workspaceLaunchString(record.reason);
    return error ?? 'Launch failed.';
  }
  const count = typeof record.count === 'number' ? record.count : null;
  if (count !== null) return `Launch accepted for ${count} workspace launch${count === 1 ? '' : 'es'}.`;
  return 'Launch accepted.';
}

export function workspaceLaunchHandoffFromResult(launchAttemptId: string, result: unknown, success: boolean): WorkspaceLaunchHandoffRecord {
  const record = workspaceLaunchResultRecord(result);
  const hiddenRuntimeLaunches = Array.isArray(record.hidden_runtime_launches) ? record.hidden_runtime_launches : [];
  if (record.hidden_runtime_invoked === true || hiddenRuntimeLaunches.length > 0) {
    const selectedAgents = record.selected_agents;
    const firstAgent = selectedAgents.find((agent) => agent.runtime_start_execution_mode === 'hidden_detached') ?? selectedAgents[0];
    return {
      schema: 'narada.workspace_launch.handoff.v1', handoff_id: support.workspaceLaunchId('wlh'), launch_attempt_id: launchAttemptId,
      posture: 'hidden_runtime_host', status: success ? 'handed_off' : 'failed', command: 'hidden_runtime_host',
      argv_redacted: redactWorkspaceLaunchArgv(support.stringArray(firstAgent?.hidden_runtime_start_command ?? firstAgent?.runtime_start_command)),
      cwd: workspaceLaunchString(firstAgent?.runtime_start_cwd) ?? workspaceLaunchHandoffCwd(record), exit_code: null,
      ownership_posture: 'handoff_only', diagnostic_ref: workspaceLaunchString(record.result_path),
    };
  }
  const wtArgs = workspaceLaunchTerminalHandoffArgs(record);
  return {
    schema: 'narada.workspace_launch.handoff.v1', handoff_id: support.workspaceLaunchId('wlh'), launch_attempt_id: launchAttemptId,
    posture: 'operator_terminal', status: success ? 'handed_off' : 'failed', command: wtArgs.length > 0 ? 'wt' : null,
    argv_redacted: redactWorkspaceLaunchArgv(wtArgs), cwd: workspaceLaunchHandoffCwd(record),
    exit_code: typeof record.wt_exit_code === 'number' ? record.wt_exit_code : null, ownership_posture: 'handoff_only',
    diagnostic_ref: workspaceLaunchString(record.result_path),
  };
}

export function workspaceLaunchFailedHandoff(launchAttemptId: string, error: unknown): WorkspaceLaunchHandoffRecord {
  return {
    schema: 'narada.workspace_launch.handoff.v1', handoff_id: support.workspaceLaunchId('wlh'), launch_attempt_id: launchAttemptId,
    posture: 'operator_terminal', status: 'failed', command: null, argv_redacted: [], cwd: null, exit_code: null,
    ownership_posture: 'handoff_only', diagnostic_ref: error instanceof Error ? error.message : String(error),
  };
}

function workspaceLaunchHandoffCwd(record: WorkspaceLaunchResultRecord): string | null {
  const firstAgent = record.selected_agents[0];
  return firstAgent ? workspaceLaunchString(firstAgent.workspace_root) ?? workspaceLaunchString(firstAgent.site_root) : null;
}

function workspaceLaunchResultRecord(value: unknown): WorkspaceLaunchResultRecord {
  const source = support.isRecord(value) ? value : {};
  return {
    count: source.count,
    error: source.error,
    reason: source.reason,
    result_path: source.result_path,
    wt_exit_code: source.wt_exit_code,
    hidden_runtime_invoked: source.hidden_runtime_invoked,
    hidden_runtime_launches: Array.isArray(source.hidden_runtime_launches) ? source.hidden_runtime_launches : [],
    selected_agents: Array.isArray(source.selected_agents)
      ? source.selected_agents.filter((agent): agent is WorkspaceLaunchResultAgentInput => support.isRecord(agent))
      : [],
    wt_args: source.wt_args,
    operator_terminal_handoff: support.isRecord(source.operator_terminal_handoff)
      ? { wt_args: source.operator_terminal_handoff.wt_args }
      : null,
  };
}
