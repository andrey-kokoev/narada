import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import * as prompts from '@clack/prompts';
import { commandResultError, type CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { carrierStartCommand } from './carrier.js';
import {
  defaultRuntimeForCarrier,
  resolveCarrierRuntimeSelection,
} from '@narada2/carrier-runtime-contract/carrier-runtime-selection';

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
  intelligence_provider: string | null;
  wait_for_enter_before_exec: boolean;
  wt_args: string[];
  smoke_command: string[];
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const registryPaths = resolveRegistryPaths(options);
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  const resolvedOptions = await resolveInteractiveSelectionOptions(records, options);
  const selected = selectLaunchRecords(records, resolvedOptions);
  const plans = selected.map((record) => buildAgentPlan(record, resolvedOptions));
  const wtArgs = plans.flatMap((plan, index) => [
    ...(index === 0 ? [] : [';']),
    ...plan.wt_args,
  ]);
  if (options.smoke) {
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
      result: formattedResult(smokeResult, `workspace smoke ${smokeResult.status}`, options.format ?? 'auto'),
    };
  }
  const mode = options.smoke ? 'smoke' : options.dryRun ? 'dry_run' : 'plan';
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
      executor: 'operator_surface_windows_terminal',
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
  const initialRoleValues = (options.role ?? []).filter((role) => roleChoices.some((choice) => choice.toLowerCase() === role.toLowerCase()));

  const selectedRoles = await prompts.multiselect({
    message: 'Select Role(s)',
    options: roleChoices.map((role) => ({ value: role, label: role })),
    initialValues: initialRoleValues.length > 0 ? initialRoleValues : undefined,
    required: true,
  });
  if (prompts.isCancel(selectedRoles)) throw new Error('interactive_selection_cancelled');

  const selectedCarrier = await prompts.select({
    message: 'Select Operator Surface',
    options: carrierChoices.map((carrier) => ({
      value: carrier,
      label: carrier,
      hint: carrier === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    initialValue: options.operatorSurface ?? options.carrier ?? 'registry default',
  });
  if (prompts.isCancel(selectedCarrier)) throw new Error('interactive_selection_cancelled');

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

  return {
    ...options,
    all: false,
    site: selectedSiteValues,
    role: selectedRoles as string[],
    operatorSurface: selectedCarrier === 'registry default' ? undefined : selectedCarrier,
    runtime: selectedRuntime === 'registry default' ? undefined : selectedRuntime,
  };
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return unique(records
    .filter((record) => recordMatchesSiteSelectors(record, siteSelectors))
    .map((record) => record.role));
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
  const paths = options.configPath && options.configPath.length > 0
    ? options.configPath
    : [options.registryPath ?? join(process.cwd(), 'config', 'launch', 'agents.psd1')];
  return paths.map((path) => resolve(path));
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
  const carrier = nonEmpty(agent.Carrier) ?? nonEmpty(registry.Carrier) ?? 'codex';
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
    carrier,
    runtime,
    enable_native_shell: agent.EnableNativeShell === true,
    config_path: configPath,
  };
}

function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions): WorkspaceLaunchRecord[] {
  let selected: WorkspaceLaunchRecord[];
  const roleSelectors = options.role ?? [];
  const siteSelectors = options.site ?? [];
  const hasRoleSelector = roleSelectors.length > 0;
  const hasSiteSelector = siteSelectors.length > 0;
  const hasConfigPathSelector = Boolean(options.configPath && options.configPath.length > 0);
  if (options.agent && options.agent.length > 0) {
    selected = [];
    for (const agent of options.agent) {
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
  const carrierInput = options.carrier ?? record.carrier;
  const runtimeInput = options.runtime ?? record.runtime;
  const carrierRuntimeSelection = resolveWorkspaceCarrierRuntimeSelection(carrierInput, operatorSurfaceInput, runtimeInput);
  const launchCarrier = carrierRuntimeSelection.carrier_kind;
  const operatorSurfaceKind = carrierRuntimeSelection.operator_surface_kind;
  const launchRuntime = carrierRuntimeSelection.runtime_substrate_kind;
  const runtimeHostKind = carrierRuntimeSelection.runtime_host_kind;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const waitForEnter = options.noWaitForEnterBeforeExec !== true;
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
  if (options.intelligenceProvider) carrierStartCommand.push('--intelligence-provider', options.intelligenceProvider);
  if (waitForEnter) carrierStartCommand.push('--wait');

  const base = [
    'new-tab',
    '--title', record.title,
    '-d', record.workspace_root ?? record.narada_root,
    'pwsh',
    '-NoExit',
    '-Command',
    toPowerShellCommand(carrierStartCommand),
  ];

  const smokeCommand = [
    'narada', 'carrier', 'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--runtime', launchRuntime,
    '--dry-run',
    '--format', 'json',
  ];
  if (record.workspace_root) smokeCommand.push('--workspace-root', record.workspace_root);
  if (options.intelligenceProvider) smokeCommand.push('--intelligence-provider', options.intelligenceProvider);
  if (enableNativeShell) smokeCommand.push('--enable-native-shell');

  return {
    ...record,
    operator_surface_kind: operatorSurfaceKind,
    runtime_host_kind: runtimeHostKind,
    launch_carrier: launchCarrier,
    launch_runtime: launchRuntime,
    intelligence_provider: options.intelligenceProvider ?? null,
    wait_for_enter_before_exec: waitForEnter,
    enable_native_shell: enableNativeShell,
    wt_args: base,
    smoke_command: smokeCommand,
  };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toPowerShellCommand(args: string[]): string {
  return `& ${args.map(quotePowerShellArgument).join(' ')}`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
