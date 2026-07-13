import * as support from './workspace-launch-support.js';
import type {
  WorkspaceLaunchInvocationDetails,
  WorkspaceLaunchLaunchResult,
  WorkspaceLaunchPlanResult,
} from './workspace-launch-types.js';

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
