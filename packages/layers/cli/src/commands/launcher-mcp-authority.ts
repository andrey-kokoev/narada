import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { commandResultError, type CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

const requireFromLauncherCommand = createRequire(import.meta.url);

interface ProviderRegistry {
  default_provider?: string;
  providers?: Record<string, {
    meaning?: string;
    support_state?: string;
  }>;
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

function fallbackProviderRegistryForTests(): ProviderRegistry {
  return {
    default_provider: 'kimi-code-api',
    providers: {
      'anthropic-api': { meaning: 'Anthropic API via the Anthropic Messages API.', support_state: 'verified_supported' },
      'codex-subscription': { meaning: 'Local Codex CLI subscription auth via codex mcp-server; no OpenAI API key or API billing path.', support_state: 'verified_supported' },
      'deepseek-api': { meaning: 'DeepSeek API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'glm-api': { meaning: 'GLM API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
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

const providerRegistry = loadProviderRegistry();

export interface ExplainMcpOptions {
  siteRoot?: string;
  site?: string;
  registryPath?: string;
  configPath?: string[];
  server?: string;
  format?: CliFormat;
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

interface WorkspaceLaunchRecord {
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
  mcp_scope: string | null;
  config_path: string;
}

interface WorkspaceLaunchPlanOptions {
  agent?: string[];
  all?: boolean;
  role?: string[];
  site?: string[];
  configPath?: string[];
  registryPath?: string;
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
  McpScope?: string;
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
  McpScope?: string;
  EnableNativeShell?: boolean;
}

function resolveRegistryPaths(options: WorkspaceLaunchPlanOptions): string[] {
  const configPaths = nonEmptyStringArray(options.configPath);
  const paths = configPaths.length > 0
    ? configPaths
    : [options.registryPath ?? join(process.cwd(), 'config', 'launch', 'agents.psd1')];
  return paths.map((path) => resolve(path));
}

async function readLaunchRegistry(path: string): Promise<WorkspaceLaunchRecord[]> {
  if (!existsSync(path)) throw new Error(`launch_registry_missing: ${path}`);
  const raw = path.toLowerCase().endsWith('.json')
    ? JSON.parse(readFileSync(path, 'utf8')) as RawLaunchRegistry
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
  const operatorSurface = nonEmpty(agent.OperatorSurface) ?? nonEmpty(registry.OperatorSurface) ?? 'codex';
  const carrier = operatorSurface;
  const runtime = nonEmpty(agent.Runtime) ?? nonEmpty(registry.Runtime) ?? 'codex';
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
    mcp_scope: nonEmpty(agent.McpScope) ?? nonEmpty(registry.McpScope) ?? null,
    config_path: configPath,
  };
}

function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: { all?: boolean; agent?: string[]; role?: string[]; site?: string[]; configPath?: string[]; }): WorkspaceLaunchRecord[] {
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

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nonEmptyStringArray(value: string[] | undefined): string[] {
  return (value ?? []).map((item) => nonEmpty(item)).filter((item): item is string => Boolean(item));
}
