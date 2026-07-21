import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ensureIntelligenceCatalog } from '@narada2/invokable-intelligence-management';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { WorkspaceLaunchContractError, advanceWorkspaceLaunchTransaction, createWorkspaceLaunchTransaction, failWorkspaceLaunchTransaction } from './workspace-launch-contracts.js';
import * as support from './workspace-launch-support.js';
import { assertWorkspaceLaunchPlanInvariants, finalizeWorkspaceLaunchResult } from './workspace-launch-result.js';
import { writeWorkspacePlanResult } from './workspace-launch-persistence.js';
import { awaitWorkspaceLaunchSessionAttachments, WorkspaceLaunchAttachmentError } from './workspace-launch-attachment.js';
import {
  workspaceLaunchRollbackOwnedProcesses,
  workspaceLaunchProjectionReadinessPath,
  workspaceLaunchStartHiddenProjectionHost,
  workspaceLaunchStartHiddenRuntimeHost,
  WorkspaceLaunchProcessReadinessError,
  redactWorkspaceLaunchArgv,
  redactWorkspaceLaunchCommand,
  redactWorkspaceLaunchText,
} from './workspace-launch-process.js';
import { captureWorkspaceLaunchTerminalInvocation, startWorkspaceLaunchWindowsTerminal, workspaceLaunchTerminalArgs } from './workspace-launch-terminal.js';
import { runAgentStartCommand, isAgentStartAcceptedStatus } from '../lib/launcher-runtime.js';
import { NARADA_AGENT_RUNTIME_SERVER_KIND } from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import type {
  WorkspaceLaunchAgentPlan,
  WorkspaceLaunchAttachmentEvidence,
  WorkspaceLaunchCommandResult,
  WorkspaceLaunchFailureResult,
  WorkspaceLaunchLaunchResult,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchPlanResult,
  WorkspaceLaunchProcessLaunch,
} from './workspace-launch-types.js';

type WorkspaceLaunchFailureStage = 'planning' | 'catalog_preflight' | 'runtime_spawn' | 'session_attachment' | 'projection_start' | 'terminal_handoff' | 'result_persistence';

export async function executeWorkspaceLaunchPlan(
  options: WorkspaceLaunchPlanOptions,
  result: WorkspaceLaunchPlanResult,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchPlanResult | WorkspaceLaunchLaunchResult>> {
  const source: Record<string, unknown> = support.isRecord(result) ? result : {};
  const selectedAgents = workspaceLaunchExecutionAgents(source.selected_agents);
  const terminalTabs = selectedAgents.flatMap((agent) => agent.terminal_tabs);
  const hiddenRuntimeAgents = selectedAgents.filter((agent) => agent.runtime_start_execution_mode === 'hidden_detached');
  const operatorTerminalAgents = selectedAgents.filter((agent) => agent.runtime_start_execution_mode !== 'hidden_detached');
  const projectionBearingAgents = selectedAgents.filter((agent) => Array.isArray(agent.operator_projection_open_requests) && agent.operator_projection_open_requests.length > 0);
  const hiddenProjectionAgents = projectionBearingAgents.filter((agent) => Array.isArray(agent.operator_projection_start_command) && agent.operator_projection_start_command.length > 0);
  const canUseHiddenRuntimeStart = selectedAgents.length > 0
    && operatorTerminalAgents.length === 0
    && (projectionBearingAgents.length === 0 || hiddenProjectionAgents.length === projectionBearingAgents.length);

  if (options.dryRun) {
    assertWorkspaceLaunchPlanInvariants(result);
    const dryRunResult = {
      ...result,
      mode: 'dry_run' as const,
      mutation_performed: false as const,
      windows_terminal_invoked: false as const,
      launcher_execution_owner: 'narada-cli' as const,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(dryRunResult, `planned ${result.count} workspace launch(es)`, options.format ?? 'auto'),
    };
  }

  const hiddenLaunches: WorkspaceLaunchProcessLaunch[] = [];
  const hiddenProjectionLaunches: WorkspaceLaunchProcessLaunch[] = [];
  let transaction = support.isRecord(source.transaction)
    ? source.transaction
    : createWorkspaceLaunchTransaction(null);
  let stage: WorkspaceLaunchFailureStage = 'planning';
  let attachment: WorkspaceLaunchAttachmentEvidence | null = null;
  let terminalHandoff: {
    status: 'not_attempted' | 'accepted' | 'failed';
    wt_exit_code: number | null;
    wt_args: string[];
  } = { status: 'not_attempted', wt_exit_code: null, wt_args: [] };
  let wtArgs: string[] = [];

  try {
    assertWorkspaceLaunchPlanInvariants(result);
    wtArgs = workspaceLaunchTerminalArgs(terminalTabs);
    if (!canUseHiddenRuntimeStart && wtArgs.length === 0) {
      throw new WorkspaceLaunchContractError(
        'narada_workspace_plan_empty_wt_args',
        'The selected launch has neither a hidden runtime execution path nor a terminal handoff.',
        'Regenerate the launch plan with an admitted operator surface and runtime.',
      );
    }

    stage = 'catalog_preflight';
    await runWorkspaceLaunchCatalogPreflight(selectedAgents);
    transaction = advanceWorkspaceLaunchTransaction(transaction, 'preflighted');

    if (canUseHiddenRuntimeStart) {
      stage = 'runtime_spawn';
      for (const agent of hiddenRuntimeAgents) {
        const runtimeStartCommand = agent.hidden_runtime_start_command.length > 0
          ? agent.hidden_runtime_start_command
          : agent.runtime_start_command;
        const runtimeStartCwd = support.workspaceLaunchString(agent.runtime_start_cwd) ?? process.cwd();
        if (runtimeStartCommand.length === 0) throw new Error('narada_workspace_plan_empty_runtime_start_command');
        const launch = await workspaceLaunchStartHiddenRuntimeHost(
          runtimeStartCommand,
          runtimeStartCwd,
          agent.launch_session_id,
          { agent_id: agent.agent, launch_session_id: agent.launch_session_id },
        );
        hiddenLaunches.push(launch);
      }
      transaction = advanceWorkspaceLaunchTransaction(transaction, 'spawned');

      stage = 'session_attachment';
      attachment = hiddenLaunches.some((launch) => Boolean(launch.capture_log))
        ? notCheckedAttachment(hiddenRuntimeAgents, 'Attachment was intentionally not checked while launch capture mode was enabled.')
        : await awaitWorkspaceLaunchSessionAttachments(hiddenRuntimeAgents);
      transaction = advanceWorkspaceLaunchTransaction(transaction, attachment.status === 'attached' ? 'attached' : 'handed_off');

      if (attachment.status === 'attached') {
        stage = hiddenProjectionAgents.length > 0 ? 'projection_start' : 'session_attachment';
        for (const agent of hiddenProjectionAgents) {
          const projectionCommand = agent.operator_projection_start_command;
          if (!projectionCommand || projectionCommand.length === 0) {
            throw new WorkspaceLaunchContractError(
              'workspace_launch_projection_command_missing',
              `No structured Web UI projection command exists for ${agent.agent}.`,
              'Regenerate the launch plan with agent-web-ui admitted as a hidden projection.',
            );
          }
          const attachedSessionId = attachment.sessions.find((session) => (
            session.launch_session_id === agent.launch_session_id
          ))?.session_id;
          if (!attachedSessionId) {
            throw new WorkspaceLaunchContractError(
              'workspace_launch_projection_session_id_missing',
              `The exact NARS session id is missing for ${agent.agent}; the Web UI projection cannot be correlated safely.`,
              'Retry after the runtime attachment evidence contains the exact NARS session id.',
            );
          }
          try {
            hiddenProjectionLaunches.push(await workspaceLaunchStartHiddenProjectionHost(
              projectionCommand,
              support.workspaceLaunchString(agent.workspace_root) ?? agent.site_root,
              agent.launch_session_id,
              {
                agent_id: agent.agent,
                launch_session_id: agent.launch_session_id,
                nars_session_id: attachedSessionId,
                launch_binding_path: agent.operator_projection_launch_binding?.path ?? null,
                readiness_path: agent.operator_projection_launch_binding?.path
                  ? workspaceLaunchProjectionReadinessPath(agent.operator_projection_launch_binding.path)
                  : null,
              },
            ));
          } catch (projectionError) {
            // A readiness failure may already have cleaned the projection child. Only
            // carry it into outer rollback when that cleanup was explicitly refused.
            if (projectionError instanceof WorkspaceLaunchProcessReadinessError
              && projectionError.cleanup_status === 'refused') {
              hiddenProjectionLaunches.push(projectionError.launch);
            }
            throw projectionError;
          }
        }
        if (terminalTabs.length > 0) {
          stage = 'terminal_handoff';
          const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
          const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
          let terminalLaunch: { status: number | null; error?: Error };
          try {
            terminalLaunch = terminalCaptureLog
              ? await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs)
              : startWorkspaceLaunchWindowsTerminal(effectiveWtArgs);
          } catch (terminalError) {
            terminalHandoff = {
              status: 'failed',
              wt_exit_code: null,
              wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs),
            };
            throw terminalError;
          }
          terminalHandoff = {
            status: terminalLaunch.error || terminalLaunch.status !== 0 ? 'failed' : 'accepted',
            wt_exit_code: terminalLaunch.status ?? null,
            wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs),
          };
          if (terminalLaunch.error) throw terminalLaunch.error;
          if (terminalLaunch.status !== 0) {
            throw new Error(`windows_terminal_launch_failed: wt exited ${terminalLaunch.status ?? 'unknown'}`);
          }
        }
      }

      stage = 'result_persistence';
      const launchResult = finalizeWorkspaceLaunchResult({ ...result, transaction }, {
        windows_terminal_invoked: terminalHandoff.status === 'accepted',
        hidden_runtime_invoked: true,
        hidden_runtime_launches: hiddenLaunches,
        hidden_projection_launches: hiddenProjectionLaunches,
        ...(terminalHandoff.status === 'accepted' && terminalHandoff.wt_exit_code !== null
          ? { wt_exit_code: terminalHandoff.wt_exit_code }
          : {}),
        attachment,
      });
      await writeWorkspacePlanResult(options.resultPath, launchResult);
      return {
        exitCode: ExitCode.SUCCESS,
        result: formattedResult(
          launchResult,
          `launched ${result.count ?? 0} hidden runtime start(s)${terminalHandoff.status === 'accepted' ? ' and projection terminal(s)' : ''}`,
          options.format ?? 'auto',
        ),
      };
    }

    stage = 'terminal_handoff';
    const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
    const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
    let launch: { status: number | null; error?: Error };
    try {
      launch = terminalCaptureLog
        ? await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs)
        : startWorkspaceLaunchWindowsTerminal(effectiveWtArgs);
    } catch (terminalError) {
      terminalHandoff = {
        status: 'failed',
        wt_exit_code: null,
        wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs),
      };
      throw terminalError;
    }
    terminalHandoff = {
      status: launch.error || launch.status !== 0 ? 'failed' : 'accepted',
      wt_exit_code: launch.status ?? null,
      wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs),
    };
    if (launch.error) throw launch.error;
    if (launch.status !== 0) {
      throw new Error(`windows_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
    }

    transaction = advanceWorkspaceLaunchTransaction(transaction, 'spawned');
    transaction = advanceWorkspaceLaunchTransaction(transaction, 'handed_off');
    attachment = visibleHandoffAttachment(selectedAgents);
    stage = 'result_persistence';
    const launchResult = finalizeWorkspaceLaunchResult({ ...result, transaction }, {
      windows_terminal_invoked: true,
      hidden_runtime_invoked: false,
      wt_exit_code: launch.status ?? 0,
      attachment,
    });
    await writeWorkspacePlanResult(options.resultPath, launchResult);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(launchResult, `launched ${result.count} workspace launch(es)`, options.format ?? 'auto'),
    };
  } catch (error) {
    const rollback = workspaceLaunchRollbackOwnedProcesses([...hiddenLaunches, ...hiddenProjectionLaunches]);
    const failedTransaction = failureTransaction(transaction, rollback);
    const failureDetails = describeWorkspaceLaunchFailure(error, stage, rollback.completed);
    const failure = createWorkspaceLaunchFailureResult(result, failedTransaction, {
      ...failureDetails,
      artifact_path: options.resultPath ?? null,
      artifact_status: options.resultPath ? 'written' : 'not_requested',
      rollback,
      hidden_runtime_launches: hiddenLaunches,
      hidden_projection_launches: hiddenProjectionLaunches,
      attachment: error instanceof WorkspaceLaunchAttachmentError ? error.evidence : attachment,
      operator_terminal_handoff: terminalHandoff,
    });
    let artifactStatus: 'written' | 'not_requested' | 'write_failed' = options.resultPath ? 'written' : 'not_requested';
    try {
      await writeWorkspacePlanResult(options.resultPath, failure);
    } catch (artifactError) {
      artifactStatus = 'write_failed';
      failure.failure.artifact_status = artifactStatus;
      failure.failure.message = `${failure.failure.message} Failure artifact could not be written: ${redactWorkspaceLaunchText(artifactError instanceof Error ? artifactError.message : String(artifactError))}`;
    }
    failure.failure.artifact_status = artifactStatus;
    const reason = rollback.completed
      ? failureDetails.reason
      : `${failureDetails.reason} ${rollback.orphan_count} owned child process(es) remain unresolved; use the artifact to recover them.`;
    throw new WorkspaceLaunchContractError(
      rollback.completed ? failureDetails.reason_code : 'workspace_launch_rollback_incomplete',
      reason,
      rollback.completed
        ? failureDetails.required_next_step
        : 'Inspect the launch artifact and terminate the remaining owned process(es) before retrying.',
      artifactStatus === 'written' ? options.resultPath ?? null : null,
    );
  }
}

function workspaceLaunchExecutionAgents(value: unknown): WorkspaceLaunchAgentPlan[] {
  if (!Array.isArray(value)) return [];
  return value.filter((agent): agent is WorkspaceLaunchAgentPlan => {
    if (!support.isRecord(agent)) return false;
    return typeof agent.agent === 'string'
      && typeof agent.site_root === 'string'
      && (agent.runtime_start_execution_mode === 'hidden_detached' || agent.runtime_start_execution_mode === 'operator_terminal')
      && isStringArray(agent.runtime_start_command)
      && isStringArray(agent.hidden_runtime_start_command)
      && Array.isArray(agent.terminal_tabs)
      && Array.isArray(agent.operator_projection_open_requests);
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function failureTransaction(
  transaction: Record<string, unknown>,
  rollback: ReturnType<typeof workspaceLaunchRollbackOwnedProcesses>,
): Record<string, unknown> {
  try {
    return failWorkspaceLaunchTransaction(transaction, rollback);
  } catch {
    return {
      schema: 'narada.workspace_launch.transaction.v1',
      launch_session_id: typeof transaction.launch_session_id === 'string' ? transaction.launch_session_id : null,
      state: 'failed',
      history: ['failed'],
      rollback,
    };
  }
}

function createWorkspaceLaunchFailureResult(
  plan: unknown,
  transaction: Record<string, unknown>,
  failure: Omit<WorkspaceLaunchFailureResult['failure'], 'schema' | 'artifact_status'> & { artifact_status: 'written' | 'not_requested' | 'write_failed' },
): WorkspaceLaunchFailureResult {
  const source = support.isRecord(plan) ? plan : {};
  const selectedAgents = workspaceLaunchExecutionAgents(source.selected_agents)
    .flatMap((agent) => {
      try {
        return [redactWorkspaceLaunchAgentPlan(agent)];
      } catch {
        return [];
      }
    });
  const ownership = support.isRecord(source.ownership)
    && source.ownership.planner === 'narada-cli'
    && source.ownership.executor === 'narada-cli.workspace-launch'
    ? source.ownership as WorkspaceLaunchPlanResult['ownership']
    : {
        planner: 'narada-cli' as const,
        executor: 'narada-cli.workspace-launch' as const,
        migrated_from: 'invalid launch plan rejected before execution',
      };
  return {
    schema: 'narada.workspace_launch.failure.v1',
    status: 'failed',
    mutation_performed: false,
    mode: 'launch',
    count: Number.isInteger(source.count) && Number(source.count) >= 0 ? Number(source.count) : selectedAgents.length,
    windows_terminal_invoked: failure.operator_terminal_handoff.status !== 'not_attempted',
    registry_paths: support.stringArray(source.registry_paths),
    selected_agents: selectedAgents,
    transaction,
    wt_args: redactWorkspaceLaunchArgv(support.stringArray(source.wt_args)),
    ownership,
    ...(failure.artifact_path ? { result_path: failure.artifact_path } : {}),
    ...(typeof source.suppress_result_output === 'boolean' ? { suppress_result_output: source.suppress_result_output } : {}),
    failure: {
      ...failure,
      schema: 'narada.workspace_launch.failure_evidence.v1',
    },
  };
}

function redactWorkspaceLaunchAgentPlan(agent: WorkspaceLaunchAgentPlan): WorkspaceLaunchAgentPlan {
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

function describeWorkspaceLaunchFailure(error: unknown, stage: WorkspaceLaunchFailureStage, rollbackCompleted: boolean): {
  stage: string;
  reason_code: string;
  message: string;
  reason: string;
  error_type: string;
  required_next_step: string;
  retryable: boolean;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const parsed = rawMessage.match(/^([a-z][a-z0-9_]*):\s*([\s\S]*)$/i);
  const bareReasonCode = rawMessage.match(/^(workspace_launch_[a-z0-9_]+)$/i)?.[1] ?? null;
  const reasonCode = error instanceof WorkspaceLaunchContractError
    ? error.reasonCode
    : parsed?.[1]?.startsWith('workspace_launch_') ? parsed[1] : bareReasonCode ?? `workspace_launch_${stage}_failed`;
  const reason = error instanceof WorkspaceLaunchContractError
    ? error.reason
    : parsed?.[1]?.startsWith('workspace_launch_') ? parsed[2] : rawMessage;
  const requiredNextStep = error instanceof WorkspaceLaunchContractError
    ? error.requiredNextStep
    : stage === 'session_attachment'
      ? 'Inspect the launch artifact and retry after the exact runtime session becomes healthy.'
      : stage === 'catalog_preflight'
        ? 'Resolve the Site intelligence catalog readiness refusal shown in the launch artifact, then retry.'
        : stage === 'projection_start'
          ? 'Inspect the launch artifact and retry after the Web UI projection startup boundary is healthy.'
        : 'Inspect the launch artifact and retry after correcting the reported launch boundary.';
  return {
    stage,
    reason_code: rollbackCompleted ? reasonCode : 'workspace_launch_rollback_incomplete',
    message: redactWorkspaceLaunchText(reason || 'workspace launch failed'),
    reason: redactWorkspaceLaunchText(reason || 'workspace launch failed'),
    error_type: error instanceof Error ? error.name : 'unknown',
    required_next_step: requiredNextStep,
    retryable: rollbackCompleted,
  };
}

function notCheckedAttachment(plans: WorkspaceLaunchAgentPlan[], reason: string): WorkspaceLaunchAttachmentEvidence {
  return {
    schema: 'narada.workspace_launch.attachment.v1',
    status: 'not_checked',
    exact_session: false,
    launch_session_ids: plans.flatMap((plan) => plan.launch_session_id ? [plan.launch_session_id] : []),
    sessions: plans.map((plan) => ({
      launch_session_id: plan.launch_session_id ?? '<missing>',
      session_id: null,
      health_session_id: null,
      health_identity_match: false,
      site_root: plan.site_root,
      event_endpoint: null,
      health_endpoint: null,
      health_status: 'not_checked' as const,
      attempts: 0,
      reason,
    })),
    required_next_step: 'Disable launch capture mode and retry to verify exact session attachment.',
  };
}

function visibleHandoffAttachment(plans: WorkspaceLaunchAgentPlan[]): WorkspaceLaunchAttachmentEvidence {
  return {
    schema: 'narada.workspace_launch.attachment.v1',
    status: 'handoff_pending',
    exact_session: false,
    launch_session_ids: plans.flatMap((plan) => plan.launch_session_id ? [plan.launch_session_id] : []),
    sessions: plans.map((plan) => ({
      launch_session_id: plan.launch_session_id ?? '<missing>',
      session_id: null,
      health_session_id: null,
      health_identity_match: false,
      site_root: plan.site_root,
      event_endpoint: null,
      health_endpoint: null,
      health_status: 'not_checked' as const,
      attempts: 0,
      reason: 'visible terminal handoff accepted; runtime session attachment is observed separately',
    })),
    required_next_step: 'Observe the exact launch session before opening a client projection.',
  };
}

async function runWorkspaceLaunchCatalogPreflight(selectedAgents: WorkspaceLaunchPlanResult['selected_agents']): Promise<void> {
  const userSiteRoot = resolve(process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada'));
  for (const agent of selectedAgents) {
    if (agent.runtime_host_kind !== NARADA_AGENT_RUNTIME_SERVER_KIND) continue;
    if (resolve(agent.site_root).toLowerCase() === userSiteRoot.toLowerCase()) {
      await ensureIntelligenceCatalog({
        siteRoot: agent.site_root,
        targetSiteId: agent.site,
        userSiteId: agent.site,
        hostSiteId: process.env.NARADA_HOST_SITE_ID ?? agent.site,
      });
    }
    const preflight = runAgentStartCommand({
      siteRoot: agent.site_root,
      targetSiteId: agent.site,
      workspaceRoot: agent.workspace_root ?? undefined,
      agent: agent.agent,
      carrier: agent.launch_operator_surface,
      runtime: agent.launch_runtime_host,
      authority: agent.authority ?? undefined,
      mcpScope: agent.mcp_scope,
      preflightOnly: true,
      launchSource: 'narada workspace-launch catalog preflight',
    });
    if (!isAgentStartAcceptedStatus(preflight.status)) {
      throw new Error(`workspace_launch_catalog_preflight_failed: ${agent.agent}: ${describeAgentStartPreflightFailure(preflight)}`);
    }
    const result = preflight.parsed_result;
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || (result as { schema?: unknown }).schema !== 'narada.agent_start.intelligence_catalog_preflight.v1'
      || (result as { status?: unknown }).status !== 'ready') {
      throw new Error(`workspace_launch_catalog_preflight_invalid: ${agent.agent}`);
    }
  }
}

function describeAgentStartPreflightFailure(preflight: ReturnType<typeof runAgentStartCommand>): string {
  if (typeof preflight.error === 'string' && preflight.error.trim()) return redactWorkspaceLaunchText(preflight.error.trim());
  if (preflight.parsed_result && typeof preflight.parsed_result === 'object' && !Array.isArray(preflight.parsed_result)) {
    const result = preflight.parsed_result as {
      reason_code?: unknown;
      reason?: unknown;
      required_next_step?: unknown;
      recovery?: { primary_command?: unknown; followup_command?: unknown };
    };
    const reasonCode = typeof result.reason_code === 'string' ? result.reason_code.trim() : '';
    const reason = typeof result.reason === 'string' ? result.reason.trim() : '';
    const nextStep = typeof result.required_next_step === 'string' ? result.required_next_step.trim() : '';
    const recovery = result.recovery;
    const recoveryCommand = typeof recovery?.primary_command === 'string' ? recovery.primary_command.trim() : '';
    const followupCommand = typeof recovery?.followup_command === 'string' ? recovery.followup_command.trim() : '';
    if (reasonCode && reason && recoveryCommand) {
      const normalizedReason = reason.replace(/[.!?]+\s*$/, '');
      return redactWorkspaceLaunchText(`${reasonCode}: ${normalizedReason}. Recovery: ${recoveryCommand}${followupCommand ? `; then ${followupCommand}` : ''}`);
    }
    if (reasonCode && reason) return redactWorkspaceLaunchText(`${reasonCode}: ${reason}`);
    if (reasonCode) return redactWorkspaceLaunchText(reasonCode);
    if (reason) return redactWorkspaceLaunchText(reason);
    if (nextStep) return redactWorkspaceLaunchText(nextStep);
  }
  return redactWorkspaceLaunchText(preflight.status);
}
