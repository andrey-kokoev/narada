import {
  redactWorkspaceLaunchArgv,
  redactWorkspaceLaunchCommand,
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
import { assertWorkspaceLaunchPlanPreflight } from './workspace-launch-preflight.js';
import { completeWorkspaceLaunchTransaction } from './workspace-launch-contracts.js';

export function finalizeWorkspaceLaunchResult(
  plan: WorkspaceLaunchPlanResult,
  invocation: WorkspaceLaunchInvocationDetails,
): WorkspaceLaunchLaunchResult {
  const { wt_args: wtArgs, ...planWithoutTopLevelTerminalPlan } = plan;
  const persistedAgents = plan.selected_agents.map(redactWorkspaceLaunchAgentPlan);
  const launchResult: WorkspaceLaunchLaunchResult = {
    ...planWithoutTopLevelTerminalPlan,
    schema: 'narada.workspace_launch.launch_result.v1',
    status: 'launched',
    mode: 'launch',
    mutation_performed: true,
    windows_terminal_invoked: invocation.windows_terminal_invoked,
    selected_agents: persistedAgents,
    launch_agents: persistedAgents,
    selected_agents_authority: 'narada-cli.plan_selection',
    hidden_runtime_invoked: invocation.hidden_runtime_invoked,
    launcher_execution_owner: 'narada-cli',
    transaction: completeWorkspaceLaunchTransaction(plan.transaction),
    attachment: invocation.attachment,
    ...(invocation.hidden_runtime_launches ? { hidden_runtime_launches: invocation.hidden_runtime_launches } : {}),
    ...(invocation.hidden_projection_launches ? { hidden_projection_launches: invocation.hidden_projection_launches } : {}),
    ...(invocation.wt_exit_code === undefined ? {} : { wt_exit_code: invocation.wt_exit_code }),
    ...(invocation.windows_terminal_invoked && wtArgs.length > 0
      ? {
          operator_terminal_handoff: {
            schema: 'narada.workspace_launch.operator_terminal_handoff.v1',
            authority: 'narada-cli.workspace-launch-executor',
            wt_args: redactWorkspaceLaunchArgv(wtArgs),
          },
        }
      : {}),
  };
  assertWorkspaceLaunchResultInvariants(launchResult);
  return launchResult;
}

function redactWorkspaceLaunchAgentPlan(agent: WorkspaceLaunchPlanResult['selected_agents'][number]): WorkspaceLaunchPlanResult['selected_agents'][number] {
  return {
    ...agent,
    runtime_start_command: redactWorkspaceLaunchArgv(agent.runtime_start_command),
    hidden_runtime_start_command: redactWorkspaceLaunchArgv(agent.hidden_runtime_start_command),
    ...(agent.operator_projection_start_command
      ? { operator_projection_start_command: redactWorkspaceLaunchArgv(agent.operator_projection_start_command) }
      : {}),
    wt_args: redactWorkspaceLaunchArgv(agent.wt_args),
    smoke_command: redactWorkspaceLaunchArgv(agent.smoke_command),
    terminal_tabs: agent.terminal_tabs.map((tab) => ({
      ...tab,
      command: redactWorkspaceLaunchCommand(tab.command),
      command_argv: redactWorkspaceLaunchArgv(tab.command_argv),
    })),
  };
}

export function assertWorkspaceLaunchPlanInvariants(result: WorkspaceLaunchPlanResult): void {
  if (result.schema !== 'narada.workspace_launch.plan.v1') {
    throw new Error(`workspace_launch_plan_schema_invalid: ${String(result.schema ?? '')}`);
  }
  if (result.status !== 'planned' || result.mutation_performed !== false) {
    throw new Error('workspace_launch_plan_mutation_or_status_invalid');
  }
  if (result.windows_terminal_invoked !== false) {
    throw new Error('workspace_launch_plan_windows_terminal_invocation_forbidden');
  }
  if (!Array.isArray(result.registry_paths)
    || !Array.isArray(result.selected_agents)
    || !Array.isArray(result.wt_args)
    || !result.transaction
    || result.transaction.schema !== 'narada.workspace_launch.transaction.v1'
    || result.transaction.state !== 'planned'
    || !Number.isInteger(result.count)
    || result.count < 0
    || typeof result.interactive_selection !== 'boolean'
    || ![null, 'browser', 'terminal'].includes(result.interactive_selection_surface)) {
    throw new Error('workspace_launch_plan_persisted_shape_invalid');
  }
  if (result.count !== result.selected_agents.length) {
    throw new Error('workspace_launch_plan_count_mismatch');
  }
  if (!result.ownership
    || result.ownership.planner !== 'narada-cli'
    || result.ownership.executor !== 'narada-cli.workspace-launch') {
    throw new Error('workspace_launch_plan_ownership_invalid');
  }
  assertWorkspaceLaunchPlanPreflight(result.selected_agents);
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
  if (windowsTerminalInvoked && result.selected_agents.some((agent) => agent.runtime_start_execution_mode !== 'operator_terminal')) {
    throw new Error('workspace_launch_result_terminal_handoff_runtime_mode_invalid');
  }
  if (!Array.isArray(result.launch_agents)) {
    throw new Error('workspace_launch_result_launch_agents_required');
  }
  if (result.count !== result.selected_agents.length || result.launch_agents.length !== result.selected_agents.length) {
    throw new Error('workspace_launch_result_agent_cardinality_invalid');
  }
  for (const [index, agent] of result.selected_agents.entries()) {
    const launched = result.launch_agents[index];
    if (!launched || launched.agent !== agent.agent || launched.site !== agent.site
      || launched.launch_session_id !== agent.launch_session_id) {
      throw new Error(`workspace_launch_result_agent_binding_mismatch: ${index}`);
    }
    if (agent.runtime_start_command.some((value) => value.includes('<redacted>') === false && /(?:api[-_]?key|token|secret|password)=/i.test(value))) {
      throw new Error(`workspace_launch_result_unredacted_command_evidence: ${agent.agent}`);
    }
  }
  if (!result.transaction
    || result.transaction.schema !== 'narada.workspace_launch.transaction.v1'
    || result.transaction.state !== 'completed'
    || !Array.isArray(result.transaction.history)) {
    throw new Error('workspace_launch_result_transaction_incomplete');
  }
  const transactionHistory = result.transaction.history as unknown[];
  if (!result.attachment
    || result.attachment.schema !== 'narada.workspace_launch.attachment.v1'
    || typeof result.attachment.exact_session !== 'boolean'
    || !Array.isArray(result.attachment.sessions)) {
    throw new Error('workspace_launch_result_attachment_evidence_required');
  }
  const expectedLaunchSessionIds = result.selected_agents
    .map((agent) => agent.launch_session_id)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (expectedLaunchSessionIds.length !== result.selected_agents.length
    || result.attachment.launch_session_ids.length !== expectedLaunchSessionIds.length
    || new Set(result.attachment.launch_session_ids).size !== result.attachment.launch_session_ids.length
    || expectedLaunchSessionIds.some((id) => !result.attachment.launch_session_ids.includes(id))
    || result.attachment.sessions.length !== expectedLaunchSessionIds.length) {
    throw new Error('workspace_launch_result_attachment_cardinality_invalid');
  }
  for (const session of result.attachment.sessions) {
    if (!result.attachment.launch_session_ids.includes(session.launch_session_id)
      || (result.attachment.status === 'attached' && session.canonical_identity_match === false)) {
      throw new Error(`workspace_launch_result_attachment_binding_invalid: ${session.launch_session_id}`);
    }
  }
  if (windowsTerminalInvoked) {
    if (result.attachment.status !== 'handoff_pending' || result.attachment.exact_session !== false || !transactionHistory.includes('handed_off')) {
      throw new Error('workspace_launch_result_terminal_handoff_attachment_state_invalid');
    }
  } else {
    if (terminalHandoff) throw new Error('workspace_launch_result_hidden_runtime_terminal_handoff_forbidden');
    const captureOnly = Array.isArray(result.hidden_runtime_launches)
      && result.hidden_runtime_launches.length > 0
      && result.hidden_runtime_launches.every((launch) => Boolean(launch.capture_log));
    if (captureOnly) {
      if (result.attachment.status !== 'not_checked' || result.attachment.exact_session !== false) {
        throw new Error('workspace_launch_result_capture_attachment_state_invalid');
      }
    } else if (result.attachment.status !== 'attached' || result.attachment.exact_session !== true || !transactionHistory.includes('attached')) {
      throw new Error('workspace_launch_result_hidden_runtime_attachment_required');
    }
  }
  if (hiddenRuntimeInvoked && result.selected_agents.some((agent) => agent.runtime_start_execution_mode !== 'hidden_detached')) {
    throw new Error('workspace_launch_result_hidden_runtime_requires_hidden_agent_modes');
  }
  if (Array.isArray(result.hidden_projection_launches)
    && result.hidden_projection_launches.some((launch) => launch.execution_authority !== 'structured_argv')) {
    throw new Error('workspace_launch_result_projection_execution_authority_invalid');
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
