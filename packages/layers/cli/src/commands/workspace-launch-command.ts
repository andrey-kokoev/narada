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
import type { WorkspaceLaunchSelectionServices } from './workspace-launch-context.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import { buildAgentPlan } from './workspace-launch-plan-builder.js';
import { executeWorkspaceLaunchPlan } from './workspace-launch-executor.js';
import { assertWorkspaceLaunchPlanPreflight } from './workspace-launch-preflight.js';
import { resolveInteractiveSelectionOptions } from './workspace-launch-selection-adapters.js';
import {
  normalizeWorkspaceLaunchPlanOptions,
  readWorkspaceLaunchRecords,
  requireSiteCatalogForInteractiveSelection,
  resolveRegistryPaths,
  selectLaunchRecords,
} from './workspace-launch-registry.js';
import { runPersistentWorkspaceLaunchSelectionUiCommand } from './workspace-launch-ui-command.js';
import { runWorkspaceLaunchSmoke } from './workspace-launch-smoke.js';
import { isWorkspaceLaunchPlanResult } from './workspace-launch-types.js';
import { assertWorkspaceLaunchPlanInvariants } from './workspace-launch-result.js';
import { createWorkspaceLaunchTransaction, WorkspaceLaunchContractError } from './workspace-launch-contracts.js';
import {
  createWorkspaceLaunchExecutionAttempt,
  readWorkspaceLaunchExecutionAttempt,
  workspaceLaunchExecutionAttemptPath,
  updateWorkspaceLaunchExecutionAttempt,
  type WorkspaceLaunchExecutionAttemptRecord,
} from './workspace-launch-execution-attempt-store.js';
import { redactWorkspaceLaunchText } from './workspace-launch-process.js';

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
  selectionServices: WorkspaceLaunchSelectionServices,
  registryContext: WorkspaceLaunchRegistryContext,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchPlanningResult>> {
  const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(normalizedOptions);
  const loaded = await readWorkspaceLaunchRecords(normalizedOptions);
  const records = loaded.records;
  requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const resolvedOptions = await resolveInteractiveSelectionOptions(records, normalizedOptions, loaded.siteCatalog, selectionServices);
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
    interactive_selection: resolvedOptions.interactiveSelection === true || resolvedOptions.interactiveSelectionUi === true,
    interactive_selection_surface: resolvedOptions.interactiveSelectionUi === true
      ? 'browser'
      : (resolvedOptions.interactiveSelection === true ? 'terminal' : null),
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
    ...(resolvedOptions.executionAttemptId ? { launch_attempt_id: resolvedOptions.executionAttemptId } : {}),
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
  selectionServices: WorkspaceLaunchSelectionServices,
  registryContext: WorkspaceLaunchRegistryContext,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>> {
  if (options.interactiveSelectionUi && !options.dryRun && !options.smoke) {
    return runPersistentWorkspaceLaunchSelectionUiCommand(
      options,
      selectionServices,
      registryContext,
      (selectionOptions) => workspaceLaunchCommand(selectionOptions, context, selectionServices, registryContext),
    );
  }

  let executionAttempt: WorkspaceLaunchExecutionAttemptRecord | null = null;
  let executionOptions = options;
  if (!options.dryRun && !options.smoke) {
    const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
    const registryPaths = resolveRegistryPaths(normalizedOptions);
    executionAttempt = await createWorkspaceLaunchExecutionAttempt(options, registryPaths);
    executionOptions = {
      ...options,
      executionAttemptId: executionAttempt.launch_attempt_id,
      resultPath: options.resultPath ?? executionAttempt.result_path,
    };
  }

  try {
    const plan = await workspaceLaunchPlanCommand(executionOptions, context, selectionServices, registryContext);
    if (plan.exitCode !== ExitCode.SUCCESS || options.smoke) return plan;
    if (!isWorkspaceLaunchPlanResult(plan.result)) {
      throw new Error('narada_workspace_plan_result_not_executable');
    }

    return executeWorkspaceLaunchPlan(executionOptions, plan.result);
  } catch (error) {
    if (executionAttempt) {
      const failureMessage = redactWorkspaceLaunchText(error instanceof Error ? error.message : String(error));
      const persistedAttempt = await readWorkspaceLaunchExecutionAttempt(
        workspaceLaunchExecutionAttemptPath(executionAttempt.launch_attempt_id),
      ).catch(() => null);
      const currentAttempt = persistedAttempt ?? executionAttempt;
      const currentState = currentAttempt.state;
      const statePreservingFailure = currentState === 'recoverable' || currentState === 'recovery_requested';
      const terminalState = currentState === 'launched' || currentState === 'recovered';
      const failure = {
        reason_code: error instanceof WorkspaceLaunchContractError ? error.reasonCode : 'workspace_launch_planning_failed',
        message: failureMessage,
        required_next_step: error instanceof WorkspaceLaunchContractError
          ? error.requiredNextStep
          : 'Inspect the launch result artifact and retry after correcting the launch boundary.',
      };
      if (!terminalState) {
        await updateWorkspaceLaunchExecutionAttempt(currentAttempt, statePreservingFailure ? currentState : 'failed', { failure })
          .catch(() => undefined);
      }
      const artifactPath = executionOptions.resultPath;
      const artifactAlreadyWritten = error instanceof WorkspaceLaunchContractError && error.artifactPath === artifactPath;
      let artifactWriteError: string | null = null;
      if (artifactPath && !artifactAlreadyWritten) {
        await writeWorkspacePlanResult(artifactPath, createWorkspaceLaunchPlanningFailureResult(executionOptions, registryPathsFromAttempt(executionAttempt), error, 'written'))
          .catch((artifactError) => {
            artifactWriteError = redactWorkspaceLaunchText(artifactError instanceof Error ? artifactError.message : String(artifactError));
          });
      }
      if (artifactWriteError && !terminalState) {
        await updateWorkspaceLaunchExecutionAttempt(currentAttempt, statePreservingFailure ? currentState : 'failed', {
          failure: {
            ...failure,
            message: `${failure.message} Failure artifact could not be written: ${artifactWriteError}`,
            required_next_step: 'Repair the result artifact path or permissions before retrying the launch.',
          },
        }).catch(() => undefined);
        throw new WorkspaceLaunchContractError(
          'workspace_launch_failure_artifact_write_failed',
          `${failure.message} Failure artifact could not be written: ${artifactWriteError}`,
          'Repair the result artifact path or permissions before retrying the launch.',
          null,
        );
      }
    }
    throw error;
  }
}

function registryPathsFromAttempt(attempt: WorkspaceLaunchExecutionAttemptRecord): string[] {
  return [...attempt.registry_paths];
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
    interactive_selection: options.interactiveSelection === true || options.interactiveSelectionUi === true,
    interactive_selection_surface: options.interactiveSelectionUi === true ? 'browser' as const : options.interactiveSelection === true ? 'terminal' as const : null,
    count: 0,
    windows_terminal_invoked: false,
    registry_paths: registryPaths,
    selected_agents: [],
    transaction: {
      ...createWorkspaceLaunchTransaction(options.executionAttemptId ?? null),
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

