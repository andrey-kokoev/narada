import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { startOperatorTerminal } from '@narada2/process-launch-posture';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as prompts from '@clack/prompts';
import { commandResultError, type CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { carrierStartCommand } from './carrier.js';
import {
  defaultRuntimeForCarrier,
  resolveCarrierRuntimeSelection,
} from '@narada2/carrier-runtime-contract/carrier-runtime-selection';

const requireFromLauncherCommand = createRequire(import.meta.url);
const providerRegistry = loadProviderRegistry();
const providerAdapters = loadProviderAdapters();

interface ProviderRegistry {
  default_provider?: string;
  providers?: Record<string, {
    meaning?: string;
    support_state?: string;
  }>;
}

function loadProviderAdapters(): ProviderAdapters {
  let adaptersPath: string;
  try {
    adaptersPath = resolveProviderAdaptersPath();
  } catch (error) {
    if (process.env.VITEST) return { admitted_providers: Object.keys(fallbackProviderRegistryForTests().providers ?? {}) };
    throw error;
  }
  try {
    return JSON.parse(readFileSync(adaptersPath, 'utf8')) as ProviderAdapters;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`provider_adapters_load_failed: ${adaptersPath}: ${message}`);
  }
}

function resolveProviderAdaptersPath(): string {
  const candidates: string[] = [];
  try {
    candidates.push(requireFromLauncherCommand.resolve('@narada2/carrier-provider-contract/provider-adapters'));
  } catch {
    // Workspace source checkouts can run before pnpm has materialized this dependency link.
  }
  candidates.push(
    fileURLToPath(new URL('../../../../carrier-provider-contract/contracts/provider-adapters.json', import.meta.url)),
    resolve(process.cwd(), '..', '..', 'carrier-provider-contract', 'contracts', 'provider-adapters.json'),
    resolve(process.cwd(), 'packages', 'carrier-provider-contract', 'contracts', 'provider-adapters.json'),
  );
  const adaptersPath = candidates.find((candidate) => existsSync(candidate));
  if (adaptersPath) return adaptersPath;
  throw new Error(`provider_adapters_not_found: ${candidates.join(', ')}`);
}

interface ProviderAdapters {
  admitted_providers?: string[];
}

function fallbackProviderRegistryForTests(): ProviderRegistry {
  return {
    default_provider: 'kimi-code-api',
    providers: {
      'anthropic-api': { meaning: 'Anthropic API via the Anthropic Messages API.', support_state: 'verified_supported' },
      'codex-subscription': { meaning: 'Local Codex CLI subscription auth via codex mcp-server; no OpenAI API key or API billing path.', support_state: 'verified_supported' },
      'deepseek-api': { meaning: 'DeepSeek API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'kimi-api': { meaning: 'Kimi/Moonshot API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'kimi-code-api': { meaning: 'Kimi Code API via OpenAI-compatible chat completions; uses KIMI_CODE_API_KEY against api.kimi.com/coding/v1.', support_state: 'verified_supported' },
      'openai-api': { meaning: 'OpenAI API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
    },
  };
}

function resolveProviderRegistryPath(): string {
  const candidates: string[] = [];
  try {
    candidates.push(requireFromLauncherCommand.resolve('@narada2/carrier-provider-contract/provider-registry'));
  } catch {
    // Workspace source checkouts can run before pnpm has materialized this dependency link.
  }
  candidates.push(
    fileURLToPath(new URL('../../../../carrier-provider-contract/contracts/provider-registry.json', import.meta.url)),
    resolve(process.cwd(), '..', '..', 'carrier-provider-contract', 'contracts', 'provider-registry.json'),
    resolve(process.cwd(), 'packages', 'carrier-provider-contract', 'contracts', 'provider-registry.json'),
  );
  const registryPath = candidates.find((candidate) => existsSync(candidate));
  if (registryPath) return registryPath;
  throw new Error(`provider_registry_not_found: ${candidates.join(', ')}`);
}

function loadProviderRegistry(): ProviderRegistry {
  let registryPath: string;
  try {
    registryPath = resolveProviderRegistryPath();
  } catch (error) {
    if (process.env.VITEST) return fallbackProviderRegistryForTests();
    throw error;
  }
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8')) as ProviderRegistry;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`provider_registry_load_failed: ${registryPath}: ${message}`);
  }
}

export interface WorkspaceLaunchPlanOptions {
  agent?: string[];
  all?: boolean;
  role?: string[];
  site?: string[];
  configPath?: string[];
  registryPath?: string;
  carrier?: string;
  operatorSurface?: string;
  runtime?: string;
  intelligenceProvider?: string;
  interactiveSelection?: boolean;
  defaultInteractiveSelection?: boolean;
  resultPath?: string;
  suppressResultOutput?: boolean;
  enableNativeShell?: boolean;
  noWaitForEnterBeforeExec?: boolean;
  smoke?: boolean;
  dryRun?: boolean;
  format?: CliFormat;
}

function resolveWorkspaceCarrierRuntimeSelection(carrier: string | undefined, operatorSurface: string | undefined, runtime: string): { carrier_kind: string; operator_surface_kind: string; runtime_substrate_kind: string; runtime_host_kind: string } {
  const selection = resolveCarrierRuntimeSelection({
    carrierValue: carrier,
    operatorSurfaceValue: operatorSurface,
    runtimeValue: runtime,
    admittedRuntimeSubstrateKinds: ['kimi', 'codex', 'narada-agent-runtime-server', 'pi', 'claude-code', 'opencode'],
    runtimeContractSchema: 'narada.runtime_substrate_kind.v1',
  });
  if (selection.status === 'refused') {
    throw commandResultError({
      status: 'error',
      command: 'launcher workspace-plan',
      error: selection.reason,
      _formatted: `[FAIL] ${selection.reason_code}: ${selection.reason}`,
      reason_code: selection.reason_code,
      reason: selection.reason,
      candidate_carrier_kind: selection.candidate_carrier_kind,
      candidate_operator_surface_kind: selection.candidate_operator_surface_kind,
      candidate_runtime_substrate_kind: selection.candidate_runtime_substrate_kind,
      retryable: false,
    }, selection.reason_code);
  }
  return selection;
}

async function resolveExplainSiteRoot(options: ExplainMcpOptions): Promise<Record<string, unknown> & { site_root: string }> {
  if (options.siteRoot) {
    return {
      source: 'explicit_site_root',
      site_root: resolve(options.siteRoot),
      registry_path: null,
      agent: null,
      site: options.site ?? null,
    };
  }
  if (!options.site) throw new Error('site_or_site_root_required: pass --site-root or --site');
  const registryPaths = resolveRegistryPaths({ configPath: options.configPath, registryPath: options.registryPath });
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  const selected = selectLaunchRecords(records, { site: [options.site], all: true });
  const roots = [...new Set(selected.map((record) => resolve(record.site_root).toLowerCase()))];
  if (roots.length === 0) throw new Error(`site_not_found_in_launch_registry: ${options.site}`);
  if (roots.length > 1) throw new Error(`site_root_ambiguous_for_site: ${options.site}`);
  const first = selected[0];
  return {
    source: 'launch_registry_site_filter',
    site_root: resolve(first.site_root),
    registry_paths: registryPaths,
    selected_agent_count: selected.length,
    sample_agent: first.agent,
    site: first.site,
  };
}

async function writeWorkspacePlanResult(path: string | undefined, result: unknown): Promise<void> {
  if (!path) return;
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function readRuntimeMcpFabric(siteRoot: string, serverFilter: string | null): Record<string, unknown> {
  const candidates = [join(siteRoot, '.ai', 'mcp'), join(siteRoot, '.narada', '.ai', 'mcp')];
  const mcpDir = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  const fileNames = existsSync(mcpDir)
    ? readdirSync(mcpDir).filter((name) => name.endsWith('.json')).sort((a, b) => a.localeCompare(b))
    : [];
  const servers: Record<string, unknown> = {};
  const files = [];
  for (const fileName of fileNames) {
    const path = join(mcpDir, fileName);
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const entries = asServerMap(data.mcpServers);
    const serverNames = Object.keys(entries).sort((a, b) => a.localeCompare(b));
    files.push({ path, server_names: serverNames });
    for (const serverName of serverNames) {
      if (serverFilter && serverName !== serverFilter) continue;
      servers[serverName] = summarizeMcpServer(entries[serverName]);
    }
  }
  return {
    schema: 'narada.launcher.runtime_mcp_fabric_summary.v1',
    authority: 'runtime_authoritative',
    site_root: siteRoot,
    mcp_dir: mcpDir,
    files,
    server_count: Object.keys(servers).length,
    servers,
  };
}

function readProjectionRegistration(siteRoot: string, serverFilter: string | null): Record<string, unknown> {
  const path = join(siteRoot, '.narada', 'capabilities', 'mcp-registration.json');
  if (!existsSync(path)) {
    return {
      schema: 'narada.launcher.mcp_projection_summary.v1',
      authority: 'projection_not_runtime_authority',
      path,
      status: 'missing',
      servers: {},
    };
  }
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const entries = Array.isArray(data.mcp_servers) ? data.mcp_servers : [];
  const servers: Record<string, unknown> = {};
  for (const entry of entries) {
    const record = isRecord(entry) ? entry : {};
    const name = typeof record.name === 'string' ? record.name : null;
    if (!name || (serverFilter && name !== serverFilter)) continue;
    servers[name] = summarizeMcpServer(record);
  }
  return {
    schema: 'narada.launcher.mcp_projection_summary.v1',
    authority: 'projection_not_runtime_authority',
    path,
    status: 'loaded',
    runtime_authoritative: false,
    authoritative_runtime_fabric: join(siteRoot, '.ai', 'mcp', '*.json'),
    server_count: Object.keys(servers).length,
    servers,
  };
}

function summarizeMcpServer(server: unknown): Record<string, unknown> {
  const record = isRecord(server) ? server : {};
  const args = Array.isArray(record.args) ? record.args.map((value) => String(value)) : [];
  return {
    command: typeof record.command === 'string' ? record.command : null,
    args,
    allowed_roots: repeatedOptionValues(args, '--allowed-root'),
    output_root: optionValue(args, '--output-root'),
    audit_log_dir: optionValue(args, '--audit-log-dir'),
    target_site_root: typeof record.target_site_root === 'string' ? record.target_site_root : null,
    authority_posture: typeof record.authority_posture === 'string' ? record.authority_posture : null,
  };
}

function compareProjectionToRuntimeFabric(runtimeServers: unknown, projectionServers: unknown): Record<string, unknown> {
  const runtime = asServerMap(runtimeServers);
  const projection = asServerMap(projectionServers);
  const allNames = [...new Set([...Object.keys(runtime), ...Object.keys(projection)])].sort((a, b) => a.localeCompare(b));
  const serverComparisons = [];
  let securitySensitiveMismatchCount = 0;
  for (const serverName of allNames) {
    const runtimeServer = isRecord(runtime[serverName]) ? runtime[serverName] : null;
    const projectionServer = isRecord(projection[serverName]) ? projection[serverName] : null;
    const runtimeAllowedRoots = stringArray(runtimeServer?.allowed_roots);
    const projectionAllowedRoots = stringArray(projectionServer?.allowed_roots);
    const allowedRootsMatch = sameStringSet(runtimeAllowedRoots, projectionAllowedRoots);
    const argsMatch = sameStringArray(stringArray(runtimeServer?.args), stringArray(projectionServer?.args));
    if (runtimeServer && projectionServer && !allowedRootsMatch) securitySensitiveMismatchCount += 1;
    serverComparisons.push({
      server_name: serverName,
      runtime_present: !!runtimeServer,
      projection_present: !!projectionServer,
      runtime_allowed_roots: runtimeAllowedRoots,
      projection_allowed_roots: projectionAllowedRoots,
      allowed_roots_match: runtimeServer && projectionServer ? allowedRootsMatch : null,
      args_match: runtimeServer && projectionServer ? argsMatch : null,
      security_sensitive_drift: runtimeServer && projectionServer ? !allowedRootsMatch : false,
    });
  }
  return {
    schema: 'narada.launcher.mcp_authority_comparison.v1',
    security_sensitive_fields: ['--allowed-root'],
    security_sensitive_mismatch_count: securitySensitiveMismatchCount,
    server_comparisons: serverComparisons,
  };
}

function renderExplainMcpHuman(result: Record<string, unknown>): string {
  const boundary = isRecord(result.authority_boundary) ? result.authority_boundary : {};
  const runtime = isRecord(result.runtime_fabric) ? result.runtime_fabric : {};
  const comparison = isRecord(result.comparison) ? result.comparison : {};
  const lines = [
    `MCP authority: ${result.status}`,
    `Runtime fabric: ${boundary.runtime_authoritative_fabric ?? '-'}`,
    `Projection: ${boundary.projection_registration ?? '-'} (not runtime authority)`,
    `Servers: ${runtime.server_count ?? 0}`,
    `Security-sensitive projection mismatches: ${comparison.security_sensitive_mismatch_count ?? 0}`,
  ];
  const servers = asServerMap(runtime.servers);
  for (const [name, server] of Object.entries(servers)) {
    const record = isRecord(server) ? server : {};
    const roots = stringArray(record.allowed_roots);
    lines.push(`- ${name}`);
    lines.push(`  allowed_roots: ${roots.length ? roots.join(', ') : '-'}`);
  }
  return lines.join('\n');
}

function repeatedOptionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function asServerMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringSet(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) => values.map((value) => resolve(value).toLowerCase()).sort();
  return sameStringArray(normalize(left), normalize(right));
}

export async function explainMcpCommand(
  options: ExplainMcpOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteResolution = await resolveExplainSiteRoot(options);
  const siteRoot = siteResolution.site_root;
  const fabric = readRuntimeMcpFabric(siteRoot, options.server ?? null);
  const projection = readProjectionRegistration(siteRoot, options.server ?? null);
  const comparison = compareProjectionToRuntimeFabric(fabric.servers, projection.servers);
  const fabricFiles = Array.isArray(fabric.files) ? fabric.files.filter(isRecord) : [];
  const result = {
    schema: 'narada.launcher.mcp_authority_explanation.v1',
    status: comparison.security_sensitive_mismatch_count === 0 ? 'coherent' : 'projection_drift',
    mutation_performed: false,
    site: siteResolution,
    authority_boundary: {
      runtime_authoritative_fabric: fabric.mcp_dir,
      runtime_authoritative_files: fabricFiles.map((file) => file.path),
      projection_registration: projection.path,
      projection_runtime_authoritative: false,
      rule: 'For launcher/NARS runtime behavior, .ai/mcp/*.json is authoritative. .narada/capabilities/mcp-registration.json is a registry/projection and must not be used as runtime evidence unless the launch artifact names it.',
    },
    runtime_fabric: fabric,
    projection_registration: projection,
    comparison,
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, renderExplainMcpHuman(result), options.format ?? 'auto'),
  };
}

export interface ExplainMcpOptions {
  siteRoot?: string;
  site?: string;
  registryPath?: string;
  configPath?: string[];
  server?: string;
  format?: CliFormat;
}

interface RawLaunchRegistry {
  NaradaRoot?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  OperatorSurface?: string;
  Carrier?: string;
  Runtime?: string;
  Agents?: RawAgentRecord[] | RawAgentRecord;
}

interface RawAgentRecord {
  Agent?: string;
  Title?: string;
  Role?: string;
  Site?: string;
  NaradaRoot?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  OperatorSurface?: string;
  Carrier?: string;
  Runtime?: string;
  EnableNativeShell?: boolean;
}

export interface WorkspaceLaunchRecord {
  agent: string;
  title: string;
  role: string;
  site: string;
  narada_root: string;
  site_root: string;
  workspace_root: string | null;
  launcher_path: string;
  operator_surface: string;
  carrier: string;
  runtime: string;
  enable_native_shell: boolean;
  config_path: string;
}

export interface WorkspaceLaunchAgentPlan extends WorkspaceLaunchRecord {
  operator_surface_kind: string;
  runtime_host_kind: string;
  launch_carrier: string;
  launch_runtime: string;
  launch_carriers: string[];
  intelligence_provider: string | null;
  wait_for_enter_before_exec: boolean;
  wt_args: string[];
  smoke_command: string[];
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(normalizedOptions);
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  const resolvedOptions = await resolveInteractiveSelectionOptions(records, normalizedOptions);
  const selected = selectLaunchRecords(records, resolvedOptions);
  const plans = selected.map((record) => buildAgentPlan(record, resolvedOptions));
  const wtArgs = plans.flatMap((plan, index) => [
    ...(index === 0 ? [] : [';']),
    ...plan.wt_args,
  ]);
  if (resolvedOptions.smoke) {
    const agents = [];
    for (const plan of plans) {
      const smoke = await carrierStartCommand({
        siteRoot: plan.site_root,
        workspaceRoot: plan.workspace_root ?? undefined,
        agent: plan.agent,
        carrier: plan.launch_carrier,
        intelligenceProvider: plan.intelligence_provider ?? undefined,
        dryRun: true,
        enableNativeShell: plan.enable_native_shell,
        format: 'json',
      }, context);
      agents.push({
        agent: plan.agent,
        site: plan.site,
        carrier: plan.launch_carrier,
        runtime: plan.launch_runtime,
        status: smoke.exitCode === ExitCode.SUCCESS ? 'passed' : 'failed',
        plan,
        carrier_start: smoke.result,
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
        reason: 'Smoke mode calls carrier start dry-run only; live MCP startup remains an execution probe.',
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
    await writeWorkspacePlanResult(resolvedOptions.resultPath, smokeResult);
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
    interactive_selection: resolvedOptions.interactiveSelection === true,
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
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const plan = await workspaceLaunchPlanCommand(options, context);
  if (plan.exitCode !== ExitCode.SUCCESS || options.smoke) return plan;

  const result = plan.result as Record<string, unknown>;
  const wtArgs = stringArray(result.wt_args);
  if (wtArgs.length === 0) {
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

  const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
  const launch = startOperatorTerminal('wt', effectiveWtArgs).result;
  if (launch.error) throw launch.error;
  if (launch.status !== 0) {
    throw new Error(`windows_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
  }

  const launchResult = {
    ...result,
    mode: 'launch',
    mutation_performed: true,
    windows_terminal_invoked: true,
    launcher_execution_owner: 'narada-cli',
    wt_exit_code: launch.status ?? 0,
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(launchResult, `launched ${result.count ?? 0} workspace launch(es)`, options.format ?? 'auto'),
  };
}

async function resolveInteractiveSelectionOptions(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
): Promise<WorkspaceLaunchPlanOptions> {
  if (!options.interactiveSelection) return options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('interactive_selection_requires_tty: --interactive-selection requires an interactive terminal');
  }

  const siteChoices = unique(records.map((record) => record.site));
  const carrierChoices = unique([
    'registry default',
    ...records.map((record) => record.carrier),
    'agent-cli',
    'agent-web-ui',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);
  const runtimeChoices = unique([
    'registry default',
    ...records.map((record) => record.runtime),
    'narada-agent-runtime-server',
    'nars',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);

  const selectedSites = await prompts.multiselect({
    message: 'Select Site(s)',
    options: siteChoices.map((site) => ({ value: site, label: site })),
    initialValues: options.site,
    required: true,
  });
  if (prompts.isCancel(selectedSites)) throw new Error('interactive_selection_cancelled');

  const selectedSiteValues = selectedSites as string[];
  const roleChoices = roleChoicesForSelectedSites(records, selectedSiteValues);
  const initialRoleValues = initialRoleValuesForInteractiveSelection(roleChoices, options.role);

  const selectedRoles = await prompts.multiselect({
    message: 'Select Role(s)',
    options: roleChoices.map((role) => ({ value: role, label: role })),
    initialValues: initialRoleValues.length > 0 ? initialRoleValues : undefined,
    required: true,
  });
  if (prompts.isCancel(selectedRoles)) throw new Error('interactive_selection_cancelled');

  const selectedCarriers = await prompts.multiselect({
    message: 'Select Operator Surface(s)',
    options: carrierChoices.map((carrier) => ({
      value: carrier,
      label: carrier,
      hint: carrier === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    initialValues: initialOperatorSurfaceValues(carrierChoices, options.operatorSurface ?? options.carrier),
    required: true,
  });
  if (prompts.isCancel(selectedCarriers)) throw new Error('interactive_selection_cancelled');

  const selectedRuntime = await prompts.select({
    message: 'Select Runtime',
    options: runtimeChoices.map((runtime) => ({
      value: runtime,
      label: runtime,
      hint: runtime === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    initialValue: options.runtime ?? 'registry default',
  });
  if (prompts.isCancel(selectedRuntime)) throw new Error('interactive_selection_cancelled');

  const selectedRoleValues = selectedRoles as string[];
  const selectedCarrierValues = normalizeInteractiveOperatorSurfaceValues(selectedCarriers as string[]);
  const providerOperatorSurface = selectedCarrierValues.includes('agent-cli') ? 'agent-cli' : (selectedCarrierValues[0] ?? 'registry default');
  const selectedRecords = selectLaunchRecords(records, {
    ...options,
    all: true,
    site: selectedSiteValues,
    role: selectedRoleValues,
  });
  const selectedProvider = await selectInteractiveIntelligenceProvider({
    records: selectedRecords,
    carrier: undefined,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime as string,
    current: options.intelligenceProvider,
  });

  return {
    ...options,
    all: false,
    site: selectedSiteValues,
    role: selectedRoleValues,
    carrier: selectedCarrierValues.includes('registry default') ? undefined : selectedCarrierValues.join(','),
    operatorSurface: undefined,
    runtime: selectedRuntime === 'registry default' ? undefined : selectedRuntime,
    intelligenceProvider: selectedProvider === 'registry default' ? undefined : selectedProvider,
  };
}

export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  if (!current) return ['registry default'];
  const explicit = normalizeCarrierList(current).filter((value) => choices.some((choice) => choice.toLowerCase() === value.toLowerCase()));
  return explicit.length > 0 ? explicit : ['registry default'];
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  const normalized = unique(values);
  if (normalized.includes('registry default')) return ['registry default'];
  return normalized;
}

async function selectInteractiveIntelligenceProvider({
  records,
  carrier,
  operatorSurface,
  runtime,
  current,
}: {
  records: WorkspaceLaunchRecord[];
  carrier?: string;
  operatorSurface: string;
  runtime: string;
  current?: string;
}): Promise<string | undefined> {
  const choices = intelligenceProviderChoicesForLaunchSelection({ records, carrier, operatorSurface, runtime });
  if (choices.length <= 1) return undefined;
  const selectedProvider = await prompts.select({
    message: 'Select Intelligence Provider',
    options: choices.map((choice) => ({
      value: choice.value,
      label: choice.label,
      hint: choice.hint,
    })),
    initialValue: current ?? 'registry default',
  });
  if (prompts.isCancel(selectedProvider)) throw new Error('interactive_selection_cancelled');
  return selectedProvider as string;
}

export function intelligenceProviderChoicesForLaunchSelection({
  records,
  carrier,
  operatorSurface,
  runtime,
}: {
  records: WorkspaceLaunchRecord[];
  carrier?: string;
  operatorSurface: string;
  runtime: string;
}): Array<{ value: string; label: string; hint?: string }> {
  const narsSurfaceRecords = records.filter((record) => {
    const selection = resolveWorkspaceCarrierRuntimeSelection(
      carrier ?? record.carrier,
      operatorSurface === 'registry default' ? undefined : operatorSurface,
      runtime === 'registry default' ? record.runtime : runtime,
    );
    return selection.carrier_kind === 'agent-cli' || selection.carrier_kind === 'agent-web-ui';
  });
  if (narsSurfaceRecords.length === 0) {
    return [{ value: 'registry default', label: 'registry default', hint: 'no NARS operator-surface launches selected' }];
  }
  return intelligenceProviderChoices({ admittedProviders: providerAdapters.admitted_providers });
}

export function intelligenceProviderChoices({ admittedProviders }: { admittedProviders?: string[] } = {}): Array<{ value: string; label: string; hint?: string }> {
  const admitted = admittedProviders ? new Set(admittedProviders) : null;
  const entries = Object.entries(providerRegistry.providers ?? {})
    .filter(([, provider]) => provider.support_state === 'verified_supported')
    .filter(([provider]) => !admitted || admitted.has(provider))
    .map(([provider, metadata]) => ({
      value: provider,
      label: provider,
      hint: metadata.meaning,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    {
      value: 'registry default',
      label: 'registry default',
      hint: providerRegistry.default_provider ? `use default provider ${providerRegistry.default_provider}` : 'use launcher/provider defaults',
    },
    ...entries,
  ];
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return unique(records
    .filter((record) => recordMatchesSiteSelectors(record, siteSelectors))
    .map((record) => record.role));
}

export function initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[] {
  const explicitRoleValues = (explicitRoles ?? []).filter((role) => roleChoices.some((choice) => choice.toLowerCase() === role.toLowerCase()));
  if (explicitRoleValues.length > 0) return explicitRoleValues;
  const residentChoice = roleChoices.find((role) => role.toLowerCase() === 'resident');
  return residentChoice ? [residentChoice] : [];
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function resolveRegistryPaths(options: WorkspaceLaunchPlanOptions): string[] {
  const configPaths = nonEmptyStringArray(options.configPath);
  const paths = configPaths.length > 0
    ? configPaths
    : [options.registryPath ?? join(process.cwd(), 'config', 'launch', 'agents.psd1')];
  return paths.map((path) => resolve(path));
}

export function hasWorkspaceLaunchSelectionIntent(options: WorkspaceLaunchPlanOptions): boolean {
  return options.all === true
    || nonEmptyStringArray(options.agent).length > 0
    || nonEmptyStringArray(options.role).length > 0
    || nonEmptyStringArray(options.site).length > 0
    || nonEmptyStringArray(options.configPath).length > 0;
}

function normalizeWorkspaceLaunchPlanOptions(options: WorkspaceLaunchPlanOptions): WorkspaceLaunchPlanOptions {
  const normalized: WorkspaceLaunchPlanOptions = {
    ...options,
    agent: nonEmptyStringArray(options.agent),
    role: nonEmptyStringArray(options.role),
    site: nonEmptyStringArray(options.site),
    configPath: nonEmptyStringArray(options.configPath),
  };
  if (normalized.defaultInteractiveSelection === true && !hasWorkspaceLaunchSelectionIntent(normalized)) {
    return { ...normalized, interactiveSelection: true };
  }
  return normalized;
}

async function readLaunchRegistry(path: string): Promise<WorkspaceLaunchRecord[]> {
  if (!existsSync(path)) throw new Error(`launch_registry_missing: ${path}`);
  const raw = path.toLowerCase().endsWith('.json')
    ? JSON.parse(await readFile(path, 'utf8')) as RawLaunchRegistry
    : readPowerShellDataFile(path);
  const agents = Array.isArray(raw.Agents) ? raw.Agents : raw.Agents ? [raw.Agents] : [];
  return agents.map((agent) => normalizeAgentRecord(raw, agent, path));
}

function readPowerShellDataFile(path: string): RawLaunchRegistry {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$path = $env:NARADA_LAUNCH_REGISTRY_PATH',
    '$data = Import-PowerShellDataFile -Path $path',
    '$data | ConvertTo-Json -Depth 20 -Compress',
  ].join('; ');
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      NARADA_LAUNCH_REGISTRY_PATH: path,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`launch_registry_read_failed: ${path}: ${detail}`);
  }
  return JSON.parse(String(result.stdout || '{}')) as RawLaunchRegistry;
}

function normalizeAgentRecord(registry: RawLaunchRegistry, agent: RawAgentRecord, configPath: string): WorkspaceLaunchRecord {
  const agentId = nonEmpty(agent.Agent);
  if (!agentId) throw new Error(`agent_id_missing_in_launch_registry: ${configPath}`);
  const naradaRoot = nonEmpty(agent.NaradaRoot) ?? nonEmpty(registry.NaradaRoot);
  if (!naradaRoot) throw new Error(`agent_narada_root_missing: ${agentId} in ${configPath}`);
  const siteRoot = nonEmpty(agent.SiteRoot) ?? nonEmpty(registry.SiteRoot) ?? naradaRoot;
  const workspaceRoot = nonEmpty(agent.WorkspaceRoot) ?? nonEmpty(registry.WorkspaceRoot) ?? null;
  const launcher = nonEmpty(agent.Launcher) ?? nonEmpty(registry.Launcher);
  const launcherPath = nonEmpty(agent.LauncherPath) ?? nonEmpty(registry.LauncherPath)
    ?? (launcher ? join(naradaRoot, launcher) : join(naradaRoot, 'narada-andrey.ps1'));
  const operatorSurface = nonEmpty(agent.OperatorSurface) ?? nonEmpty(registry.OperatorSurface) ?? nonEmpty(agent.Carrier) ?? nonEmpty(registry.Carrier) ?? 'codex';
  const carrier = operatorSurface;
  const runtime = nonEmpty(agent.Runtime) ?? nonEmpty(registry.Runtime) ?? defaultRuntimeForCarrier(carrier);
  return {
    agent: agentId,
    title: nonEmpty(agent.Title) ?? agentId.split('.').at(-1) ?? agentId,
    role: nonEmpty(agent.Role) ?? (agentId.split('.').at(-1) ?? agentId).replace(/\d+$/, ''),
    site: nonEmpty(agent.Site) ?? agentId.split('.')[0] ?? agentId,
    narada_root: naradaRoot,
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    launcher_path: launcherPath,
    operator_surface: operatorSurface,
    carrier,
    runtime,
    enable_native_shell: agent.EnableNativeShell === true,
    config_path: configPath,
  };
}

function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions): WorkspaceLaunchRecord[] {
  let selected: WorkspaceLaunchRecord[];
  const agentSelectors = nonEmptyStringArray(options.agent);
  const roleSelectors = nonEmptyStringArray(options.role);
  const siteSelectors = nonEmptyStringArray(options.site);
  const configPathSelectors = nonEmptyStringArray(options.configPath);
  const hasRoleSelector = roleSelectors.length > 0;
  const hasSiteSelector = siteSelectors.length > 0;
  const hasConfigPathSelector = configPathSelectors.length > 0;
  if (agentSelectors.length > 0) {
    selected = [];
    for (const agent of agentSelectors) {
      const matches = records.filter((record) => record.agent === agent);
      if (matches.length === 0) throw new Error(`agent_not_found_in_launch_registry: ${agent}`);
      if (matches.length > 1) throw new Error(`agent_duplicate_in_launch_registry: ${agent}`);
      selected.push(matches[0]);
    }
  } else if (options.all || hasConfigPathSelector || hasRoleSelector || hasSiteSelector) {
    selected = records;
  } else {
    throw new Error('launch_selection_required: specify --agent, --all, --site, --role, or --config-path');
  }

  if (hasRoleSelector) {
    const roles = new Set(roleSelectors.map((role) => role.toLowerCase()));
    selected = selected.filter((record) => roles.has(record.role.toLowerCase()));
    if (selected.length === 0) throw new Error(`no_agents_match_role_filter: ${roleSelectors.join(', ')}`);
  }

  if (hasSiteSelector) {
    selected = selected.filter((record) => recordMatchesSiteSelectors(record, siteSelectors));
    if (selected.length === 0) throw new Error(`no_agents_match_site_filter: ${siteSelectors.join(', ')}`);
  }

  return selected;
}

function recordMatchesSiteSelectors(record: WorkspaceLaunchRecord, siteSelectors: string[]): boolean {
  const sites = new Set(siteSelectors.map((site) => site.toLowerCase()));
  const aliases = [
    record.site,
    record.site.replace(/^narada-/, ''),
    record.agent.split('.')[0],
  ].filter(Boolean).map((value) => value.toLowerCase());
  return aliases.some((alias) => sites.has(alias));
}

function buildAgentPlan(record: WorkspaceLaunchRecord, options: WorkspaceLaunchPlanOptions): WorkspaceLaunchAgentPlan {
  const operatorSurfaceInput = options.operatorSurface;
  const carrierInput = options.carrier ?? record.operator_surface ?? record.carrier;
  const launchCarriers = operatorSurfaceInput ? normalizeCarrierList(operatorSurfaceInput) : normalizeCarrierList(carrierInput);
  const primaryCarrierInput = launchCarriers.includes('agent-cli') ? 'agent-cli' : launchCarriers[0] ?? carrierInput;
  const runtimeInput = options.runtime ?? record.runtime;
  const carrierRuntimeSelection = resolveWorkspaceCarrierRuntimeSelection(primaryCarrierInput, operatorSurfaceInput, runtimeInput);
  const launchCarrier = carrierRuntimeSelection.carrier_kind;
  const operatorSurfaceKind = carrierRuntimeSelection.operator_surface_kind;
  const launchRuntime = carrierRuntimeSelection.runtime_substrate_kind;
  const runtimeHostKind = carrierRuntimeSelection.runtime_host_kind;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const waitForEnter = options.noWaitForEnterBeforeExec !== true && launchCarriers[0] !== 'agent-web-ui';
  const intelligenceProvider = launchCarrier === 'agent-cli' || launchCarrier === 'agent-web-ui' ? (options.intelligenceProvider ?? null) : null;
  const naradaProper = resolve(process.env.NARADA_PROPER_ROOT ?? 'D:/code/narada');
  const carrierStartCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    'carrier',
    'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--runtime', launchRuntime,
    '--exec',
  ];
  if (record.workspace_root) carrierStartCommand.push('--workspace-root', record.workspace_root);
  if (enableNativeShell) carrierStartCommand.push('--enable-native-shell');
  if (intelligenceProvider) carrierStartCommand.push('--intelligence-provider', intelligenceProvider);
  if (waitForEnter) carrierStartCommand.push('--wait');

  const base = [
    'new-tab',
    '--title', launchCarrier === 'agent-web-ui' ? `${record.title} Runtime` : record.title,
    '-d', record.workspace_root ?? record.narada_root,
    'pwsh',
    '-NoExit',
    '-Command',
    toPowerShellCommand(carrierStartCommand),
  ];
  const wtArgs = [...base];
  if (launchCarrier === 'agent-web-ui') {
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper));
  }
  for (const extraCarrier of launchCarriers.filter((carrier) => carrier !== launchCarrier)) {
    if (extraCarrier !== 'agent-web-ui') {
      throw new Error(`unsupported_multi_carrier_projection: ${extraCarrier}`);
    }
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper));
  }

  const smokeCommand = [
    'narada', 'carrier', 'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--runtime', launchRuntime,
    '--dry-run',
    '--format', 'json',
  ];
  if (record.workspace_root) smokeCommand.push('--workspace-root', record.workspace_root);
  if (intelligenceProvider) smokeCommand.push('--intelligence-provider', intelligenceProvider);
  if (enableNativeShell) smokeCommand.push('--enable-native-shell');

  return {
    ...record,
    operator_surface_kind: operatorSurfaceKind,
    runtime_host_kind: runtimeHostKind,
    launch_carrier: launchCarrier,
    launch_runtime: launchRuntime,
    launch_carriers: launchCarriers,
    intelligence_provider: intelligenceProvider,
    wait_for_enter_before_exec: waitForEnter,
    enable_native_shell: enableNativeShell,
    wt_args: wtArgs,
    smoke_command: smokeCommand,
  };
}

function normalizeCarrierList(value: string | undefined): string[] {
  const carriers = String(value ?? 'agent-cli')
    .split(',')
    .map((item) => nonEmpty(item))
    .filter((item): item is string => Boolean(item));
  return unique(carriers.length > 0 ? carriers : ['agent-cli']);
}

function agentWebUiAttachWtArgs(record: WorkspaceLaunchRecord, naradaProper: string): string[] {
  const attachCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    'agent-web-ui',
    'attach',
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--wait-for-session-ms', '60000',
    '--open',
  ];
  const prelude = `Write-Host ${quotePowerShellArgument(`agent-web-ui: waiting for ${record.agent} NARS session, then starting browser projection`)}`;
  return [
    'new-tab',
    '--title', `${record.title} Web UI`,
    '-d', record.workspace_root ?? record.narada_root,
    'pwsh',
    '-NoExit',
    '-Command',
    `${prelude}\n${toPowerShellCommand(attachCommand)}`,
  ];
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nonEmptyStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => nonEmpty(value)).filter((value): value is string => Boolean(value));
}

function toPowerShellCommand(args: string[]): string {
  return `& ${args.map(quotePowerShellArgument).join(' ')}`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
