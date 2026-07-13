import * as support from './workspace-launch-support.js';

export function finalizeWorkspaceLaunchResult(result: Record<string, unknown>): Record<string, unknown> {
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(support.isRecord) : [];
  const wtArgs = support.stringArray(result.wt_args);
  const { wt_args: _wtArgs, ...resultWithoutTopLevelTerminalPlan } = result;
  const launchResult = {
    ...resultWithoutTopLevelTerminalPlan,
    schema: 'narada.workspace_launch.launch_result.v1',
    status: 'launched',
    mode: 'launch',
    mutation_performed: true,
    launch_agents: selectedAgents,
    selected_agents_authority: 'narada-cli.plan_selection',
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

export function assertWorkspaceLaunchResultInvariants(result: Record<string, unknown>): void {
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
  if (Array.isArray(result.wt_args)) {
    throw new Error('workspace_launch_result_top_level_wt_args_forbidden');
  }
  const terminalHandoff = support.isRecord(result.operator_terminal_handoff) ? result.operator_terminal_handoff : null;
  if (windowsTerminalInvoked && (!terminalHandoff || terminalHandoff.authority !== 'narada-cli.workspace-launch-executor')) {
    throw new Error('workspace_launch_result_operator_terminal_handoff_required');
  }
  if (!Array.isArray(result.launch_agents)) {
    throw new Error('workspace_launch_result_launch_agents_required');
  }
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(support.isRecord) : [];
  if (hiddenRuntimeInvoked && selectedAgents.some((agent) => agent.runtime_start_execution_mode !== 'hidden_detached')) {
    throw new Error('workspace_launch_result_hidden_runtime_requires_hidden_agent_modes');
  }
}
