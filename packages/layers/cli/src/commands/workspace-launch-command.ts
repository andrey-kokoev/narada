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
    wt_args: wtArgs,
    ownership: {
      planner: 'narada-cli',
      executor: 'narada-cli.workspace-launch',
      migrated_from: 'Start-NaradaWorkspace.ps1 inline registry/filter/wt planning',
    },
    ...(resolvedOptions.resultPath ? { result_path: resolvedOptions.resultPath } : {}),
    ...(resolvedOptions.suppressResultOutput ? { suppress_result_output: true } : {}),
  };
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

  const plan = await workspaceLaunchPlanCommand(options, context, selectionServices, registryContext);
  if (plan.exitCode !== ExitCode.SUCCESS || options.smoke) return plan;
  if (!isWorkspaceLaunchPlanResult(plan.result)) {
    throw new Error('narada_workspace_plan_result_not_executable');
  }

  return executeWorkspaceLaunchPlan(options, plan.result);
}

