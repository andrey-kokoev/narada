import { carrierStartCommand } from './carrier.js';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import * as support from './workspace-launch-support.js';
import type { WorkspaceLaunchPlanOptions } from './workspace-launch-types.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import type { WorkspaceLaunchSelectionServices } from './workspace-launch-context.js';
import { buildAgentPlan } from './workspace-launch-plan-builder.js';
import { executeWorkspaceLaunchPlan } from './workspace-launch-executor.js';
import {
  resolveInteractiveSelectionOptions,
  workspaceLaunchOptionsFromBrowserSelection,
} from './workspace-launch-selection-adapters.js';
import {
  normalizeWorkspaceLaunchPlanOptions,
  readWorkspaceLaunchRecords,
  requireSiteCatalogForInteractiveSelection,
  resolveRegistryPaths,
  selectLaunchRecords,
} from './workspace-launch-registry.js';
import {
  runPersistentWorkspaceLaunchSelectionUi as runPersistentWorkspaceLaunchSelectionUiController,
} from './workspace-launch-ui-controller.js';

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
  selectionServices: WorkspaceLaunchSelectionServices,
  registryContext: WorkspaceLaunchRegistryContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
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
    const agents = [];
    for (const plan of plans) {
      const smoke = await carrierStartCommand({
        siteRoot: plan.site_root,
        targetSiteId: plan.site,
        workspaceRoot: plan.workspace_root ?? undefined,
        agent: plan.agent,
        carrier: plan.launch_carrier,
        runtime: plan.launch_runtime_host,
        authority: plan.authority ?? undefined,
        intelligenceProvider: plan.intelligence_provider ?? undefined,
        mcpScope: plan.mcp_scope,
        dryRun: true,
        enableNativeShell: plan.enable_native_shell,
        format: 'json',
      }, context);
      const operatorSurfaceRuntimeStart = smoke.result;
      agents.push({
        agent: plan.agent,
        site: plan.site,
        operator_surface: plan.launch_operator_surface,
        carrier: plan.launch_carrier,
        runtime: plan.launch_runtime,
        status: smoke.exitCode === ExitCode.SUCCESS ? 'passed' : 'failed',
        plan,
        operator_surface_runtime_start: operatorSurfaceRuntimeStart,
        operator_surface_start: operatorSurfaceRuntimeStart,
      });
    }
    const failed = agents.filter((agent) => agent.status !== 'passed');
    const smokeResult = {
      schema: 'narada.workspace_launch.smoke.v1',
      status: failed.length === 0 ? 'passed' : 'failed',
      mutation_performed: false,
      count: agents.length,
      windows_terminal_invoked: false,
      mcp_initialization: {
        status: 'not_executed_in_dry_run',
        reason: 'Smoke mode calls operator-surface runtime start dry-run only; live MCP startup remains an execution probe.',
      },
      registry_paths: registryPaths,
      agents,
      ownership: {
        planner: 'narada-cli',
        smoke_aggregator: 'narada-cli',
        executor: 'none',
        migrated_from: 'Start-NaradaWorkspace.ps1 inline smoke aggregation',
      },
      ...(resolvedOptions.resultPath ? { result_path: resolvedOptions.resultPath } : {}),
      ...(resolvedOptions.suppressResultOutput ? { suppress_result_output: true } : {}),
    };
    await support.writeWorkspacePlanResult(resolvedOptions.resultPath, smokeResult);
    return {
      exitCode: failed.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: formattedResult(smokeResult, `workspace smoke ${smokeResult.status}`, resolvedOptions.format ?? 'auto'),
    };
  }
  const mode = resolvedOptions.smoke ? 'smoke' : resolvedOptions.dryRun ? 'dry_run' : 'plan';
  const result = {
    schema: 'narada.workspace_launch.plan.v1',
    status: 'planned',
    mutation_performed: false,
    mode,
    interactive_selection: resolvedOptions.interactiveSelection === true || resolvedOptions.interactiveSelectionUi === true,
    interactive_selection_surface: resolvedOptions.interactiveSelectionUi === true ? 'browser' : (resolvedOptions.interactiveSelection === true ? 'terminal' : null),
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
  await support.writeWorkspacePlanResult(resolvedOptions.resultPath, result);

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
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (options.interactiveSelectionUi && !options.dryRun && !options.smoke) {
    return runPersistentWorkspaceLaunchSelectionUiCommand(options, context, selectionServices, registryContext);
  }

  const plan = await workspaceLaunchPlanCommand(options, context, selectionServices, registryContext);
  if (plan.exitCode !== ExitCode.SUCCESS || options.smoke) return plan;

  return executeWorkspaceLaunchPlan(options, plan.result as Record<string, unknown>);
}


export async function runPersistentWorkspaceLaunchSelectionUiCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
  selectionServices: WorkspaceLaunchSelectionServices,
  registryContext: WorkspaceLaunchRegistryContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(normalizedOptions);
  const loaded = await readWorkspaceLaunchRecords(normalizedOptions);
  requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const session = await runPersistentWorkspaceLaunchSelectionUiController(loaded.records, normalizedOptions, async (selection) => {
    const selectionOptions = workspaceLaunchOptionsFromBrowserSelection(normalizedOptions, selection);
    return workspaceLaunchCommand({
      ...selectionOptions,
      interactiveSelection: false,
      interactiveSelectionUi: false,
    }, context, selectionServices, registryContext);
  }, loaded.siteCatalog, selectionServices);

  return {
    exitCode: session.status === 'cancelled' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult({
      schema: 'narada.workspace_launch.interactive_selection_ui_session.v1',
      status: session.status,
      mutation_performed: session.launch_count > 0,
      url: session.url,
      direct_url: session.direct_url,
      router_url: session.router_url,
      stable_url: session.stable_url,
      ingress_mode: session.ingress_mode,
      ingress_reason: session.reason,
      launch_count: session.launch_count,
      registry_paths: registryPaths,
      ownership: {
        planner: 'narada-cli',
        executor: 'narada-cli.workspace-launch',
        interactive_selection_surface: 'browser',
      },
    }, `workspace launch selection UI ${session.status}`, normalizedOptions.format ?? 'auto'),
  };
}

