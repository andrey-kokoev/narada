import { appendFile } from 'node:fs/promises';
import { startOperatorTerminal } from '@narada2/process-launch-posture';
import * as prompts from '@clack/prompts';
import { carrierStartCommand } from './carrier.js';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import * as launcher from './launcher.js';
import {
  runPersistentWorkspaceLaunchSelectionUi as runPersistentWorkspaceLaunchSelectionUiController,
  runWorkspaceLaunchSelectionUi as runWorkspaceLaunchSelectionUiController,
} from './workspace-launch-ui-controller.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';

export async function workspaceLaunchPlanCommand(
  options: launcher.WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const normalizedOptions = launcher.normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = launcher.resolveRegistryPaths(normalizedOptions);
  const loaded = await launcher.readWorkspaceLaunchRecords(normalizedOptions);
  const records = loaded.records;
  launcher.requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const resolvedOptions = await resolveInteractiveSelectionOptions(records, normalizedOptions, loaded.siteCatalog);
  const selected = launcher.selectLaunchRecords(records, resolvedOptions);
  const plans = selected.map((record) => launcher.buildAgentPlan(record, resolvedOptions));
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
        legacy_carrier_compatibility: launcher.legacyCarrierCompatibility(),
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
      compatibility: launcher.legacyCarrierCompatibility(),
      ownership: {
        planner: 'narada-cli',
        smoke_aggregator: 'narada-cli',
        executor: 'none',
        migrated_from: 'Start-NaradaWorkspace.ps1 inline smoke aggregation',
      },
      ...(resolvedOptions.resultPath ? { result_path: resolvedOptions.resultPath } : {}),
      ...(resolvedOptions.suppressResultOutput ? { suppress_result_output: true } : {}),
    };
    await launcher.writeWorkspacePlanResult(resolvedOptions.resultPath, smokeResult);
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
    wt_args_authority: 'compatibility_non_authoritative',
    compatibility: launcher.legacyCarrierCompatibility(),
    ownership: {
      planner: 'narada-cli',
      executor: 'narada-cli.workspace-launch',
      migrated_from: 'Start-NaradaWorkspace.ps1 inline registry/filter/wt planning',
    },
    ...(resolvedOptions.resultPath ? { result_path: resolvedOptions.resultPath } : {}),
    ...(resolvedOptions.suppressResultOutput ? { suppress_result_output: true } : {}),
  };
  await launcher.writeWorkspacePlanResult(resolvedOptions.resultPath, result);

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, `planned ${plans.length} workspace launch(es)`, resolvedOptions.format ?? 'auto'),
  };
}

export async function workspaceLaunchCommand(
  options: launcher.WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (options.interactiveSelectionUi && !options.dryRun && !options.smoke) {
    return runPersistentWorkspaceLaunchSelectionUiCommand(options, context);
  }

  const plan = await workspaceLaunchPlanCommand(options, context);
  if (plan.exitCode !== ExitCode.SUCCESS || options.smoke) return plan;

  const result = plan.result as Record<string, unknown>;
  const wtArgs = launcher.stringArray(result.wt_args);
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(launcher.isRecord) : [];
  const hiddenRuntimeAgents = selectedAgents.filter((agent) => agent.runtime_start_execution_mode === 'hidden_detached');
  const operatorTerminalAgents = selectedAgents.filter((agent) => agent.runtime_start_execution_mode !== 'hidden_detached');
  const projectionBearingAgents = selectedAgents.filter((agent) => Array.isArray(agent.operator_projection_open_requests) && agent.operator_projection_open_requests.length > 0);
  const canUseHiddenRuntimeStart = selectedAgents.length > 0 && operatorTerminalAgents.length === 0 && projectionBearingAgents.length === 0;
  if (!canUseHiddenRuntimeStart && wtArgs.length === 0) {
    throw new Error('narada_workspace_plan_empty_wt_args');
  }

  if (options.dryRun) {
    const dryRunResult = {
      ...result,
      mode: 'dry_run',
      mutation_performed: false,
      windows_terminal_invoked: false,
      launcher_execution_owner: 'narada-cli',
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(dryRunResult, `planned ${result.count ?? 0} workspace launch(es)`, options.format ?? 'auto'),
    };
  }

  if (canUseHiddenRuntimeStart) {
    const hiddenLaunches = [];
    for (const agent of hiddenRuntimeAgents) {
      const runtimeStartCommand = launcher.stringArray(agent.hidden_runtime_start_command ?? agent.runtime_start_command);
      const runtimeStartCwd = launcher.workspaceLaunchString(agent.runtime_start_cwd) ?? process.cwd();
      if (runtimeStartCommand.length === 0) throw new Error('narada_workspace_plan_empty_runtime_start_command');
      hiddenLaunches.push(await launcher.workspaceLaunchStartHiddenRuntimeHost(runtimeStartCommand, runtimeStartCwd));
    }
    const launchResult = finalizeWorkspaceLaunchResult({
      ...result,
      windows_terminal_invoked: false,
      hidden_runtime_invoked: true,
      launcher_execution_owner: 'narada-cli',
      hidden_runtime_launches: hiddenLaunches,
    });
    await launcher.writeWorkspacePlanResult(options.resultPath, launchResult);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(launchResult, `launched ${result.count ?? 0} hidden runtime start(s)`, options.format ?? 'auto'),
    };
  }

  const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
  const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
  const launch = terminalCaptureLog
    ? (await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs))
    : startOperatorTerminal('wt', effectiveWtArgs).result;
  if (launch.error) throw launch.error;
  if (launch.status !== 0) {
    throw new Error(`windows_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
  }

  const launchResult = finalizeWorkspaceLaunchResult({
    ...result,
    windows_terminal_invoked: true,
    hidden_runtime_invoked: false,
    launcher_execution_owner: 'narada-cli',
    wt_exit_code: launch.status ?? 0,
  });
  await launcher.writeWorkspacePlanResult(options.resultPath, launchResult);
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(launchResult, `launched ${result.count ?? 0} workspace launch(es)`, options.format ?? 'auto'),
  };
}

export async function runPersistentWorkspaceLaunchSelectionUiCommand(
  options: launcher.WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const normalizedOptions = launcher.normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = launcher.resolveRegistryPaths(normalizedOptions);
  const loaded = await launcher.readWorkspaceLaunchRecords(normalizedOptions);
  launcher.requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const session = await runPersistentWorkspaceLaunchSelectionUiController(loaded.records, normalizedOptions, async (selection) => {
    const selectionOptions = workspaceLaunchOptionsFromBrowserSelection(normalizedOptions, selection);
    return workspaceLaunchCommand({
      ...selectionOptions,
      interactiveSelection: false,
      interactiveSelectionUi: false,
    }, context);
  }, loaded.siteCatalog);

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

async function resolveInteractiveSelectionOptions(
  records: launcher.WorkspaceLaunchRecord[],
  options: launcher.WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
): Promise<launcher.WorkspaceLaunchPlanOptions> {
  if (options.interactiveSelectionUi) return resolveInteractiveSelectionUiOptions(records, options, siteCatalog);
  if (!options.interactiveSelection) return options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('interactive_selection_requires_tty: --interactive-selection requires an interactive terminal');
  }

  const siteChoices = launcher.unique(records.map((record) => record.site));
  const selectedSites = await prompts.multiselect({
    message: 'Select Site(s)',
    options: siteChoices.map((site) => ({ value: site, label: site })),
    initialValues: options.site,
    required: true,
  });
  if (prompts.isCancel(selectedSites)) throw new Error('interactive_selection_cancelled');

  const selectedSiteValues = selectedSites as string[];
  const roleChoices = launcher.roleChoicesForSelectedSites(records, selectedSiteValues);
  const initialRoleValues = launcher.initialRoleValuesForInteractiveSelection(roleChoices, options.role);
  const selectedRoles = await prompts.multiselect({
    message: 'Select Role(s)',
    options: roleChoices.map((role) => ({ value: role, label: role })),
    initialValues: initialRoleValues.length > 0 ? initialRoleValues : undefined,
    required: true,
  });
  if (prompts.isCancel(selectedRoles)) throw new Error('interactive_selection_cancelled');

  const selectedRoleValues = selectedRoles as string[];
  const selectorModel = launcher.workspaceLaunchSelectorModel(records, {
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: options.operatorSurface ? launcher.normalizeCarrierList(options.operatorSurface) : undefined,
    runtime: options.runtime ?? 'registry default',
    intelligenceProvider: options.intelligenceProvider ?? 'registry default',
  }, siteCatalog);
  const selectedCarriers = await prompts.multiselect({
    message: 'Select Operator Surface(s)',
    options: selectorModel.operatorSurfaceOptions,
    initialValues: selectorModel.selected.operatorSurface,
    required: true,
  });
  if (prompts.isCancel(selectedCarriers)) throw new Error('interactive_selection_cancelled');

  const selectedRuntime = await prompts.select({
    message: 'Select Runtime',
    options: selectorModel.runtimeOptions,
    initialValue: selectorModel.selected.runtime,
  });
  if (prompts.isCancel(selectedRuntime)) throw new Error('interactive_selection_cancelled');

  const selectedCarrierValues = launcher.normalizeInteractiveOperatorSurfaceValues(selectedCarriers as string[]);
  const providerSelectorModel = launcher.workspaceLaunchSelectorModel(records, {
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: selectedCarrierValues,
    runtime: selectedRuntime as string,
    intelligenceProvider: options.intelligenceProvider ?? 'registry default',
  }, siteCatalog);
  let selectedProvider: string | undefined;
  if (providerSelectorModel.intelligenceProviderOptions.length > 1) {
    const selectedProviderValue = await prompts.select({
      message: 'Select Intelligence Provider',
      options: providerSelectorModel.intelligenceProviderOptions,
      initialValue: providerSelectorModel.selected.intelligenceProvider,
    });
    if (prompts.isCancel(selectedProviderValue)) throw new Error('interactive_selection_cancelled');
    selectedProvider = selectedProviderValue as string;
  }

  return {
    ...options,
    all: false,
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: selectedCarrierValues.includes('registry default') ? undefined : selectedCarrierValues.join(','),
    runtime: selectedRuntime === 'registry default' ? undefined : selectedRuntime,
    intelligenceProvider: selectedProvider === 'registry default' ? undefined : selectedProvider,
  };
}

async function resolveInteractiveSelectionUiOptions(
  records: launcher.WorkspaceLaunchRecord[],
  options: launcher.WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
): Promise<launcher.WorkspaceLaunchPlanOptions> {
  const selection = await runWorkspaceLaunchSelectionUiController(records, options, siteCatalog);
  return workspaceLaunchOptionsFromBrowserSelection(options, selection);
}

function workspaceLaunchOptionsFromBrowserSelection(
  options: launcher.WorkspaceLaunchPlanOptions,
  selection: WorkspaceLaunchBrowserSelection,
): launcher.WorkspaceLaunchPlanOptions {
  return {
    ...options,
    all: false,
    site: selection.site,
    role: selection.role,
    operatorSurface: selection.operatorSurface.includes('registry default') ? undefined : selection.operatorSurface.join(','),
    runtime: selection.runtime === 'registry default' ? undefined : selection.runtime,
    intelligenceProvider: selection.intelligenceProvider === 'registry default' ? undefined : selection.intelligenceProvider,
  };
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}

function finalizeWorkspaceLaunchResult(result: Record<string, unknown>): Record<string, unknown> {
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(launcher.isRecord) : [];
  const wtArgs = launcher.stringArray(result.wt_args);
  const { wt_args: _wtArgs, wt_args_authority: _wtArgsAuthority, ...resultWithoutTopLevelTerminalPlan } = result;
  const launchResult = {
    ...resultWithoutTopLevelTerminalPlan,
    schema: 'narada.workspace_launch.launch_result.v1',
    status: 'launched',
    mode: 'launch',
    mutation_performed: true,
    launch_agents: selectedAgents,
    selected_agents_authority: 'compatibility_plan_selection',
    ...(wtArgs.length > 0
      ? {
          legacy_terminal_plan: {
            schema: 'narada.workspace_launch.legacy_terminal_plan.v1',
            authority: 'compatibility_non_authoritative',
            wt_args: wtArgs,
          },
        }
      : {}),
  };
  assertWorkspaceLaunchResultInvariants(launchResult);
  return launchResult;
}

function assertWorkspaceLaunchResultInvariants(result: Record<string, unknown>): void {
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
  const legacyTerminalPlan = launcher.isRecord(result.legacy_terminal_plan) ? result.legacy_terminal_plan : null;
  if (legacyTerminalPlan && legacyTerminalPlan.authority !== 'compatibility_non_authoritative') {
    throw new Error('workspace_launch_result_legacy_terminal_plan_authority_invalid');
  }
  if (!Array.isArray(result.launch_agents)) {
    throw new Error('workspace_launch_result_launch_agents_required');
  }
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(launcher.isRecord) : [];
  if (hiddenRuntimeInvoked && selectedAgents.some((agent) => agent.runtime_start_execution_mode !== 'hidden_detached')) {
    throw new Error('workspace_launch_result_hidden_runtime_requires_hidden_agent_modes');
  }
}
