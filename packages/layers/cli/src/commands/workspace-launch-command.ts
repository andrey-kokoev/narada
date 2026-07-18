import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import { writeWorkspacePlanResult } from './workspace-launch-persistence.js';
import type {
  WorkspaceLaunchCommandOutput,
  WorkspaceLaunchCommandResult,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchPlanResult,
  WorkspaceLaunchPlanningResult,
} from './workspace-launch-types.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import { buildAgentPlan } from './workspace-launch-plan-builder.js';
import { executeWorkspaceLaunchPlan } from './workspace-launch-executor.js';
import { assertWorkspaceLaunchPlanPreflight } from './workspace-launch-preflight.js';
import {
  normalizeWorkspaceLaunchPlanOptions,
  readWorkspaceLaunchRecords,
  resolveRegistryPaths,
  selectLaunchRecords,
} from './workspace-launch-registry.js';
import { runWorkspaceLaunchSmoke } from './workspace-launch-smoke.js';
import { isWorkspaceLaunchPlanResult } from './workspace-launch-types.js';
import { assertWorkspaceLaunchPlanInvariants } from './workspace-launch-result.js';
import { createWorkspaceLaunchTransaction, WorkspaceLaunchContractError } from './workspace-launch-contracts.js';
import { redactWorkspaceLaunchText } from './workspace-launch-process.js';

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
  registryContext: WorkspaceLaunchRegistryContext,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchPlanningResult>> {
  const resolvedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(resolvedOptions);
  const loaded = await readWorkspaceLaunchRecords(resolvedOptions);
  const records = loaded.records;
  const selected = selectLaunchRecords(records, resolvedOptions);
  const plans = selected.map((record) => buildAgentPlan(record, resolvedOptions, registryContext));
  assertWorkspaceLaunchPlanPreflight(plans);
  const wtArgs = plans.flatMap((plan, index) => [
    ...(index === 0 ? [] : [';']),
    ...plan.wt_args,
  ]);

  if (resolvedOptions.smoke) {
    return runWorkspaceLaunchSmoke(plans, resolvedOptions, context, registryPaths);
  }

  const result: WorkspaceLaunchPlanResult = {
    schema: 'narada.workspace_launch.plan.v1',
    status: 'planned',
    mutation_performed: false,
    mode: resolvedOptions.dryRun ? 'dry_run' : 'plan',
    interactive_selection: false,
    interactive_selection_surface: null,
    count: plans.length,
    windows_terminal_invoked: false,
    registry_paths: registryPaths,
    selected_agents: plans,
    transaction: createWorkspaceLaunchTransaction(`batch:${plans.map((plan) => plan.launch_session_id ?? 'unknown').join(',')}`),
    wt_args: wtArgs,
    ownership: {
      planner: 'narada-cli',
      executor: 'narada-cli.workspace-launch',
      migrated_from: 'Start-NaradaWorkspace.ps1 inline registry/filter/wt planning',
    },
    ...(resolvedOptions.resultPath ? { result_path: resolvedOptions.resultPath } : {}),
    ...(resolvedOptions.suppressResultOutput ? { suppress_result_output: true } : {}),
  };
  assertWorkspaceLaunchPlanInvariants(result);
  await writeWorkspacePlanResult(resolvedOptions.resultPath, result);

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, `planned ${plans.length} workspace launch(es)`, resolvedOptions.format ?? 'auto'),
  };
}

export async function workspaceLaunchCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
  registryContext: WorkspaceLaunchRegistryContext,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>> {
  try {
    const plan = await workspaceLaunchPlanCommand(options, context, registryContext);
    if (plan.exitCode !== ExitCode.SUCCESS || options.smoke) return plan;
    if (!isWorkspaceLaunchPlanResult(plan.result)) {
      throw new Error('narada_workspace_plan_result_not_executable');
    }

    return executeWorkspaceLaunchPlan(options, plan.result);
  } catch (error) {
    // Best-effort planning-failure artifact when the caller asked for a result
    // path and the error did not already produce that artifact.
    if (options.resultPath && !options.dryRun && !options.smoke) {
      const artifactAlreadyWritten = error instanceof WorkspaceLaunchContractError && error.artifactPath === options.resultPath;
      if (!artifactAlreadyWritten) {
        const registryPaths = resolveRegistryPaths(normalizeWorkspaceLaunchPlanOptions(options));
        await writeWorkspacePlanResult(options.resultPath, createWorkspaceLaunchPlanningFailureResult(options, registryPaths, error, 'written'))
          .catch(() => undefined);
      }
    }
    throw error;
  }
}

function createWorkspaceLaunchPlanningFailureResult(
  options: WorkspaceLaunchPlanOptions,
  registryPaths: string[],
  error: unknown,
  artifactStatus: 'written' | 'write_failed' = 'written',
) {
  const reasonCode = error instanceof WorkspaceLaunchContractError
    ? error.reasonCode
    : 'workspace_launch_planning_failed';
  const message = redactWorkspaceLaunchText(error instanceof Error ? error.message : String(error));
  const requiredNextStep = error instanceof WorkspaceLaunchContractError
    ? error.requiredNextStep
    : 'Inspect the launch result artifact and retry after correcting the launch boundary.';
  return {
    schema: 'narada.workspace_launch.failure.v1' as const,
    status: 'failed' as const,
    mutation_performed: false as const,
    mode: 'launch' as const,
    interactive_selection: false,
    interactive_selection_surface: null,
    count: 0,
    windows_terminal_invoked: false,
    registry_paths: registryPaths,
    selected_agents: [],
    transaction: {
      ...createWorkspaceLaunchTransaction(null),
      state: 'failed',
      history: ['planned', 'failed'],
    },
    wt_args: [],
    ownership: {
      planner: 'narada-cli' as const,
      executor: 'narada-cli.workspace-launch' as const,
      migrated_from: 'planning failure boundary',
    },
    ...(options.resultPath ? { result_path: options.resultPath } : {}),
    failure: {
      schema: 'narada.workspace_launch.failure_evidence.v1' as const,
      stage: 'planning',
      reason_code: reasonCode,
      message,
      error_type: error instanceof Error ? error.name : 'unknown',
      required_next_step: requiredNextStep,
      retryable: true,
      artifact_path: options.resultPath ?? null,
      artifact_status: artifactStatus,
      rollback: { attempted: false, completed: true, orphan_count: 0, statuses: [], targets: [] },
      hidden_runtime_launches: [],
      hidden_projection_launches: [],
      attachment: null,
      operator_terminal_handoff: { status: 'not_attempted' as const, wt_exit_code: null, wt_args: [] },
    },
  };
}
