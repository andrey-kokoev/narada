import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startOperatorTerminal } from '@narada2/process-launch-posture';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import { executeOperatorProjectionOpenRequest } from '@narada2/process-launch-posture';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import * as prompts from '@clack/prompts';
import { agentIdentityDisplay, buildAgentIdentityRefV2, resolveAgentIdentityRef, type AgentIdentityRefV2 } from '@narada2/agent-identity';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import { commandResultError, type CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { buildLaunchProcessOwnership, launchSessionIdFromToken } from '@narada2/launch-process-ownership';
import { carrierStartCommand } from './carrier.js';
import {
  defaultRuntimeForCarrier,
  resolveCarrierRuntimeSelection,
} from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import { discoverNarsSessions } from '@narada2/carrier-runtime/nars-session-index';
import { explainMcpCommand as explainMcpAuthorityCommand } from './launcher-mcp-authority.js';

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

async function workspaceLaunchStartHiddenProjectionHost(command: string, cwd: string): Promise<Record<string, unknown>> {
  const hostCommand = process.platform === 'win32' ? 'pwsh' : 'sh';
  const hostArgs = process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]
    : ['-lc', command];
  const child = spawnHiddenPostureProcess(hostCommand, hostArgs, {
    posture: 'operator_projection_host',
    cwd,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('spawn', () => resolvePromise());
  });
  child.unref();
  return {
    posture: 'operator_projection_host',
    command: hostCommand,
    args: redactWorkspaceLaunchArgv(hostArgs),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

function redactWorkspaceLaunchCommand(command: string): string {
  return redactWorkspaceLaunchArgv([command])[0] ?? '<redacted>';
}

export async function workspaceLaunchReapStaleSessionOwnedDescendants(
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
): Promise<{ scanned: number; cleanup_requested: number }> {
  const siteRoots = workspaceLaunchSiteRootsForSelection(selection, records);
  const attempted = new Set<string>();
  let scanned = 0;
  for (const siteRoot of siteRoots) {
    try {
      const discovery = discoverNarsSessions({ siteRoot });
      for (const session of discovery.sessions) {
        const normalized = { ...session, site_root: session.site_root ?? siteRoot };
        scanned += 1;
        if (!workspaceLaunchSessionMatchesSelection(normalized, selection)) continue;
        if (!workspaceLaunchSessionOwnedCleanupAllowed(normalized)) continue;
        if (!workspaceLaunchSessionIsTerminalForCleanup(normalized)) continue;
        await workspaceLaunchRequestStaleSessionCleanup(normalized, attempted);
      }
    } catch {
      // Reaper preflight is best-effort; unreadable indexes must not block a fresh launch.
    }
  }
  return { scanned, cleanup_requested: attempted.size };
}

function normalizeMcpScope(value: string | undefined): string {
  const normalized = String(value ?? 'all').trim().toLowerCase();
  if (['all', 'host', 'user-site', 'local-site', 'none'].includes(normalized)) return normalized;
  throw new Error(`mcp_scope_not_admitted: ${normalized}. Admitted scopes: all, host, user-site, local-site, none`);
}

function normalizeRuntimeAuthority(value: string | undefined | null): string {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  if (['auto', 'read', 'write'].includes(normalized)) return normalized;
  throw new Error(`runtime_authority_not_admitted: ${normalized}. Admitted values: auto, read, write`);
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
      'glm-api': { meaning: 'GLM API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'kimi-api': { meaning: 'Kimi/Moonshot API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'kimi-code-api': { meaning: 'Kimi Code API via OpenAI-compatible chat completions; uses KIMI_CODE_API_KEY against api.kimi.com/coding/v1.', support_state: 'verified_supported' },
      'openai-api': { meaning: 'OpenAI API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
    },
  };
}

interface WorkspaceLaunchProjectionObservationRecord {
  schema: 'narada.workspace_launch.observed_projection.v1';
  observation_id: string;
  launch_attempt_id: string;
  projection_kind: 'agent-web-ui' | 'agent-cli';
  session_id: string | null;
  status: 'planned' | 'handed_off' | 'failed';
  command: string;
  authority: 'nars_client_projection_contract';
  ownership_posture: 'handoff_only' | 'owned_by_projection_authority';
  observed_at: string;
  message: string;
  diagnostic: unknown;
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
  operatorSurface?: string;
  runtime?: string;
  authority?: string;
  intelligenceProvider?: string;
  mcpScope?: string;
  cloudflareApiBaseUrl?: string;
  interactiveSelection?: boolean;
  interactiveSelectionUi?: boolean;
  launcherUiPort?: number;
  launcherUiPortFallback?: boolean;
  launcherOutput?: string[];
  defaultInteractiveSelection?: boolean;
  resultPath?: string;
  suppressResultOutput?: boolean;
  enableNativeShell?: boolean;
  noWaitForEnterBeforeExec?: boolean;
  smoke?: boolean;
  dryRun?: boolean;
  format?: CliFormat;
}

type WorkspaceLaunchAttemptStatus = 'queued' | 'planning' | 'launching' | 'launched' | 'failed' | 'forgotten';
type WorkspaceLauncherOutputProjection = 'summary' | 'events' | 'commands' | 'json' | 'quiet';

interface WorkspaceLaunchLegacyCarrierCompatibility {
  schema: 'narada.workspace_launch.legacy_carrier_compatibility.v1';
  status: 'compatibility_fields_present';
  canonical_terms: {
    operator_surface: 'operator_surface';
    runtime_host: 'runtime_host';
  };
  compatibility_paths: {
    command_aliases: string[];
    runtime_aliases: string[];
    status: 'fenced_compatibility';
  };
  compatibility_note: string;
  deprecated_fields: string[];
  replacement_fields: Record<string, string>;
  removal_policy: 'remove_after_consumers_migrate';
}

interface WorkspaceLaunchUiSessionRecord {
  schema: 'narada.workspace_launch.ui_session.v1';
  ui_session_id: string;
  started_at: string;
  status: 'open' | 'closing' | 'closed' | 'timeout';
  url: string | null;
  registry_paths: string[];
  owner: {
    package: '@narada2/cli';
    command: 'launcher workspace-launch';
    surface: 'interactive-selection-ui';
  };
}

interface WorkspaceLaunchHandoffRecord {
  schema: 'narada.workspace_launch.handoff.v1';
  handoff_id: string;
  launch_attempt_id: string;
  posture: 'operator_terminal';
  status: 'planned' | 'handed_off' | 'failed' | 'unknown_after_handoff';
  command: string | null;
  argv_redacted: string[];
  cwd: string | null;
  exit_code: number | null;
  ownership_posture: 'handoff_only';
  diagnostic_ref: string | null;
}

interface WorkspaceLaunchObservationRecord {
  schema: 'narada.workspace_launch.observed_runtime.v1';
  observation_id: string;
  launch_attempt_id: string;
  kind: 'nars';
  session_id: string | null;
  site_root: string | null;
  health: 'waiting' | 'healthy' | 'ambiguous' | 'stale' | 'failed' | 'unowned';
  authority: 'nars_session_management';
  ownership_posture: 'not_yet_observed' | 'owned_by_runtime_authority' | 'observed_unowned';
  last_checked_at: string;
  message: string;
  control_path?: string | null;
  attach_commands?: {
    agent_web_ui?: string | null;
    agent_cli?: string | null;
  };
}

interface WorkspaceLaunchAttemptRecord {
  schema: 'narada.workspace_launch.attempt.v1';
  launch_attempt_id: string;
  ui_session_id: string;
  expected_launch_session_ids: string[];
  submitted_at: string;
  updated_at: string;
  selection: WorkspaceLaunchBrowserSelection;
  status: WorkspaceLaunchAttemptStatus;
  result_summary: string;
  plan_result_path: string | null;
  handoffs: WorkspaceLaunchHandoffRecord[];
  observations: WorkspaceLaunchObservationRecord[];
  projections: WorkspaceLaunchProjectionObservationRecord[];
  actions: string[];
  diagnostic: unknown;
}

interface WorkspaceLaunchDashboardState {
  schema: 'narada.workspace_launch.ui_session_state.v1';
  ui_session: WorkspaceLaunchUiSessionRecord;
  attempts: WorkspaceLaunchAttemptRecord[];
  observed_unowned: unknown[];
  actions: string[];
}

function resolveWorkspaceCarrierRuntimeSelection(operatorSurface: string | undefined, runtime: string): { carrier_kind: string; operator_surface_kind: string; runtime_substrate_kind: string; runtime_host_kind: string } {
  const selection = resolveCarrierRuntimeSelection({
    carrierValue: operatorSurface,
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

function runtimeMcpFabricCandidateDirs(siteRoot: string): string[] {
  const root = resolve(siteRoot);
  const authorityRoot = siteAuthorityRootFromSiteRoot(root);
  return authorityRoot === root
    ? [join(root, '.ai', 'mcp')]
    : [join(root, '.ai', 'mcp'), join(authorityRoot, '.ai', 'mcp')];
}

function readRuntimeMcpFabric(siteRoot: string, serverFilter: string | null): Record<string, unknown> {
  const candidates = runtimeMcpFabricCandidateDirs(siteRoot);
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
  const path = join(siteAuthorityRootFromSiteRoot(siteRoot), 'capabilities', 'mcp-registration.json');
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

function normalizeLauncherOutput(value: unknown, options: WorkspaceLaunchPlanOptions): WorkspaceLauncherOutputProjection[] {
  const raw = stringArray(value).flatMap((entry) => entry.split(',')).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const selected = raw.length > 0 ? raw : (options.interactiveSelectionUi ? ['summary', 'events'] : []);
  const admitted = new Set<WorkspaceLauncherOutputProjection>(['summary', 'events', 'commands', 'json', 'quiet']);
  const projections = unique(selected).map((entry) => {
    if (!admitted.has(entry as WorkspaceLauncherOutputProjection)) {
      throw new Error(`launcher_output_not_admitted: ${entry}. Admitted values: summary, events, commands, json, quiet`);
    }
    return entry as WorkspaceLauncherOutputProjection;
  });
  return projections.includes('quiet') ? ['quiet'] : projections;
}

function launcherOutputHas(outputs: WorkspaceLauncherOutputProjection[], projection: WorkspaceLauncherOutputProjection): boolean {
  return !outputs.includes('quiet') && outputs.includes(projection);
}

function writeLauncherOutput(outputs: WorkspaceLauncherOutputProjection[], event: Record<string, unknown>, human: string): void {
  if (outputs.includes('quiet')) return;
  if (launcherOutputHas(outputs, 'json')) console.log(JSON.stringify(event));
  if (launcherOutputHas(outputs, 'events')) console.log(human);
}

function formatWorkspaceLaunchSelection(selection: WorkspaceLaunchBrowserSelection): string {
  return `${selection.site.join(',') || '*'} / ${selection.role.join(',') || '*'} / ${selection.operatorSurface.join(',') || 'registry default'} / ${selection.runtime} / ${selection.intelligenceProvider}`;
}

function formatWorkspaceLaunchCommand(args: string[]): string {
  return args.map((arg) => /\s/.test(arg) ? `'${arg.replace(/'/g, "''")}'` : arg).join(' ');
}

function writeWorkspaceLaunchCommandOutput(outputs: WorkspaceLauncherOutputProjection[], attempt: WorkspaceLaunchAttemptRecord): void {
  if (!launcherOutputHas(outputs, 'commands')) return;
  for (const handoff of attempt.handoffs) {
    if (handoff.argv_redacted.length > 0) console.log(`[launcher:command] ${formatWorkspaceLaunchCommand(handoff.argv_redacted)}`);
  }
}

function legacyCarrierCompatibility(): WorkspaceLaunchLegacyCarrierCompatibility {
  return {
    schema: 'narada.workspace_launch.legacy_carrier_compatibility.v1',
    status: 'compatibility_fields_present',
    canonical_terms: {
      operator_surface: 'operator_surface',
      runtime_host: 'runtime_host',
    },
    compatibility_paths: {
      command_aliases: ['--carrier', 'carrier start'],
      runtime_aliases: ['nars'],
      status: 'fenced_compatibility',
    },
    compatibility_note: 'Legacy carrier terminology and the nars runtime alias remain available only as fenced compatibility paths. Use operator_surface and runtime_host in new commands and docs.',
    deprecated_fields: [
      'carrier',
      'launch_carrier',
      'launch_carriers',
      'launch_runtime',
    ],
    replacement_fields: {
      carrier: 'operator_surface',
      launch_carrier: 'launch_operator_surface',
      launch_carriers: 'launch_operator_surfaces',
      launch_runtime: 'launch_runtime_host',
    },
    removal_policy: 'remove_after_consumers_migrate',
  };
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
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return explainMcpAuthorityCommand(options, context);
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
  Site?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  OperatorSurface?: string;
  Carrier?: string;
  Runtime?: string;
  Authority?: string;
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
  Authority?: string;
  McpScope?: string;
  EnableNativeShell?: boolean;
}

export interface WorkspaceLaunchRecord {
  agent: string;
  agent_identity_ref: AgentIdentityRefV2;
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
  authority: string | null;
  enable_native_shell: boolean;
  mcp_scope: string | null;
  config_path: string;
}

export interface WorkspaceLaunchAgentPlan extends WorkspaceLaunchRecord {
  operator_surface_kind: string;
  runtime_host_kind: string;
  launch_operator_surface: string;
  launch_operator_surfaces: string[];
  launch_runtime_host: string;
  launch_runtime_hosts: string[];
  launch_carrier: string;
  launch_runtime: string;
  launch_carriers: string[];
  launch_session_id: string | null;
  process_ownership: Record<string, unknown> | null;
  intelligence_provider: string | null;
  authority: string | null;
  wait_for_enter_before_exec: boolean;
  mcp_scope: string;
  wt_args: string[];
  smoke_command: string[];
  operator_projection_launch_binding: Record<string, unknown> | null;
  operator_projection_open_requests: Array<Record<string, unknown>>;
  legacy_carrier_compatibility: WorkspaceLaunchLegacyCarrierCompatibility;
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
        legacy_carrier_compatibility: legacyCarrierCompatibility(),
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
      compatibility: legacyCarrierCompatibility(),
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
    interactive_selection: resolvedOptions.interactiveSelection === true || resolvedOptions.interactiveSelectionUi === true,
    interactive_selection_surface: resolvedOptions.interactiveSelectionUi === true ? 'browser' : (resolvedOptions.interactiveSelection === true ? 'terminal' : null),
    count: plans.length,
    windows_terminal_invoked: false,
    registry_paths: registryPaths,
    selected_agents: plans,
    wt_args: wtArgs,
    compatibility: legacyCarrierCompatibility(),
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
  if (options.interactiveSelectionUi && !options.dryRun && !options.smoke) {
    return runPersistentWorkspaceLaunchSelectionUiCommand(options, context);
  }

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
  const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
  const launch = terminalCaptureLog
    ? (await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs))
    : startOperatorTerminal('wt', effectiveWtArgs).result;
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

async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}

function requestWorkspaceLaunchSelectionUiProjectionOpen(url: string): void {
  void executeOperatorProjectionOpenRequest({
    projection_kind: 'browser_url',
    target_ref: url,
    purpose: 'workspace_launch_interactive_selection_ui',
    caller: { package: '@narada2/cli', command: 'launcher workspace-launch', module: 'commands/launcher' },
    mode: 'execute',
    policy: { allow_visible_host_effect: true },
  }).catch(() => undefined);
}

async function runPersistentWorkspaceLaunchSelectionUiCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(normalizedOptions);
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  const session = await runPersistentWorkspaceLaunchSelectionUi(records, normalizedOptions, async (selection) => {
    const selectionOptions = workspaceLaunchOptionsFromBrowserSelection(normalizedOptions, selection);
    return workspaceLaunchCommand({
      ...selectionOptions,
      interactiveSelection: false,
      interactiveSelectionUi: false,
    }, context);
  });

  return {
    exitCode: session.status === 'cancelled' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult({
      schema: 'narada.workspace_launch.interactive_selection_ui_session.v1',
      status: session.status,
      mutation_performed: session.launch_count > 0,
      url: session.url,
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
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
): Promise<WorkspaceLaunchPlanOptions> {
  if (options.interactiveSelectionUi) return resolveInteractiveSelectionUiOptions(records, options);
  if (!options.interactiveSelection) return options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('interactive_selection_requires_tty: --interactive-selection requires an interactive terminal');
  }

  const siteChoices = unique(records.map((record) => record.site));

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

  const selectedRoleValues = selectedRoles as string[];
  const selectedRecords = selectLaunchRecords(records, {
    ...options,
    all: true,
    site: selectedSiteValues,
    role: selectedRoleValues,
  });
  const selectorModel = workspaceLaunchSelectorModel(records, {
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: options.operatorSurface ? normalizeCarrierList(options.operatorSurface) : undefined,
    runtime: options.runtime ?? 'registry default',
    intelligenceProvider: options.intelligenceProvider ?? 'registry default',
  });

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

  const selectedCarrierValues = normalizeInteractiveOperatorSurfaceValues(selectedCarriers as string[]);
  const providerSelectorModel = workspaceLaunchSelectorModel(records, {
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: selectedCarrierValues,
    runtime: selectedRuntime as string,
    intelligenceProvider: options.intelligenceProvider ?? 'registry default',
  });
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
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
): Promise<WorkspaceLaunchPlanOptions> {
  const selection = await runWorkspaceLaunchSelectionUi(records, options);
  return workspaceLaunchOptionsFromBrowserSelection(options, selection);
}

function workspaceLaunchOptionsFromBrowserSelection(
  options: WorkspaceLaunchPlanOptions,
  selection: WorkspaceLaunchBrowserSelection,
): WorkspaceLaunchPlanOptions {
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

interface WorkspaceLaunchBrowserSelection {
  site: string[];
  role: string[];
  operatorSurface: string[];
  runtime: string;
  intelligenceProvider: string;
}

interface WorkspaceLaunchRememberedSelectionRecord {
  schema: 'narada.workspace_launch.remembered_selection.v1';
  updated_at: string;
  selection: WorkspaceLaunchBrowserSelection;
}

interface WorkspaceLaunchUiPortPolicyRecord {
  LauncherUiPort?: number;
  LauncherUiPortFallback?: boolean;
  launcherUiPort?: number;
  launcherUiPortFallback?: boolean;
}

interface WorkspaceLaunchUiPortPolicy {
  port: number;
  fallbackToEphemeral: boolean;
  source: 'default' | 'config' | 'explicit';
}

export interface WorkspaceLaunchSelectorOption {
  value: string;
  label: string;
  hint?: string;
}

export interface WorkspaceLaunchSelectorModel {
  schema: 'narada.workspace_launch.selector_model.v1';
  siteOptions: WorkspaceLaunchSelectorOption[];
  roleOptions: WorkspaceLaunchSelectorOption[];
  operatorSurfaceOptions: WorkspaceLaunchSelectorOption[];
  runtimeOptions: WorkspaceLaunchSelectorOption[];
  intelligenceProviderOptions: WorkspaceLaunchSelectorOption[];
  selected: WorkspaceLaunchBrowserSelection;
}

export function workspaceLaunchSelectorModel(records: WorkspaceLaunchRecord[], selection: Partial<WorkspaceLaunchBrowserSelection> = {}): WorkspaceLaunchSelectorModel {
  const siteValues = unique(records.map((record) => record.site));
  const selectedSites = nonEmptyStringArray(selection.site).filter((site) => siteValues.includes(site));
  const roleValues = roleChoicesForSelectedSites(records, selectedSites);
  const requestedRoles = nonEmptyStringArray(selection.role).filter((role) => roleValues.includes(role));
  const selectedRoles = requestedRoles.length > 0 ? requestedRoles : initialRoleValuesForInteractiveSelection(roleValues);
  const selectedRecords = selectLaunchRecords(records, { all: true, site: selectedSites, role: selectedRoles });
  const operatorSurfaceValues = unique([
    'registry default',
    ...selectedRecords.map((record) => record.carrier),
    'agent-cli',
    'agent-web-ui',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);
  const selectedOperatorSurfaces = initialOperatorSurfaceValues(operatorSurfaceValues, nonEmptyStringArray(selection.operatorSurface).join(','));
  const runtimeValues = unique([
    'registry default',
    ...selectedRecords.map((record) => record.runtime),
    'narada-agent-runtime-server',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);
  const requestedRuntime = nonEmpty(selection.runtime);
  const selectedRuntime = requestedRuntime && runtimeValues.includes(requestedRuntime) ? requestedRuntime : 'registry default';
  const providerOperatorSurface = selectedOperatorSurfaces.includes('agent-cli') ? 'agent-cli' : (selectedOperatorSurfaces[0] ?? 'registry default');
  const intelligenceProviderOptions = intelligenceProviderChoicesForLaunchSelection({
    records: selectedRecords,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime,
  });
  const providerValues = new Set(intelligenceProviderOptions.map((option) => option.value));
  const requestedProvider = nonEmpty(selection.intelligenceProvider);
  const selectedProvider = requestedProvider && providerValues.has(requestedProvider) ? requestedProvider : 'registry default';
  return {
    schema: 'narada.workspace_launch.selector_model.v1',
    siteOptions: siteValues.map((site) => ({ value: site, label: site })),
    roleOptions: roleValues.map((role) => ({ value: role, label: role })),
    operatorSurfaceOptions: operatorSurfaceValues.map((surface) => ({
      value: surface,
      label: surface === 'registry default' ? registryDefaultOperatorSurfaceLabel(selectedRecords) : surface,
      hint: surface === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    runtimeOptions: runtimeValues.map((runtime) => ({
      value: runtime,
      label: runtime === 'registry default' ? registryDefaultRuntimeLabel(selectedRecords) : runtime,
      hint: runtime === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    intelligenceProviderOptions,
    selected: {
      site: selectedSites,
      role: selectedRoles,
      operatorSurface: selectedOperatorSurfaces,
      runtime: selectedRuntime,
      intelligenceProvider: selectedProvider,
    },
  };
}

async function runWorkspaceLaunchSelectionUi(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
): Promise<WorkspaceLaunchBrowserSelection> {
  const host = '127.0.0.1';
  let server: Server | null = null;
  let settled = false;
  const portPolicy = resolveWorkspaceLaunchUiPortPolicy(options);

  const rememberedSelection = await readWorkspaceLaunchRememberedSelection();
  const pageModel = buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection);
  const html = buildWorkspaceLaunchSelectionHtml(pageModel);

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  }

  const selectionPromise = new Promise<WorkspaceLaunchBrowserSelection>((resolveSelection, rejectSelection) => {
    server = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:0`}`);
        if (req.method === 'GET' && url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
          res.end(html);
          return;
        }
        if (req.method === 'POST' && url.pathname === '/selector-model') {
          const payload = JSON.parse(await readBody(req)) as Partial<WorkspaceLaunchBrowserSelection>;
          jsonResponse(res, 200, workspaceLaunchSelectorModel(records, payload));
          return;
        }
        if (req.method === 'POST' && url.pathname === '/submit') {
          const payload = JSON.parse(await readBody(req)) as Partial<WorkspaceLaunchBrowserSelection>;
          const selection = normalizeWorkspaceLaunchBrowserSelection(payload);
          await writeWorkspaceLaunchRememberedSelection(selection);
          settled = true;
          jsonResponse(res, 200, { status: 'accepted' });
          resolveSelection(selection);
          return;
        }
        if (req.method === 'POST' && url.pathname === '/cancel') {
          settled = true;
          jsonResponse(res, 200, { status: 'cancelled' });
          rejectSelection(new Error('interactive_selection_cancelled'));
          return;
        }
        jsonResponse(res, 404, { error: 'not_found' });
      })().catch((error) => {
        if (!res.headersSent) jsonResponse(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
    });
    server.on('error', rejectSelection);
  });

  const { url, port, fallback_used } = await listenWorkspaceLaunchUiServer(server!, host, portPolicy);

  console.log(`Narada launcher selection UI: ${url}`);
  if (fallback_used) {
    console.log(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  }
  requestWorkspaceLaunchSelectionUiProjectionOpen(url);

  try {
    return await Promise.race([
      selectionPromise,
      new Promise<WorkspaceLaunchBrowserSelection>((_, rejectTimeout) => {
        const timer = setTimeout(() => {
          if (!settled) rejectTimeout(new Error('interactive_selection_ui_timeout'));
        }, 10 * 60 * 1000);
        timer.unref?.();
      }),
    ]);
  } finally {
    await closeWorkspaceLaunchSelectionServer(server);
  }
}

async function runPersistentWorkspaceLaunchSelectionUi(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  launchSelection: (selection: WorkspaceLaunchBrowserSelection) => Promise<{ exitCode: ExitCode; result: unknown }>,
): Promise<{ status: 'cancelled' | 'timeout'; url: string; launch_count: number }> {
  const host = '127.0.0.1';
  let server: Server | null = null;
  let settled = false;
  let launchCount = 0;
  const portPolicy = resolveWorkspaceLaunchUiPortPolicy(options);
  const registryPaths = resolveRegistryPaths(options);
  const launcherOutputs = normalizeLauncherOutput(options.launcherOutput, options);
  const recoveredAttempts = await loadRecoveredWorkspaceLaunchAttempts(registryPaths);
  const attempts: WorkspaceLaunchAttemptRecord[] = [...recoveredAttempts];
  launchCount = attempts.filter((attempt) => attempt.status === 'launched').length;
  const uiSession: WorkspaceLaunchUiSessionRecord = {
    schema: 'narada.workspace_launch.ui_session.v1',
    ui_session_id: workspaceLaunchId('wls'),
    started_at: new Date().toISOString(),
    status: 'open',
    url: null,
    registry_paths: registryPaths,
    owner: { package: '@narada2/cli', command: 'launcher workspace-launch', surface: 'interactive-selection-ui' },
  };
  const persistenceDir = workspaceLaunchUiSessionPersistenceDir(uiSession.ui_session_id);

  const rememberedSelection = await readWorkspaceLaunchRememberedSelection();
  const pageModel = buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection);
  const html = buildWorkspaceLaunchSelectionHtml(pageModel, { persistent: true });

  const dashboardState = (): WorkspaceLaunchDashboardState => ({
    schema: 'narada.workspace_launch.ui_session_state.v1',
    ui_session: uiSession,
    attempts: attempts.filter((attempt) => attempt.status !== 'forgotten'),
    observed_unowned: [],
    actions: ['submit', 'cancel'],
  });

  const runLaunchAttempt = async (selection: WorkspaceLaunchBrowserSelection): Promise<WorkspaceLaunchAttemptRecord> => {
    const attempt: WorkspaceLaunchAttemptRecord = {
      schema: 'narada.workspace_launch.attempt.v1',
      launch_attempt_id: workspaceLaunchId('wla'),
      ui_session_id: uiSession.ui_session_id,
      expected_launch_session_ids: [],
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      selection,
      status: 'queued',
      result_summary: 'Launch queued.',
      plan_result_path: null,
      handoffs: [],
      observations: [],
      projections: [],
      actions: ['recheck', 'forget'],
      diagnostic: null,
    };
    attempts.push(attempt);
    writeLauncherOutput(launcherOutputs, {
      schema: 'narada.workspace_launch.terminal_event.v1',
      event: 'selection_submitted',
      launch_attempt_id: attempt.launch_attempt_id,
      selection,
    }, `[launcher] selection submitted: ${formatWorkspaceLaunchSelection(selection)}`);
    attempt.status = 'planning';
    attempt.result_summary = 'Planning workspace launch.';
    attempt.updated_at = new Date().toISOString();
    try {
      await workspaceLaunchReapStaleSessionOwnedDescendants(selection, records);
      attempt.status = 'launching';
      attempt.result_summary = 'Executing host handoff.';
      attempt.updated_at = new Date().toISOString();
      const launch = await launchSelection(selection);
      const success = launch.exitCode === ExitCode.SUCCESS;
      attempt.status = success ? 'launched' : 'failed';
      attempt.result_summary = workspaceLaunchResultSummary(launch.result, success);
      attempt.plan_result_path = workspaceLaunchString(isRecord(launch.result) ? launch.result.result_path : null);
      attempt.handoffs = [workspaceLaunchHandoffFromResult(attempt.launch_attempt_id, launch.result, success)];
      attempt.expected_launch_session_ids = success ? workspaceLaunchExpectedSessionIds(launch.result) : [];
      attempt.observations = success ? await workspaceLaunchRuntimeObservations(attempt.launch_attempt_id, selection, records, attempt.expected_launch_session_ids) : [];
      attempt.actions = success ? workspaceLaunchActionsForAttempt(attempt) : ['retry', 'forget'];
      attempt.diagnostic = launch.result;
      attempt.updated_at = new Date().toISOString();
      if (success) launchCount += 1;
      await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
      writeLauncherOutput(launcherOutputs, {
        schema: 'narada.workspace_launch.terminal_event.v1',
        event: success ? 'launch_handed_off' : 'launch_failed',
        launch_attempt_id: attempt.launch_attempt_id,
        status: attempt.status,
        result_path: attempt.plan_result_path,
      }, `[launcher] ${success ? 'handed off' : 'failed'}: ${attempt.result_summary}${attempt.plan_result_path ? ` result=${attempt.plan_result_path}` : ''}`);
      writeWorkspaceLaunchCommandOutput(launcherOutputs, attempt);
      return attempt;
    } catch (error) {
      attempt.status = 'failed';
      attempt.result_summary = error instanceof Error ? error.message : String(error);
      attempt.handoffs = [workspaceLaunchFailedHandoff(attempt.launch_attempt_id, error)];
      attempt.actions = ['retry', 'forget'];
      attempt.diagnostic = { error: attempt.result_summary };
      attempt.updated_at = new Date().toISOString();
      await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
      writeLauncherOutput(launcherOutputs, {
        schema: 'narada.workspace_launch.terminal_event.v1',
        event: 'launch_failed',
        launch_attempt_id: attempt.launch_attempt_id,
        error: attempt.result_summary,
      }, `[launcher] failed: ${attempt.result_summary}`);
      return attempt;
    }
  };

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  }

  const closed = new Promise<'cancelled'>((resolveClosed, rejectClosed) => {
    server = createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:0`}`);
        if (req.method === 'GET' && url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
          res.end(html);
          return;
        }
        if (req.method === 'GET' && url.pathname === '/launches') {
          jsonResponse(res, 200, dashboardState());
          return;
        }
        if (req.method === 'POST' && url.pathname === '/selector-model') {
          const payload = JSON.parse(await readBody(req)) as Partial<WorkspaceLaunchBrowserSelection>;
          jsonResponse(res, 200, workspaceLaunchSelectorModel(records, payload));
          return;
        }
        if (req.method === 'POST' && url.pathname === '/submit') {
          const payload = JSON.parse(await readBody(req)) as Partial<WorkspaceLaunchBrowserSelection>;
          const selection = normalizeWorkspaceLaunchBrowserSelection(payload);
          await writeWorkspaceLaunchRememberedSelection(selection);
          const attempt = await runLaunchAttempt(selection);
          jsonResponse(res, attempt.status === 'launched' ? 200 : 500, {
            schema: 'narada.workspace_launch.submit_result.v1',
            status: attempt.status,
            launch_count: launchCount,
            attempt,
            dashboard: dashboardState(),
          });
          return;
        }
        const launchAction = url.pathname.match(/^\/launches\/([^/]+)\/(recheck|retry|forget|open-web-ui|attach-cli|stop-runtime|stop-projection)$/);
        if (req.method === 'POST' && launchAction) {
          const [, launchAttemptId, action] = launchAction;
          const attempt = attempts.find((candidate) => candidate.launch_attempt_id === launchAttemptId);
          if (!attempt) {
            jsonResponse(res, 404, { schema: 'narada.workspace_launch.action_refusal.v1', status: 'refused', reason_code: 'launch_attempt_not_found', message: `Launch attempt not found: ${launchAttemptId}` });
            return;
          }
          if (action === 'forget') {
            attempt.status = 'forgotten';
            attempt.updated_at = new Date().toISOString();
            await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
            jsonResponse(res, 200, { schema: 'narada.workspace_launch.action_result.v1', status: 'forgotten', dashboard: dashboardState() });
            return;
          }
          if (action === 'retry') {
            const retryAttempt = await runLaunchAttempt(attempt.selection);
            jsonResponse(res, retryAttempt.status === 'launched' ? 200 : 500, { schema: 'narada.workspace_launch.action_result.v1', status: retryAttempt.status, attempt: retryAttempt, dashboard: dashboardState() });
            return;
          }
          if (action === 'recheck') {
            attempt.updated_at = new Date().toISOString();
            attempt.observations = await workspaceLaunchRuntimeObservations(attempt.launch_attempt_id, attempt.selection, records, attempt.expected_launch_session_ids);
            attempt.actions = workspaceLaunchActionsForAttempt(attempt);
            await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
            jsonResponse(res, 200, { schema: 'narada.workspace_launch.action_result.v1', status: 'rechecked', attempt, dashboard: dashboardState() });
            return;
          }
          if (action === 'open-web-ui' || action === 'attach-cli') {
            const command = workspaceLaunchAttachCommandForAction(attempt, action);
            if (!command) {
              jsonResponse(res, 409, {
                schema: 'narada.workspace_launch.action_refusal.v1',
                status: 'refused',
                reason_code: 'attach_command_not_available',
                message: `${action === 'open-web-ui' ? 'Open This UI' : 'Attach CLI To This Session'} requires a discovered attachable NARS session for this launch result.`,
                dashboard: dashboardState(),
              });
              return;
            }
            const projection = await workspaceLaunchExecuteProjectionAction(attempt, action, command);
            attempt.projections.push(projection);
            attempt.updated_at = new Date().toISOString();
            await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
            jsonResponse(res, 200, {
              schema: 'narada.workspace_launch.action_result.v1',
              status: projection.status,
              action,
              command,
              projection,
              message: projection.message,
              dashboard: dashboardState(),
            });
            return;
          }
          if (action === 'stop-runtime') {
            const result = await workspaceLaunchRequestRuntimeStop(attempt);
            if (result.status !== 'requested') {
              jsonResponse(res, 409, { ...result, dashboard: dashboardState() });
              return;
            }
            attempt.updated_at = new Date().toISOString();
            attempt.actions = workspaceLaunchActionsForAttempt(attempt);
            await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
            jsonResponse(res, 200, { ...result, dashboard: dashboardState() });
            return;
          }
          jsonResponse(res, 409, {
            schema: 'narada.workspace_launch.action_refusal.v1',
            status: 'refused',
            reason_code: 'projection_lifecycle_not_admitted',
            message: 'Stop Projection requires admitted projection lifecycle authority.',
            dashboard: dashboardState(),
          });
          return;
        }
        if (req.method === 'POST' && url.pathname === '/cancel') {
          settled = true;
          uiSession.status = 'closed';
          await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
          jsonResponse(res, 200, { status: 'closed', launch_count: launchCount });
          resolveClosed('cancelled');
          return;
        }
        jsonResponse(res, 404, { error: 'not_found' });
      })().catch((error) => {
        if (!res.headersSent) jsonResponse(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
    });
    server.on('error', rejectClosed);
  });

  const { url, port, fallback_used } = await listenWorkspaceLaunchUiServer(server!, host, portPolicy);

  console.log(`Narada launcher selection UI: ${url}`);
  if (fallback_used) {
    console.log(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  }
  console.log('Selection UI will remain available for additional launches until you close it.');
  uiSession.url = url;
  await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
  requestWorkspaceLaunchSelectionUiProjectionOpen(url);

  try {
    const status = await Promise.race([
      closed,
      new Promise<'timeout'>((resolveTimeout) => {
        const timer = setTimeout(() => {
          if (!settled) {
            uiSession.status = 'timeout';
            resolveTimeout('timeout');
          }
        }, 8 * 60 * 60 * 1000);
        timer.unref?.();
      }),
    ]);
    await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
    return { status, url, launch_count: launchCount };
  } finally {
    await closeWorkspaceLaunchSelectionServer(server);
  }
}

function workspaceLaunchId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function workspaceLaunchUserSiteRoot(): string {
  return process.env.NARADA_USER_SITE_ROOT
    ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Narada') : null)
    ?? join(process.cwd(), '.narada-user-site');
}

const WORKSPACE_LAUNCH_UI_DEFAULT_PORT = 47320;

function workspaceLaunchUiPolicyPath(): string {
  return join(resolve(workspaceLaunchUserSiteRoot()), 'config', 'launch', 'workspace-launch.psd1');
}

function parseWorkspaceLaunchUiPort(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

function parseWorkspaceLaunchUiPortFallback(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/^\$/, '');
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return null;
}

function readWorkspaceLaunchUiPortPolicyConfig(): WorkspaceLaunchUiPortPolicyRecord | null {
  const path = workspaceLaunchUiPolicyPath();
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const portMatch = text.match(/LauncherUiPort\s*=\s*([0-9]+)/i);
  const fallbackMatch = text.match(/LauncherUiPortFallback\s*=\s*(\$true|\$false|true|false|1|0|yes|no|y|n)/i);
  return {
    LauncherUiPort: parseWorkspaceLaunchUiPort(portMatch ? portMatch[1] : null) ?? undefined,
    LauncherUiPortFallback: parseWorkspaceLaunchUiPortFallback(fallbackMatch ? fallbackMatch[1] : null) ?? undefined,
  };
}

export function resolveWorkspaceLaunchUiPortPolicy(options: WorkspaceLaunchPlanOptions): WorkspaceLaunchUiPortPolicy {
  const config = readWorkspaceLaunchUiPortPolicyConfig();
  const explicitPort = parseWorkspaceLaunchUiPort(options.launcherUiPort);
  const explicitFallback = typeof options.launcherUiPortFallback === 'boolean' ? options.launcherUiPortFallback : null;
  const configPort = config ? parseWorkspaceLaunchUiPort(config.LauncherUiPort ?? config.launcherUiPort) : null;
  const configFallback = config ? parseWorkspaceLaunchUiPortFallback(config.LauncherUiPortFallback ?? config.launcherUiPortFallback) : null;

  const port = explicitPort ?? configPort ?? WORKSPACE_LAUNCH_UI_DEFAULT_PORT;
  const fallbackToEphemeral = explicitFallback ?? configFallback ?? false;
  const source: WorkspaceLaunchUiPortPolicy['source'] = explicitPort !== null ? 'explicit' : (configPort !== null ? 'config' : 'default');
  return { port, fallbackToEphemeral, source };
}

function workspaceLaunchUiPortProbeUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function probeWorkspaceLaunchUiSession(url: string): Promise<{ active: boolean; detail: string | null }> {
  const probes = [`${url}/launches`, `${url}/`];
  for (const probeUrl of probes) {
    try {
      const response = await fetch(probeUrl);
      if (!response.ok) continue;
      if (probeUrl.endsWith('/launches')) {
        const payload = await response.json().catch(() => null);
        if (isRecord(payload) && payload.schema === 'narada.workspace_launch.ui_session_state.v1') {
          const uiSession = isRecord(payload.ui_session) ? (payload.ui_session as Record<string, unknown>) : null;
          return { active: true, detail: typeof uiSession?.ui_session_id === 'string' ? uiSession.ui_session_id : null };
        }
      } else {
        const text = await response.text();
        if (text.includes('Narada Workspace Launch')) {
          return { active: true, detail: null };
        }
      }
    } catch {
      // Ignore transport failures and continue probing.
    }
  }
  return { active: false, detail: null };
}

export async function listenWorkspaceLaunchUiServer(server: Server, host: string, policy: WorkspaceLaunchUiPortPolicy): Promise<{ port: number; url: string; fallback_used: boolean }> {
  const bind = async (port: number): Promise<number> => new Promise<number>((resolvePort, rejectPort) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      rejectPort(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      resolvePort(actualPort);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  try {
    const port = await bind(policy.port);
    return { port, url: workspaceLaunchUiPortProbeUrl(host, port), fallback_used: false };
  } catch (error) {
    const errno = isRecord(error) && typeof error.code === 'string' ? error.code : null;
    if (errno !== 'EADDRINUSE') throw error;
    const occupiedUrl = workspaceLaunchUiPortProbeUrl(host, policy.port);
    const probe = await probeWorkspaceLaunchUiSession(occupiedUrl);
    if (policy.fallbackToEphemeral) {
      const port = await bind(0);
      return { port, url: workspaceLaunchUiPortProbeUrl(host, port), fallback_used: true };
    }
    if (probe.active) {
      throw new Error(`launcher_ui_port_in_use: ${occupiedUrl} is already serving an active Narada Workspace Launch session${probe.detail ? ` (${probe.detail})` : ''}. Use --launcher-ui-port-fallback to allow an ephemeral fallback port.`);
    }
    throw new Error(`launcher_ui_port_in_use: ${occupiedUrl} is already occupied. Use --launcher-ui-port-fallback to allow an ephemeral fallback port or choose a different --launcher-ui-port.`);
  }
}

function workspaceLaunchUiSessionPersistenceRoot(): string {
  return join(siteAuthorityRootFromSiteRoot(workspaceLaunchUserSiteRoot()), 'runtime', 'workspace-launch-ui-sessions');
}

function workspaceLaunchRememberedSelectionRoot(): string {
  return join(siteAuthorityRootFromSiteRoot(workspaceLaunchUserSiteRoot()), 'runtime', 'workspace-launch-ui-state');
}

function workspaceLaunchRememberedSelectionPath(): string {
  return join(workspaceLaunchRememberedSelectionRoot(), 'remembered-selection.json');
}

export async function readWorkspaceLaunchRememberedSelection(): Promise<WorkspaceLaunchBrowserSelection | null> {
  const path = workspaceLaunchRememberedSelectionPath();
  const parsed = await readJsonFile(path);
  return normalizeWorkspaceLaunchRememberedSelectionRecord(parsed)?.selection ?? null;
}

export async function writeWorkspaceLaunchRememberedSelection(selection: WorkspaceLaunchBrowserSelection): Promise<void> {
  const path = workspaceLaunchRememberedSelectionPath();
  await mkdir(dirname(path), { recursive: true });
  await writeJsonFile(path, {
    schema: 'narada.workspace_launch.remembered_selection.v1',
    updated_at: new Date().toISOString(),
    selection,
  } satisfies WorkspaceLaunchRememberedSelectionRecord);
}

function normalizeWorkspaceLaunchRememberedSelectionRecord(value: unknown): WorkspaceLaunchRememberedSelectionRecord | null {
  if (!isRecord(value)) return null;
  const rawSelection = isRecord(value.selection) ? value.selection : value;
  try {
    const selection = normalizeWorkspaceLaunchBrowserSelection(rawSelection as Partial<WorkspaceLaunchBrowserSelection>);
    return {
      schema: 'narada.workspace_launch.remembered_selection.v1',
      updated_at: typeof value.updated_at === 'string' && value.updated_at ? value.updated_at : new Date(0).toISOString(),
      selection,
    };
  } catch {
    return null;
  }
}

function workspaceLaunchUiSessionPersistenceDir(uiSessionId: string): string {
  return join(workspaceLaunchUiSessionPersistenceRoot(), uiSessionId);
}

async function persistWorkspaceLaunchDashboardState(
  dir: string,
  uiSession: WorkspaceLaunchUiSessionRecord,
  attempts: WorkspaceLaunchAttemptRecord[],
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, 'session.json'), uiSession);
  await writeJsonLinesFile(join(dir, 'attempts.jsonl'), attempts);
  await writeJsonLinesFile(join(dir, 'handoffs.jsonl'), attempts.flatMap((attempt) => attempt.handoffs));
  await writeJsonLinesFile(join(dir, 'observations.jsonl'), attempts.flatMap((attempt) => attempt.observations));
  await writeJsonLinesFile(join(dir, 'projections.jsonl'), attempts.flatMap((attempt) => attempt.projections));
  await pruneWorkspaceLaunchDashboardSessions(workspaceLaunchUiSessionPersistenceRoot());
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonLinesFile(path: string, values: unknown[]): Promise<void> {
  await writeFile(path, values.map((value) => JSON.stringify(value)).join('\n') + (values.length > 0 ? '\n' : ''), 'utf8');
}

async function loadRecoveredWorkspaceLaunchAttempts(registryPaths: string[]): Promise<WorkspaceLaunchAttemptRecord[]> {
  const root = workspaceLaunchUiSessionPersistenceRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const dir = join(root, entry.name);
      const session = await readJsonFile(join(dir, 'session.json'));
      if (!isWorkspaceLaunchUiSessionRecord(session)) return null;
      if (!workspaceLaunchRegistryPathsCompatible(registryPaths, session.registry_paths)) return null;
      const attempts = (await readJsonLinesFile(join(dir, 'attempts.jsonl')))
        .map(normalizeWorkspaceLaunchAttemptRecord)
        .filter((attempt): attempt is WorkspaceLaunchAttemptRecord => attempt !== null);
      return { session, attempts };
    }));
  const compatible = sessions.filter((session): session is { session: WorkspaceLaunchUiSessionRecord; attempts: WorkspaceLaunchAttemptRecord[] } => session !== null);
  compatible.sort((a, b) => b.session.started_at.localeCompare(a.session.started_at));
  return compatible[0]?.attempts ?? [];
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function readJsonLinesFile(path: string): Promise<unknown[]> {
  try {
    return (await readFile(path, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function workspaceLaunchRegistryPathsCompatible(current: string[], saved: string[]): boolean {
  const normalize = (value: string) => resolve(value).toLowerCase();
  const currentSet = new Set(current.map(normalize));
  const savedSet = new Set(saved.map(normalize));
  if (currentSet.size !== savedSet.size) return false;
  return [...currentSet].every((value) => savedSet.has(value));
}

async function pruneWorkspaceLaunchDashboardSessions(root: string): Promise<void> {
  const keep = workspaceLaunchDashboardRetentionCount();
  if (keep <= 0 || !existsSync(root)) return;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const dir = join(root, entry.name);
      const session = await readJsonFile(join(dir, 'session.json'));
      return isWorkspaceLaunchUiSessionRecord(session) ? { dir, started_at: session.started_at } : null;
    }));
  const ordered = sessions
    .filter((session): session is { dir: string; started_at: string } => session !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  await Promise.all(ordered.slice(keep).map((session) => rm(session.dir, { recursive: true, force: true })));
}

function workspaceLaunchDashboardRetentionCount(): number {
  const raw = process.env.NARADA_WORKSPACE_LAUNCH_UI_SESSION_RETENTION;
  if (!raw) return 20;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function isWorkspaceLaunchUiSessionRecord(value: unknown): value is WorkspaceLaunchUiSessionRecord {
  return isRecord(value)
    && value.schema === 'narada.workspace_launch.ui_session.v1'
    && typeof value.ui_session_id === 'string'
    && typeof value.started_at === 'string'
    && Array.isArray(value.registry_paths);
}

function isWorkspaceLaunchAttemptRecord(value: unknown): value is WorkspaceLaunchAttemptRecord {
  return isRecord(value)
    && value.schema === 'narada.workspace_launch.attempt.v1'
    && typeof value.launch_attempt_id === 'string'
    && isRecord(value.selection)
    && Array.isArray(value.handoffs)
    && Array.isArray(value.observations)
    && Array.isArray(value.actions);
}

function normalizeWorkspaceLaunchAttemptRecord(value: unknown): WorkspaceLaunchAttemptRecord | null {
  if (!isWorkspaceLaunchAttemptRecord(value)) return null;
  return {
    ...value,
    expected_launch_session_ids: Array.isArray(value.expected_launch_session_ids)
      ? value.expected_launch_session_ids.map(workspaceLaunchString).filter((entry): entry is string => Boolean(entry))
      : workspaceLaunchExpectedSessionIds(value.diagnostic),
    projections: Array.isArray(value.projections) ? value.projections.filter(isWorkspaceLaunchProjectionObservationRecord) : [],
  };
}

function isWorkspaceLaunchProjectionObservationRecord(value: unknown): value is WorkspaceLaunchProjectionObservationRecord {
  return isRecord(value)
    && value.schema === 'narada.workspace_launch.observed_projection.v1'
    && typeof value.observation_id === 'string'
    && typeof value.launch_attempt_id === 'string'
    && (value.projection_kind === 'agent-web-ui' || value.projection_kind === 'agent-cli')
    && (value.status === 'planned' || value.status === 'handed_off' || value.status === 'failed');
}

function workspaceLaunchString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function workspaceLaunchResultSummary(result: unknown, success: boolean): string {
  if (!success) {
    const error = isRecord(result) ? workspaceLaunchString(result.error) ?? workspaceLaunchString(result.reason) : null;
    return error ?? 'Launch failed.';
  }
  const record = isRecord(result) ? result : {};
  const count = typeof record.count === 'number' ? record.count : null;
  if (count !== null) return `Launch accepted for ${count} workspace launch${count === 1 ? '' : 'es'}.`;
  return 'Launch accepted.';
}

function workspaceLaunchActionsForAttempt(attempt: WorkspaceLaunchAttemptRecord): string[] {
  const actions = ['recheck'];
  if (workspaceLaunchAttachCommandForAction(attempt, 'open-web-ui')) actions.push('open-web-ui');
  if (workspaceLaunchAttachCommandForAction(attempt, 'attach-cli')) actions.push('attach-cli');
  actions.push('retry');
  if (workspaceLaunchRuntimeStopControlPath(attempt)) actions.push('stop-runtime');
  actions.push('forget');
  return unique(actions);
}

async function workspaceLaunchRequestRuntimeStop(attempt: WorkspaceLaunchAttemptRecord): Promise<Record<string, unknown>> {
  const controlPath = workspaceLaunchRuntimeStopControlPath(attempt);
  if (!controlPath) {
    return {
      schema: 'narada.workspace_launch.action_refusal.v1',
      status: 'refused',
      reason_code: 'runtime_lifecycle_not_admitted',
      message: 'Stop Runtime requires an admitted NARS control path for this session.',
    };
  }
  const requestId = workspaceLaunchId('stop_runtime');
  const frame = {
    id: requestId,
    method: 'session.close',
    params: {
      source: 'launcher-session-dashboard',
      launch_attempt_id: attempt.launch_attempt_id,
    },
  };
  await appendFile(controlPath, `${JSON.stringify(frame)}\n`, 'utf8');
  return {
    schema: 'narada.workspace_launch.action_result.v1',
    status: 'requested',
    action: 'stop-runtime',
    request_id: requestId,
    control_path: controlPath,
    message: 'Stop Runtime requested through NARS session control path.',
  };
}

function workspaceLaunchRuntimeStopControlPath(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.control_path && existsSync(observation.control_path)) return observation.control_path;
  }
  return null;
}

function workspaceLaunchAttachCommandForAction(attempt: WorkspaceLaunchAttemptRecord, action: string): string | null {
  const commandKey = action === 'open-web-ui' ? 'agent_web_ui' : action === 'attach-cli' ? 'agent_cli' : null;
  if (!commandKey) return null;
  for (const observation of attempt.observations) {
    const command = observation.attach_commands?.[commandKey];
    if (command) return command;
  }
  return null;
}

async function workspaceLaunchExecuteProjectionAction(
  attempt: WorkspaceLaunchAttemptRecord,
  action: string,
  command: string,
): Promise<WorkspaceLaunchProjectionObservationRecord> {
  const projectionKind = action === 'open-web-ui' ? 'agent-web-ui' : 'agent-cli';
  const sessionId = workspaceLaunchProjectionSessionId(attempt);
  const title = `${projectionKind} ${sessionId ?? attempt.launch_attempt_id}`;
  const cwd = workspaceLaunchProjectionCwd(attempt) ?? process.cwd();
  if (action === 'open-web-ui') {
    try {
      const host = await workspaceLaunchStartHiddenProjectionHost(command, cwd);
      return {
        schema: 'narada.workspace_launch.observed_projection.v1',
        observation_id: workspaceLaunchId('wlp'),
        launch_attempt_id: attempt.launch_attempt_id,
        projection_kind: projectionKind,
        session_id: sessionId,
        status: 'handed_off',
        command,
        authority: 'nars_client_projection_contract',
        ownership_posture: 'handoff_only',
        observed_at: new Date().toISOString(),
        message: `${projectionKind} projection host started hidden; browser projection owns visible operator surface.`,
        diagnostic: { ...host, command: redactWorkspaceLaunchCommand(command) },
      };
    } catch (error) {
      return {
        schema: 'narada.workspace_launch.observed_projection.v1',
        observation_id: workspaceLaunchId('wlp'),
        launch_attempt_id: attempt.launch_attempt_id,
        projection_kind: projectionKind,
        session_id: sessionId,
        status: 'failed',
        command,
        authority: 'nars_client_projection_contract',
        ownership_posture: 'handoff_only',
        observed_at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        diagnostic: { command: redactWorkspaceLaunchCommand(command) },
      };
    }
  }
  const wtArgs = ['new-tab', '--title', title, '-d', cwd, 'pwsh', '-NoExit', '-Command', command];
  const effectiveWtArgs = process.env.WT_SESSION ? ['-w', '0', ...wtArgs] : wtArgs;
  const terminalCaptureLog = process.env.NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG;
  try {
    const launch = terminalCaptureLog
      ? (await captureWorkspaceLaunchTerminalInvocation(terminalCaptureLog, effectiveWtArgs))
      : startOperatorTerminal('wt', effectiveWtArgs).result;
    if (launch.error) throw launch.error;
    if (launch.status !== 0) throw new Error(`projection_terminal_launch_failed: wt exited ${launch.status ?? 'unknown'}`);
    return {
      schema: 'narada.workspace_launch.observed_projection.v1',
      observation_id: workspaceLaunchId('wlp'),
      launch_attempt_id: attempt.launch_attempt_id,
      projection_kind: projectionKind,
      session_id: sessionId,
      status: 'handed_off',
      command,
      authority: 'nars_client_projection_contract',
      ownership_posture: 'handoff_only',
      observed_at: new Date().toISOString(),
      message: `${projectionKind} projection handoff accepted by operator terminal authority.`,
      diagnostic: { wt_args: redactWorkspaceLaunchArgv(effectiveWtArgs), wt_exit_code: launch.status ?? 0 },
    };
  } catch (error) {
    return {
      schema: 'narada.workspace_launch.observed_projection.v1',
      observation_id: workspaceLaunchId('wlp'),
      launch_attempt_id: attempt.launch_attempt_id,
      projection_kind: projectionKind,
      session_id: sessionId,
      status: 'failed',
      command,
      authority: 'nars_client_projection_contract',
      ownership_posture: 'handoff_only',
      observed_at: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      diagnostic: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

function workspaceLaunchProjectionSessionId(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.session_id) return observation.session_id;
  }
  return null;
}

function workspaceLaunchProjectionCwd(attempt: WorkspaceLaunchAttemptRecord): string | null {
  for (const observation of attempt.observations) {
    if (observation.site_root) return observation.site_root;
  }
  for (const handoff of attempt.handoffs) {
    if (handoff.cwd) return handoff.cwd;
  }
  return null;
}

function workspaceLaunchHandoffFromResult(launchAttemptId: string, result: unknown, success: boolean): WorkspaceLaunchHandoffRecord {
  const record = isRecord(result) ? result : {};
  const wtArgs = stringArray(record.wt_args);
  return {
    schema: 'narada.workspace_launch.handoff.v1',
    handoff_id: workspaceLaunchId('wlh'),
    launch_attempt_id: launchAttemptId,
    posture: 'operator_terminal',
    status: success ? 'handed_off' : 'failed',
    command: wtArgs.length > 0 ? 'wt' : null,
    argv_redacted: redactWorkspaceLaunchArgv(wtArgs),
    cwd: workspaceLaunchHandoffCwd(record),
    exit_code: typeof record.wt_exit_code === 'number' ? record.wt_exit_code : null,
    ownership_posture: 'handoff_only',
    diagnostic_ref: workspaceLaunchString(record.result_path),
  };
}

function workspaceLaunchFailedHandoff(launchAttemptId: string, error: unknown): WorkspaceLaunchHandoffRecord {
  return {
    schema: 'narada.workspace_launch.handoff.v1',
    handoff_id: workspaceLaunchId('wlh'),
    launch_attempt_id: launchAttemptId,
    posture: 'operator_terminal',
    status: 'failed',
    command: null,
    argv_redacted: [],
    cwd: null,
    exit_code: null,
    ownership_posture: 'handoff_only',
    diagnostic_ref: error instanceof Error ? error.message : String(error),
  };
}

function workspaceLaunchWaitingObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection): WorkspaceLaunchObservationRecord {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: null,
    site_root: null,
    health: 'waiting',
    authority: 'nars_session_management',
    ownership_posture: 'not_yet_observed',
    last_checked_at: new Date().toISOString(),
    message: `Waiting for NARS session discovery for ${selection.site.join(', ')} / ${selection.role.join(', ')}.`,
  };
}

export async function workspaceLaunchRuntimeObservations(
  launchAttemptId: string,
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
  expectedLaunchSessionIds: string[] = [],
): Promise<WorkspaceLaunchObservationRecord[]> {
  const siteRoots = workspaceLaunchSiteRootsForSelection(selection, records);
  if (siteRoots.length === 0) return [workspaceLaunchWaitingObservation(launchAttemptId, selection)];
  const expectedLaunchSessionIdSet = new Set(expectedLaunchSessionIds.map((value) => value.trim()).filter(Boolean));
  const pollBudgetMs = workspaceLaunchRuntimeObservationPollBudgetMs();
  const pollIntervalMs = workspaceLaunchRuntimeObservationPollIntervalMs();
  const deadline = Date.now() + pollBudgetMs;
  let sawDiscoveredSession = false;
  const staleCleanupAttempted = new Set<string>();

  while (true) {
    const discoveredSessions: Record<string, unknown>[] = [];
    const candidates: Record<string, unknown>[] = [];
    for (const siteRoot of siteRoots) {
      try {
        const initialDiscovery = discoverNarsSessions({ siteRoot });
        const healthBySessionId = await workspaceLaunchProbeHealthBySessionId(initialDiscovery.sessions);
        const discovery = healthBySessionId.size > 0 ? discoverNarsSessions({ siteRoot, healthBySessionId }) : initialDiscovery;
        for (const session of discovery.sessions) {
          const normalized = { ...session, site_root: session.site_root ?? siteRoot };
          discoveredSessions.push(normalized);
          if (!workspaceLaunchSessionMatchesSelection(normalized, selection)) continue;
          if (workspaceLaunchSessionMatchesExpectedLaunch(normalized, expectedLaunchSessionIdSet)) {
            candidates.push(normalized);
          } else if (workspaceLaunchSessionIsStaleSessionOwnedCandidate(normalized, expectedLaunchSessionIdSet)) {
            await workspaceLaunchRequestStaleSessionCleanup(normalized, staleCleanupAttempted);
          }
        }
      } catch {
        // Missing or unreadable session indexes keep the launch in waiting state; they are not launch failures.
      }
    }
    sawDiscoveredSession ||= discoveredSessions.length > 0;
    if (candidates.length === 0) {
      if (Date.now() >= deadline) break;
      await workspaceLaunchObservationPause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
      continue;
    }
    const activeCandidates = candidates.filter((session) => {
      const displayState = workspaceLaunchString(session.display_state);
      const terminalState = workspaceLaunchString(session.terminal_state);
      return terminalState !== 'closed' && (displayState === 'active' || displayState === 'starting_or_degraded' || displayState === 'stale');
    });
    const matched = activeCandidates.length > 0 ? activeCandidates : candidates;
    if (matched.length > 1) return [workspaceLaunchAmbiguousObservation(launchAttemptId, selection, matched)];
    return [workspaceLaunchObservationFromSession(launchAttemptId, matched[0])];
  }
  if (!sawDiscoveredSession) return [workspaceLaunchWaitingObservation(launchAttemptId, selection)];
  return [workspaceLaunchUnownedObservation(launchAttemptId, selection)];
}

function workspaceLaunchExpectedSessionIds(result: unknown): string[] {
  const resultRecord = isRecord(result) ? result : null;
  const selectedAgents = Array.isArray(resultRecord?.selected_agents) ? resultRecord.selected_agents : [];
  return selectedAgents
    .map((agent) => isRecord(agent) ? workspaceLaunchString(agent.launch_session_id) : null)
    .filter((value): value is string => Boolean(value));
}

function workspaceLaunchSessionMatchesExpectedLaunch(session: Record<string, unknown>, expectedLaunchSessionIds: Set<string>): boolean {
  if (expectedLaunchSessionIds.size === 0) return true;
  const launchSessionId = workspaceLaunchSessionLaunchSessionId(session);
  return launchSessionId !== null && expectedLaunchSessionIds.has(launchSessionId);
}

function workspaceLaunchSessionLaunchSessionId(session: Record<string, unknown>): string | null {
  const record = isRecord(session.record) ? session.record : null;
  const ownership = isRecord(session.process_ownership) ? session.process_ownership : isRecord(record?.process_ownership) ? record.process_ownership : null;
  return workspaceLaunchString(session.launch_session_id)
    ?? workspaceLaunchString(record?.launch_session_id)
    ?? workspaceLaunchString(ownership?.launch_session_id);
}

function workspaceLaunchSessionOwnership(session: Record<string, unknown>): Record<string, unknown> | null {
  const record = isRecord(session.record) ? session.record : null;
  return isRecord(session.process_ownership) ? session.process_ownership : isRecord(record?.process_ownership) ? record.process_ownership : null;
}

function workspaceLaunchSessionIsStaleSessionOwnedCandidate(session: Record<string, unknown>, expectedLaunchSessionIds: Set<string>): boolean {
  if (expectedLaunchSessionIds.size === 0) return false;
  if (!workspaceLaunchSessionOwnedCleanupAllowed(session)) return false;
  const launchSessionId = workspaceLaunchSessionLaunchSessionId(session);
  return launchSessionId !== null && !expectedLaunchSessionIds.has(launchSessionId);
}

function workspaceLaunchSessionOwnedCleanupAllowed(session: Record<string, unknown>): boolean {
  const ownership = workspaceLaunchSessionOwnership(session);
  return Boolean(ownership && ownership.ownership === 'session_owned' && ownership.cleanup_policy === 'terminate_with_launch_session');
}

function workspaceLaunchSessionIsTerminalForCleanup(session: Record<string, unknown>): boolean {
  const displayState = workspaceLaunchString(session.display_state);
  const terminalState = workspaceLaunchString(session.terminal_state);
  return terminalState === 'closed' || displayState === 'closed';
}

async function workspaceLaunchRequestStaleSessionCleanup(session: Record<string, unknown>, attempted: Set<string>): Promise<void> {
  const sessionId = workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id) ?? workspaceLaunchSessionLaunchSessionId(session);
  if (!sessionId || attempted.has(sessionId)) return;
  attempted.add(sessionId);
  const controlPath = workspaceLaunchControlPathFromSession(session);
  if (controlPath && existsSync(controlPath)) {
    const frame = {
      id: workspaceLaunchId('stale_cleanup'),
      method: 'session.close',
      params: {
        source: 'launcher-session-owned-process-cleanup',
        reason: 'stale_session_owned_launch_session_superseded',
        stale_launch_session_id: workspaceLaunchSessionLaunchSessionId(session),
      },
    };
    try {
      await appendFile(controlPath, `${JSON.stringify(frame)}\n`, 'utf8');
    } catch {
      // Process-tree termination below is the hard cleanup fallback for session-owned stale runtime processes.
    }
  }
  const ownership = workspaceLaunchSessionOwnership(session);
  const pid = workspaceLaunchInteger(session.pid) ?? workspaceLaunchInteger(ownership?.pid);
  if (pid && pid !== process.pid) workspaceLaunchTerminateStaleProcessTree(pid);
}

function workspaceLaunchTerminateStaleProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      runGovernedCommandSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    process.kill(pid, 'SIGTERM');
  } catch {
    // Cleanup is best-effort; launch observation must not fail because an already-dead process raced cleanup.
  }
}

function workspaceLaunchInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

async function workspaceLaunchProbeHealthBySessionId(sessions: Record<string, unknown>[]): Promise<Map<string, unknown>> {
  const healthBySessionId = new Map<string, unknown>();
  const pairs = await Promise.all(sessions.map(async (session) => {
    const sessionId = workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id);
    if (!sessionId) return null;
    const health = await workspaceLaunchProbeSessionHealth(session);
    return health === null ? null : [sessionId, health] as const;
  }));
  for (const pair of pairs) {
    if (pair !== null) healthBySessionId.set(pair[0], pair[1]);
  }
  return healthBySessionId;
}

async function workspaceLaunchProbeSessionHealth(session: Record<string, unknown>): Promise<unknown | null> {
  const record = isRecord(session.record) ? session.record : null;
  const endpoint = workspaceLaunchString(session.health_endpoint) ?? workspaceLaunchString(record?.health_endpoint);
  if (!endpoint) return null;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    const text = await response.text().catch(() => '');
    if (!response.ok) return { ok: false, status: 'unhealthy', http_status: response.status };
    if (text.trim()) {
      try {
        return JSON.parse(text);
      } catch {
        return { ok: true, status: 'healthy', text };
      }
    }
    return { ok: true, status: 'healthy' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function workspaceLaunchSiteRootsForSelection(selection: WorkspaceLaunchBrowserSelection, records: WorkspaceLaunchRecord[]): string[] {
  const selected = selectLaunchRecords(records, { all: true, site: selection.site, role: selection.role });
  return unique(selected.map((record) => resolve(record.site_root)));
}

function workspaceLaunchSessionMatchesSelection(session: Record<string, unknown>, selection: WorkspaceLaunchBrowserSelection): boolean {
  const roles = new Set(selection.role.map((role) => role.toLowerCase()));
  const sites = new Set(selection.site.map((site) => normalizeWorkspaceLaunchSiteToken(site)));
  const agentId = workspaceLaunchString(session.agent_id);
  const role = agentId ? agentId.split('.').filter(Boolean).at(-1)?.toLowerCase() : null;
  const siteId = workspaceLaunchString(session.site_id) ?? (agentId ? agentId.split('.')[0] : null);
  if (roles.size > 0 && role && !roles.has(role)) return false;
  if (sites.size > 0 && siteId && !sites.has(normalizeWorkspaceLaunchSiteToken(siteId))) return false;
  return true;
}

function workspaceLaunchObservationFromSession(launchAttemptId: string, session: Record<string, unknown>): WorkspaceLaunchObservationRecord {
  const health = workspaceLaunchHealthFromSession(session);
  const attachCommands = workspaceLaunchAttachCommandsFromSession(session);
  const controlPath = workspaceLaunchControlPathFromSession(session);
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id),
    site_root: workspaceLaunchString(session.site_root),
    health,
    authority: 'nars_session_management',
    ownership_posture: 'owned_by_runtime_authority',
    last_checked_at: new Date().toISOString(),
    message: `NARS session ${workspaceLaunchString(session.session_id) ?? workspaceLaunchString(session.carrier_session_id) ?? 'unknown'} is ${health}.`,
    control_path: controlPath,
    attach_commands: attachCommands,
  };
}

function workspaceLaunchControlPathFromSession(session: Record<string, unknown>): string | null {
  const record = isRecord(session.record) ? session.record : null;
  const direct = workspaceLaunchString(session.control_path) ?? workspaceLaunchString(record?.control_path);
  if (direct) return direct;
  const sessionPath = workspaceLaunchString(session.session_path) ?? workspaceLaunchString(record?.session_path);
  return sessionPath ? join(dirname(sessionPath), 'control.jsonl') : null;
}

function workspaceLaunchAttachCommandsFromSession(session: Record<string, unknown>): WorkspaceLaunchObservationRecord['attach_commands'] {
  const record = isRecord(session.record) ? session.record : null;
  const recordedCommands = isRecord(record?.attach_commands) ? record.attach_commands : null;
  const eventEndpoint = workspaceLaunchString(session.event_endpoint) ?? workspaceLaunchString(record?.event_endpoint);
  const healthEndpoint = workspaceLaunchString(session.health_endpoint) ?? workspaceLaunchString(record?.health_endpoint);
  return {
    agent_web_ui: workspaceLaunchString(recordedCommands?.agent_web_ui)
      ?? (eventEndpoint ? `narada-agent-web-ui --event-endpoint ${eventEndpoint}${healthEndpoint ? ` --health-endpoint ${healthEndpoint}` : ''}` : null),
    agent_cli: workspaceLaunchString(recordedCommands?.agent_cli)
      ?? (eventEndpoint ? `narada-agent-cli --attach ${eventEndpoint}` : null),
  };
}

function workspaceLaunchAmbiguousObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection, sessions: Record<string, unknown>[]): WorkspaceLaunchObservationRecord {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: null,
    site_root: null,
    health: 'ambiguous',
    authority: 'nars_session_management',
    ownership_posture: 'not_yet_observed',
    last_checked_at: new Date().toISOString(),
    message: `Found ${sessions.length} possible NARS sessions for ${selection.site.join(', ')} / ${selection.role.join(', ')}; operator selection is required before treating one as owned.`,
  };
}

function workspaceLaunchHealthFromSession(session: Record<string, unknown>): WorkspaceLaunchObservationRecord['health'] {
  const healthStatus = workspaceLaunchString(session.health_status);
  if (healthStatus === 'healthy') return 'healthy';
  const displayState = workspaceLaunchString(session.display_state);
  if (displayState === 'stale') return 'stale';
  if (displayState === 'closed' || workspaceLaunchString(session.terminal_state) === 'closed') return 'failed';
  if (displayState === 'active') return 'healthy';
  if (displayState === 'starting_or_degraded') return 'failed';
  return 'failed';
}

function workspaceLaunchUnownedObservation(launchAttemptId: string, selection: WorkspaceLaunchBrowserSelection): WorkspaceLaunchObservationRecord {
  return {
    schema: 'narada.workspace_launch.observed_runtime.v1',
    observation_id: workspaceLaunchId('wlr'),
    launch_attempt_id: launchAttemptId,
    kind: 'nars',
    session_id: null,
    site_root: null,
    health: 'unowned',
    authority: 'nars_session_management',
    ownership_posture: 'observed_unowned',
    last_checked_at: new Date().toISOString(),
    message: `Found NARS sessions for ${selection.site.join(', ')} / ${selection.role.join(', ')} but none matched the requested selection.`,
  };
}

function workspaceLaunchRuntimeObservationPollBudgetMs(): number {
  const raw = process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
}

function workspaceLaunchRuntimeObservationPollIntervalMs(): number {
  const raw = process.env.NARADA_WORKSPACE_LAUNCH_OBSERVATION_POLL_INTERVAL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
}

async function workspaceLaunchObservationPause(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWorkspaceLaunchSiteToken(value: string): string {
  return value.toLowerCase().replace(/^narada[-.]/, '').replace(/^narada/, '').replace(/^[-.]/, '');
}

function workspaceLaunchHandoffCwd(record: Record<string, unknown>): string | null {
  const selectedAgents = Array.isArray(record.selected_agents) ? record.selected_agents : [];
  const firstAgent = selectedAgents.find(isRecord);
  return firstAgent ? workspaceLaunchString(firstAgent.workspace_root) ?? workspaceLaunchString(firstAgent.site_root) : null;
}

function redactWorkspaceLaunchArgv(args: string[]): string[] {
  return args.map((arg) => {
    if (/api[_-]?key|token|secret|password/i.test(arg)) return '<redacted>';
    return arg;
  });
}

async function closeWorkspaceLaunchSelectionServer(server: Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
    server.closeAllConnections?.();
  });
}

function normalizeWorkspaceLaunchBrowserSelection(payload: Partial<WorkspaceLaunchBrowserSelection>): WorkspaceLaunchBrowserSelection {
  const site = stringArray(payload.site).filter(Boolean);
  const role = stringArray(payload.role).filter(Boolean);
  const operatorSurface = normalizeInteractiveOperatorSurfaceValues(stringArray(payload.operatorSurface).filter(Boolean));
  const runtime = nonEmpty(payload.runtime) ?? 'registry default';
  const intelligenceProvider = nonEmpty(payload.intelligenceProvider) ?? 'registry default';
  if (site.length === 0) throw new Error('interactive_selection_ui_site_required');
  if (role.length === 0) throw new Error('interactive_selection_ui_role_required');
  if (operatorSurface.length === 0) throw new Error('interactive_selection_ui_operator_surface_required');
  return { site, role, operatorSurface, runtime, intelligenceProvider };
}

function filterWorkspaceLaunchValues(values: string[] | undefined, allowed: string[]): string[] {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return unique(stringArray(values).filter((value) => allowedSet.has(value.toLowerCase())));
}

export function resolveWorkspaceLaunchBrowserSelection(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null,
): WorkspaceLaunchBrowserSelection {
  const siteChoices = unique(records.map((record) => record.site));
  const requestedSites = filterWorkspaceLaunchValues(options.site, siteChoices);
  const rememberedSites = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.site, siteChoices) : [];
  const selectedSites = requestedSites.length > 0 ? requestedSites : rememberedSites;

  const roleChoices = roleChoicesForSelectedSites(records, selectedSites);
  const requestedRoles = initialRoleValuesForInteractiveSelection(roleChoices, options.role);
  const rememberedRoles = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.role, roleChoices) : [];
  const selectedRoles = nonEmptyStringArray(options.role).length > 0 ? requestedRoles : (rememberedRoles.length > 0 ? rememberedRoles : requestedRoles);

  const selectedRecords = selectLaunchRecords(records, { ...options, all: true, site: selectedSites, role: selectedRoles });
  const operatorSurfaceChoices = unique([
    'registry default',
    ...selectedRecords.map((record) => record.carrier),
    'agent-cli',
    'agent-web-ui',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);
  const requestedOperatorSurfaces = initialOperatorSurfaceValues(operatorSurfaceChoices, options.operatorSurface);
  const rememberedOperatorSurfaces = rememberedSelection ? initialOperatorSurfaceValues(operatorSurfaceChoices, rememberedSelection.operatorSurface.join(',')) : [];
  const selectedOperatorSurfaces = options.operatorSurface ? requestedOperatorSurfaces : (rememberedOperatorSurfaces.length > 0 ? rememberedOperatorSurfaces : requestedOperatorSurfaces);

  const runtimeValues = unique([
    'registry default',
    ...selectedRecords.map((record) => record.runtime),
    'narada-agent-runtime-server',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);
  const requestedRuntime = nonEmpty(options.runtime);
  const rememberedRuntime = rememberedSelection && nonEmpty(rememberedSelection.runtime) && runtimeValues.includes(rememberedSelection.runtime)
    ? rememberedSelection.runtime
    : null;
  const selectedRuntime = requestedRuntime
    ? (runtimeValues.includes(requestedRuntime) ? requestedRuntime : 'registry default')
    : (rememberedRuntime ?? (options.runtime ?? 'registry default'));

  const providerOperatorSurface = selectedOperatorSurfaces.includes('agent-cli') ? 'agent-cli' : (selectedOperatorSurfaces[0] ?? 'registry default');
  const intelligenceProviderOptions = intelligenceProviderChoicesForLaunchSelection({
    records: selectedRecords,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime,
  });
  const providerValues = new Set(intelligenceProviderOptions.map((option) => option.value));
  const requestedProvider = nonEmpty(options.intelligenceProvider);
  const rememberedProvider = rememberedSelection && nonEmpty(rememberedSelection.intelligenceProvider) && providerValues.has(rememberedSelection.intelligenceProvider)
    ? rememberedSelection.intelligenceProvider
    : null;
  const selectedProvider = requestedProvider
    ? (providerValues.has(requestedProvider) ? requestedProvider : 'registry default')
    : (rememberedProvider ?? (options.intelligenceProvider ?? 'registry default'));

  return {
    site: selectedSites,
    role: selectedRoles,
    operatorSurface: selectedOperatorSurfaces,
    runtime: selectedRuntime,
    intelligenceProvider: selectedProvider,
  };
}

export function buildWorkspaceLaunchSelectionUiModel(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null = null,
): Record<string, unknown> {
  const resolvedSelection = resolveWorkspaceLaunchBrowserSelection(records, options, rememberedSelection);
  const selectedRecords = selectLaunchRecords(records, { ...options, all: true, site: resolvedSelection.site, role: resolvedSelection.role });
  const siteChoices = unique(records.map((record) => record.site));
  const operatorSurfaceChoices = unique([
    'registry default',
    ...selectedRecords.map((record) => record.carrier),
    'agent-cli',
    'agent-web-ui',
    'codex',
    'kimi',
    'pi',
    'claude-code',
    'opencode',
  ]);
  return {
    records,
    siteChoices,
    rememberedSelection,
    rememberedSelectionSemantics: {
      schema: 'narada.workspace_launch.remembered_selection_semantics.v1',
      role: 'form_defaults_only',
      binds_runtime_session: false,
      binds_carrier_session: false,
      binds_launch_session: false,
      launch_submission: 'always_creates_new_launch_session',
    },
    initialSites: resolvedSelection.site,
    initialRoles: resolvedSelection.role,
    initialOperatorSurfaces: resolvedSelection.operatorSurface,
    initialRuntime: resolvedSelection.runtime,
    initialIntelligenceProvider: resolvedSelection.intelligenceProvider,
    selectorModel: workspaceLaunchSelectorModel(records, resolvedSelection),
    explicitSelection: {
      site: nonEmptyStringArray(options.site).length > 0,
      role: nonEmptyStringArray(options.role).length > 0,
      operatorSurface: normalizeInteractiveOperatorSurfaceValues(options.operatorSurface ? options.operatorSurface.split(',') : []).length > 0,
      runtime: !!options.runtime,
      intelligenceProvider: !!options.intelligenceProvider,
    },
  };
}

export function buildWorkspaceLaunchSelectionHtml(model: Record<string, unknown>, options: { persistent?: boolean } = {}): string {
  const modelJsonBase64 = Buffer.from(JSON.stringify(model), 'utf8').toString('base64');
  const persistent = options.persistent === true;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Narada Workspace Launch</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 880px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 22px; margin: 0 0 20px; }
    fieldset { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; margin: 0 0 18px; padding: 14px 16px; }
    legend { padding: 0 6px; font-weight: 650; }
    label { display: flex; gap: 10px; align-items: center; padding: 7px 0; }
    select { width: min(100%, 420px); padding: 8px; }
    .actions { display: flex; gap: 12px; margin-top: 22px; }
    button { padding: 9px 14px; border-radius: 7px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); background: ButtonFace; color: ButtonText; cursor: pointer; }
    button.primary { background: Highlight; color: HighlightText; border-color: Highlight; }
    .hint { color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 13px; margin-top: 4px; }
    .stage-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0 0 20px; }
    .stage-card { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; padding: 10px 12px; background: color-mix(in srgb, CanvasText 3%, transparent); }
    .stage-card strong { display: block; font-size: 13px; margin-bottom: 4px; }
    .stage-card span { display: block; color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 12px; line-height: 1.35; }
    #status { margin-top: 18px; padding: 12px 14px; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; white-space: pre-wrap; }
    #status:empty { display: none; }
    .dashboard { margin-top: 30px; }
    .dashboard h2 { font-size: 18px; margin: 0 0 12px; }
    .attempt-list { display: grid; gap: 12px; }
    .attempt { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; padding: 14px 16px; }
    .attempt header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
    .attempt-title { font-weight: 700; }
    .attempt-status { color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 13px; }
    .attempt-meta, .attempt-line { color: color-mix(in srgb, CanvasText 78%, transparent); font-size: 13px; margin-top: 6px; }
    .attempt-scope-note { color: color-mix(in srgb, CanvasText 72%, transparent); font-size: 12px; margin-top: 10px; border-left: 3px solid color-mix(in srgb, CanvasText 22%, transparent); padding-left: 9px; }
    .attempt-stage-list { display: grid; gap: 6px; margin-top: 12px; }
    .attempt-stage { display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 10px; align-items: baseline; border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); border-radius: 6px; padding: 7px 9px; }
    .attempt-stage-name { color: color-mix(in srgb, CanvasText 62%, transparent); font-size: 12px; font-weight: 650; }
    .attempt-stage-value { min-width: 0; color: color-mix(in srgb, CanvasText 82%, transparent); font-size: 13px; overflow-wrap: anywhere; }
    .attempt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .attempt-actions button { padding: 6px 10px; }
    .attempt-actions button:disabled { cursor: not-allowed; opacity: 0.52; }
    .attempt-actions button[data-group="danger"] { border-color: color-mix(in srgb, #c23535 48%, CanvasText 20%); }
    .attempt-actions button[data-group="create"] { border-color: color-mix(in srgb, Highlight 46%, CanvasText 20%); }
    details { margin-top: 10px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; background: color-mix(in srgb, CanvasText 5%, transparent); padding: 10px; border-radius: 6px; }
    @media (max-width: 720px) { .stage-strip { grid-template-columns: 1fr; } .attempt header { display: grid; } .attempt-stage { grid-template-columns: 1fr; gap: 2px; } }
  </style>
</head>
<body>
  <main>
    <h1>Narada Workspace Launch</h1>
    <section class="stage-strip" aria-label="Launch stages">
      <div class="stage-card"><strong>1. Configure</strong><span>Choose the Site, role, runtime, surface, and model defaults for a fresh launch.</span></div>
      <div class="stage-card"><strong>2. Start New</strong><span>Submitting the form creates a new launch attempt; it does not attach to an old session.</span></div>
      <div class="stage-card"><strong>3. Attach Explicitly</strong><span>Use result-card actions only when you want to open or attach to that specific launched session.</span></div>
    </section>
    <form id="form">
      <fieldset><legend>Sites</legend><div id="sites"></div></fieldset>
      <fieldset><legend>Roles</legend><div id="roles"></div></fieldset>
      <fieldset><legend>Operator Surfaces</legend><div id="surfaces"></div><div class="hint">Explicit choices override registry default.</div></fieldset>
      <fieldset><legend>Runtime</legend><select id="runtime"></select></fieldset>
      <fieldset><legend>Intelligence Provider</legend><select id="provider"></select></fieldset>
      <div class="hint">Remembered selections are defaults only. They do not bind to any old launch, carrier, runtime, or conversation.</div>
      <div class="actions"><button class="primary" type="submit">Start New Session</button><button id="cancel" type="button">Cancel</button></div>
      <div class="hint">${persistent ? 'Form submission always creates a new launch session. Use launched-session actions below only when you explicitly want to open or attach to an existing result.' : 'This page submits one new launch session and then returns control to the terminal.'}</div>
      <div id="status" role="status" aria-live="polite"></div>
    </form>
    <section class="dashboard" aria-labelledby="launches-title">
      <h2 id="launches-title">Launch Results</h2>
      <div id="launches" class="attempt-list"><p class="hint">No launches yet.</p></div>
    </section>
  </main>
  <script>
    const model = JSON.parse(atob('${modelJsonBase64}'));
    const persistent = ${persistent ? 'true' : 'false'};
    const unique = values => [...new Set(values.filter(Boolean))];
    const explicit = model.explicitSelection || {};
    const validSites = new Set(model.siteChoices || []);
    const initialSites = model.initialSites || [];
    const selectedSites = new Set(initialSites);
    const selectedRoles = new Set(model.initialRoles || []);
    const selectedSurfaces = new Set(model.initialOperatorSurfaces || ['registry default']);
    let currentSelectorModel = model.selectorModel || {};
    let selectorRefreshSequence = 0;
    if (currentSelectorModel.selected) {
      if (model.initialRuntime) currentSelectorModel.selected.runtime = model.initialRuntime;
      if (model.initialIntelligenceProvider) currentSelectorModel.selected.intelligenceProvider = model.initialIntelligenceProvider;
    }
    const recordsForSites = () => model.records.filter(r => selectedSites.has(r.site));
    const recordsForSitesRoles = () => recordsForSites().filter(r => selectedRoles.has(r.role));
    function checkbox(container, value, checked, onChange, label = value) {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = value; input.checked = checked;
      input.addEventListener('change', () => onChange(input));
      row.append(input, document.createTextNode(label)); container.append(row);
    }
    function renderSites() {
      const el = document.getElementById('sites'); el.textContent = '';
      model.siteChoices.forEach(site => checkbox(el, site, selectedSites.has(site), input => { input.checked ? selectedSites.add(site) : selectedSites.delete(site); renderRoles(); refreshSelectorControls().catch(() => {}); }));
    }
    function renderRoles() {
      const choices = unique(recordsForSites().map(r => r.role));
      for (const role of [...selectedRoles]) if (!choices.includes(role)) selectedRoles.delete(role);
      if (selectedRoles.size === 0 && choices.includes('resident')) selectedRoles.add('resident');
      const el = document.getElementById('roles'); el.textContent = '';
      choices.forEach(role => checkbox(el, role, selectedRoles.has(role), input => { input.checked ? selectedRoles.add(role) : selectedRoles.delete(role); refreshSelectorControls().catch(() => {}); }));
    }
    function syncSelectedSet(set, options, fallback) {
      const values = new Set((options || []).map(option => option.value));
      for (const value of [...set]) if (!values.has(value)) set.delete(value);
      if (set.size === 0 && values.has(fallback)) set.add(fallback);
    }
    function renderSurfaces(options) {
      syncSelectedSet(selectedSurfaces, options, 'registry default');
      const el = document.getElementById('surfaces'); el.textContent = '';
      (options || []).forEach(option => checkbox(el, option.value, selectedSurfaces.has(option.value), input => { input.checked ? selectedSurfaces.add(option.value) : selectedSurfaces.delete(option.value); refreshSelectorControls().catch(() => {}); }, option.label));
    }
    function renderSelect(id, options, selected) {
      const el = document.getElementById(id); el.textContent = '';
      const values = new Set((options || []).map(option => option.value));
      const selectedValue = values.has(selected) ? selected : 'registry default';
      (options || []).forEach(choice => { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; if (choice.hint) option.title = choice.hint; option.selected = choice.value === selectedValue; el.append(option); });
    }
    function currentSelectValue(id) {
      const el = document.getElementById(id);
      return el && el.value ? el.value : null;
    }
    function selectorPayload() {
      return { site: [...selectedSites], role: [...selectedRoles], operatorSurface: [...selectedSurfaces], runtime: document.getElementById('runtime').value || currentSelectorModel.selected?.runtime || 'registry default', intelligenceProvider: document.getElementById('provider').value || currentSelectorModel.selected?.intelligenceProvider || 'registry default' };
    }
    async function refreshSelectorControls() {
      const requestSequence = ++selectorRefreshSequence;
      const requested = selectorPayload();
      const response = await fetch('/selector-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requested) });
      if (requestSequence !== selectorRefreshSequence) return;
      if (response.ok) currentSelectorModel = await response.json();
      const runtimeSelection = currentSelectValue('runtime') || requested.runtime || currentSelectorModel.selected?.runtime || 'registry default';
      const providerSelection = currentSelectValue('provider') || requested.intelligenceProvider || currentSelectorModel.selected?.intelligenceProvider || 'registry default';
      renderSurfaces(currentSelectorModel.operatorSurfaceOptions || []);
      renderSelect('runtime', currentSelectorModel.runtimeOptions || [], runtimeSelection);
      renderSelect('provider', currentSelectorModel.intelligenceProviderOptions || [], providerSelection);
    }
    function statusLabel(value) {
      return String(value || '').replace(/_/g, ' ');
    }
    function actionLabel(value, historical = false) {
      const labels = {
        'open-web-ui': historical ? 'Open Last Observed UI' : 'Open This UI',
        'attach-cli': historical ? 'Attach Last Observed CLI' : 'Attach CLI To This Session',
        'stop-runtime': 'Stop This Runtime Tree',
        recheck: 'Recheck This Launch',
        retry: 'Start Fresh From This Result',
        forget: 'Forget This Result',
      };
      return labels[value] || statusLabel(value);
    }
    function actionScope(value) {
      const scopes = {
        'open-web-ui': 'Opens the UI projection recorded for this launch result.',
        'attach-cli': 'Prints or runs the attach path for this exact session.',
        'stop-runtime': 'Requests stop through this session control path and its owned descendant process tree.',
        recheck: 'Refreshes observations for this launch result only.',
        retry: 'Creates a new launch attempt from this result selection, not from the current form; it does not resume this session.',
        forget: 'Removes this result card from the launcher dashboard only.',
      };
      return scopes[value] || 'Runs this launch-result action.';
    }
    function actionGroup(value) {
      if (value === 'recheck') return 'inspect';
      if (value === 'open-web-ui' || value === 'attach-cli') return 'attach';
      if (value === 'retry') return 'create';
      if (value === 'stop-runtime') return 'danger';
      return 'manage';
    }
    function formatAge(timestamp) {
      if (!timestamp) return null;
      const ms = Date.parse(timestamp);
      if (!Number.isFinite(ms)) return timestamp;
      const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (seconds < 60) return seconds + 's ago';
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return minutes + 'm ago';
      const hours = Math.round(minutes / 60);
      if (hours < 48) return hours + 'h ago';
      const days = Math.round(hours / 24);
      return days + 'd ago';
    }
    function attemptTitle(attempt) {
      const selection = attempt.selection || {};
      return (selection.site || []).join(', ') + ' / ' + (selection.role || []).join(', ');
    }
    function attemptMeta(attempt) {
      const selection = attempt.selection || {};
      return [(selection.operatorSurface || []).join(' + '), selection.runtime, selection.intelligenceProvider].filter(Boolean).join(' · ');
    }
    function attemptUpdatedAt(attempt) {
      return attempt.updated_at || attempt.created_at || attempt.started_at || null;
    }
    function attemptIsHistorical(attempt) {
      const observations = attempt.observations || [];
      const projections = attempt.projections || [];
      const liveish = observations.some(value => value && /ok|healthy|ready|busy|running|observed/i.test(String(value.health || '')))
        || projections.some(value => value && /handed off|handed_off|planned/i.test(String(value.status || '')));
      return !liveish;
    }
    function attemptHistoryStatus(attempt) {
      const updatedAt = attemptUpdatedAt(attempt);
      const age = formatAge(updatedAt);
      const suffix = updatedAt ? ' · last updated ' + (age ? age + ' (' + updatedAt + ')' : updatedAt) : '';
      if (!attemptIsHistorical(attempt)) return 'last observation recorded' + suffix;
      return 'historical result; recheck before attaching' + suffix;
    }
    function firstStatus(entries, key) {
      const entry = (entries || []).find(value => value && value[key]);
      return entry ? statusLabel(entry[key]) : null;
    }
    function agentInputStageValue(attempt) {
      const observation = (attempt.observations || []).find(value => value && (value.session_id || value.health));
      if (!observation) return 'Not verified by this launcher result.';
      const health = statusLabel(observation.health || 'observed');
      if (/busy|active turn|thinking/i.test(health)) return 'Runtime observed, but current turn may still be active.';
      if (/degraded|stale|unavailable|failed|closed/i.test(health)) return 'Runtime observed as ' + health + '; input readiness is not guaranteed.';
      return 'Runtime observed as ' + health + '; use the opened UI to verify turn responsiveness.';
    }
    function attemptStageRows(attempt) {
      const actions = new Set(attempt.actions || []);
      const historical = attemptIsHistorical(attempt);
      const runtimeHealth = firstStatus(attempt.observations, 'health');
      const projectionStatus = firstStatus(attempt.projections, 'status');
      const handoffStatus = firstStatus(attempt.handoffs, 'status');
      const attachActions = [];
      if (actions.has('open-web-ui')) attachActions.push(actionLabel('open-web-ui', historical));
      if (actions.has('attach-cli')) attachActions.push(actionLabel('attach-cli', historical));
      return [
        { name: 'Configure', value: 'Selection recorded as launch input only.' },
        { name: 'Start New', value: attempt.result_summary || statusLabel(attempt.status) || 'Launch attempt recorded.' },
        { name: 'Process', value: runtimeHealth ? 'Observed ' + runtimeHealth : (handoffStatus ? 'Handoff ' + handoffStatus : 'No runtime observation yet.') },
        { name: 'UI Projection', value: projectionStatus ? 'UI projection ' + projectionStatus : 'No UI projection observation yet.' },
        { name: 'Agent Input', value: agentInputStageValue(attempt) },
        { name: 'Attach/Open', value: attachActions.length ? 'Available actions: ' + attachActions.join(', ') : 'No attach/open action is currently available.' },
      ];
    }
    function renderDashboard(state) {
      const el = document.getElementById('launches');
      const attempts = state && Array.isArray(state.attempts) ? state.attempts : [];
      el.textContent = '';
      if (attempts.length === 0) {
        const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No launches yet.'; el.append(empty); return;
      }
      for (const attempt of attempts) {
        const card = document.createElement('article'); card.className = 'attempt'; card.dataset.launchAttemptId = attempt.launch_attempt_id;
        const header = document.createElement('header');
        const title = document.createElement('div'); title.className = 'attempt-title'; title.textContent = attemptTitle(attempt);
        const statusEl = document.createElement('div'); statusEl.className = 'attempt-status'; statusEl.textContent = statusLabel(attempt.status);
        header.append(title, statusEl); card.append(header);
        const meta = document.createElement('div'); meta.className = 'attempt-meta'; meta.textContent = attemptMeta(attempt); card.append(meta);
        const history = document.createElement('div'); history.className = 'attempt-line'; history.textContent = attemptHistoryStatus(attempt); card.append(history);
        const summary = document.createElement('div'); summary.className = 'attempt-line'; summary.textContent = attempt.result_summary || ''; card.append(summary);
        const stages = document.createElement('div'); stages.className = 'attempt-stage-list'; stages.setAttribute('aria-label', 'Launch transition stages');
        for (const row of attemptStageRows(attempt)) {
          const stage = document.createElement('div'); stage.className = 'attempt-stage';
          const name = document.createElement('span'); name.className = 'attempt-stage-name'; name.textContent = row.name;
          const value = document.createElement('span'); value.className = 'attempt-stage-value'; value.textContent = row.value;
          stage.append(name, value); stages.append(stage);
        }
        card.append(stages);
        for (const handoff of attempt.handoffs || []) {
          const line = document.createElement('div'); line.className = 'attempt-line'; line.textContent = 'Terminal handoff: ' + statusLabel(handoff.status); card.append(line);
        }
        for (const observation of attempt.observations || []) {
          const line = document.createElement('div'); line.className = 'attempt-line'; line.textContent = 'Runtime: ' + statusLabel(observation.health) + (observation.session_id ? ' · session ' + observation.session_id : ''); card.append(line);
        }
        for (const projection of attempt.projections || []) {
          const line = document.createElement('div'); line.className = 'attempt-line'; line.textContent = 'Projection: ' + projection.projection_kind + ' · ' + statusLabel(projection.status); card.append(line);
        }
        if ((attempt.actions || []).includes('stop-runtime')) {
          const scope = document.createElement('div'); scope.className = 'attempt-scope-note'; scope.textContent = 'Stop scope: this session control path and its owned descendant process tree only.'; card.append(scope);
        }
        const actions = document.createElement('div'); actions.className = 'attempt-actions';
        const historical = attemptIsHistorical(attempt);
        for (const action of attempt.actions || []) {
          if (action === 'stop-projection' || action === 'kill-process') continue;
          const button = document.createElement('button'); button.type = 'button'; button.dataset.action = action; button.dataset.launchAttemptId = attempt.launch_attempt_id; button.dataset.group = actionGroup(action); button.textContent = actionLabel(action, historical); button.title = actionScope(action); button.setAttribute('aria-label', actionLabel(action, historical) + '. ' + actionScope(action));
          if (historical && (action === 'open-web-ui' || action === 'attach-cli')) {
            button.disabled = true;
            button.title = 'Recheck this launch before using last-observed attach actions.';
            button.setAttribute('aria-label', actionLabel(action, true) + '. Disabled until Recheck This Launch refreshes this result.');
          }
          actions.append(button);
        }
        card.append(actions);
        const details = document.createElement('details');
        const summaryEl = document.createElement('summary'); summaryEl.textContent = 'Details';
        const pre = document.createElement('pre'); pre.textContent = JSON.stringify(attempt, null, 2);
        details.append(summaryEl, pre); card.append(details);
        el.append(card);
      }
    }
    async function loadLaunches() {
      const response = await fetch('/launches');
      if (!response.ok) return;
      renderDashboard(await response.json());
    }
    async function runLaunchAction(action, launchAttemptId) {
      const status = document.getElementById('status');
      if (action !== 'stop-runtime') {
        for (const button of document.querySelectorAll('button[data-action="stop-runtime"]')) {
          delete button.dataset.confirmStop;
          button.textContent = actionLabel('stop-runtime');
          button.title = actionScope('stop-runtime');
          button.setAttribute('aria-label', actionLabel('stop-runtime') + '. ' + actionScope('stop-runtime'));
        }
      }
      if (action === 'stop-runtime') {
        const button = [...document.querySelectorAll('button[data-action="stop-runtime"]')].find(candidate => candidate.dataset.launchAttemptId === launchAttemptId);
        if (button && button.dataset.confirmStop !== 'true') {
          button.dataset.confirmStop = 'true';
          button.textContent = 'Confirm Stop This Runtime Tree';
          button.title = 'Second click confirms stopping this session control path and its owned descendant process tree.';
          button.setAttribute('aria-label', 'Confirm Stop This Runtime Tree. Second click confirms stopping this session control path and its owned descendant process tree.');
          status.textContent = 'Confirm stop only if you intend to close this session control path and its owned descendant process tree.';
          return;
        }
      }
      status.textContent = actionLabel(action) + '...';
      const response = await fetch('/launches/' + encodeURIComponent(launchAttemptId) + '/' + encodeURIComponent(action), { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      renderDashboard(result.dashboard || result);
      status.textContent = response.ok
        ? (result.message || actionLabel(action) + ' completed.') + (result.command ? String.fromCharCode(10) + result.command : '')
        : 'Action refused: ' + (result.message || result.reason_code || response.statusText);
    }
    renderSites(); renderRoles(); refreshSelectorControls().catch(() => {});
    document.getElementById('form').addEventListener('submit', async event => {
      event.preventDefault();
      const status = document.getElementById('status');
      const submit = event.submitter || document.querySelector('button[type="submit"]');
      const operatorSurface = [...selectedSurfaces];
      const explicit = operatorSurface.filter(value => value !== 'registry default');
      const payload = { site: [...selectedSites], role: [...selectedRoles], operatorSurface: explicit.length ? explicit : operatorSurface, runtime: document.getElementById('runtime').value, intelligenceProvider: document.getElementById('provider').value };
      if (submit) submit.disabled = true;
      status.textContent = 'Creating a fresh launch attempt. This does not attach to any previous session.';
      try {
        const response = await fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          status.textContent = persistent
            ? 'New launch accepted. Open or attach only from the specific result card below.'
            : 'New launch submitted. You can return to the terminal.';
          renderDashboard(result.dashboard || {});
          if (!persistent) document.body.innerHTML = '<main><h1>New launch submitted</h1><p>You can return to the terminal.</p></main>';
        } else {
          status.textContent = 'Launch failed: ' + (result.error || result.status || response.statusText);
          if (result.dashboard) renderDashboard(result.dashboard);
        }
      } catch (error) {
        status.textContent = 'Launch failed: ' + (error && error.message ? error.message : String(error));
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    document.getElementById('launches').addEventListener('click', async event => {
      const button = event.target instanceof HTMLButtonElement ? event.target : null;
      if (!button || !button.dataset.action || !button.dataset.launchAttemptId) return;
      await runLaunchAction(button.dataset.action, button.dataset.launchAttemptId);
    });
    loadLaunches().catch(() => {});
    document.getElementById('cancel').addEventListener('click', async () => { await fetch('/cancel', { method: 'POST' }); document.body.innerHTML = '<main><h1>Cancelled</h1></main>'; });
  </script>
</body>
</html>`;
}

export function registryDefaultOperatorSurfaceLabel(records: WorkspaceLaunchRecord[]): string {
  const defaults = unique(records.map((record) => record.operator_surface).filter(Boolean));
  return defaults.length > 0 ? `registry default (${defaults.join(', ')})` : 'registry default';
}

export function registryDefaultRuntimeLabel(records: WorkspaceLaunchRecord[]): string {
  const defaults = unique(records.map((record) => record.runtime).filter(Boolean));
  return defaults.length > 0 ? `registry default (${defaults.join(', ')})` : 'registry default';
}

export function registryDefaultIntelligenceProviderLabel(defaultProvider?: string): string {
  return defaultProvider ? `registry default (${defaultProvider})` : 'registry default';
}

export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  if (!current) return ['registry default'];
  const explicit = normalizeCarrierList(current).filter((value) => choices.some((choice) => choice.toLowerCase() === value.toLowerCase()));
  return explicit.length > 0 ? explicit : ['registry default'];
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  const normalized = unique(values);
  const explicit = normalized.filter((value) => value !== 'registry default');
  if (explicit.length > 0) return explicit;
  if (normalized.includes('registry default')) return ['registry default'];
  return normalized;
}

export function intelligenceProviderChoicesForLaunchSelection({
  records,
  operatorSurface,
  runtime,
}: {
  records: WorkspaceLaunchRecord[];
  operatorSurface: string;
  runtime: string;
}): Array<{ value: string; label: string; hint?: string }> {
  const narsSurfaceRecords = records.filter((record) => {
    const selection = resolveWorkspaceCarrierRuntimeSelection(
      operatorSurface === 'registry default' ? record.operator_surface : operatorSurface,
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
      label: registryDefaultIntelligenceProviderLabel(providerRegistry.default_provider),
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
  const result = runGovernedCommandSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
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
  const explicitSite = nonEmpty(agent.Site) ?? nonEmpty(registry.Site) ?? null;
  if (!agentId.includes('.') && !explicitSite) {
    throw new Error(`site_local_agent_requires_explicit_site: ${agentId} in ${configPath}`);
  }
  const naradaRoot = nonEmpty(agent.NaradaRoot) ?? nonEmpty(registry.NaradaRoot);
  if (!naradaRoot) throw new Error(`agent_narada_root_missing: ${agentId} in ${configPath}`);
  const siteRoot = nonEmpty(agent.SiteRoot) ?? nonEmpty(registry.SiteRoot) ?? naradaRoot;
  const workspaceRoot = nonEmpty(agent.WorkspaceRoot) ?? nonEmpty(registry.WorkspaceRoot) ?? null;
  const launcher = nonEmpty(agent.Launcher) ?? nonEmpty(registry.Launcher);
  const launcherPath = nonEmpty(agent.LauncherPath) ?? nonEmpty(registry.LauncherPath)
    ?? (launcher ? join(naradaRoot, launcher) : join(naradaRoot, 'narada-andrey.ps1'));
  const operatorSurface = nonEmpty(agent.OperatorSurface) ?? nonEmpty(registry.OperatorSurface) ?? 'codex';
  const carrier = operatorSurface;
  const runtime = nonEmpty(agent.Runtime) ?? nonEmpty(registry.Runtime) ?? defaultRuntimeForCarrier(carrier);
  const authority = nonEmpty(agent.Authority) ?? nonEmpty(registry.Authority) ?? null;
  const role = nonEmpty(agent.Role) ?? (agentId.split('.').at(-1) ?? agentId).replace(/\d+$/, '');
  const resolvedAgentIdentityRef = resolveAgentIdentityRef(agentId, { site_id: explicitSite, role });
  const agentIdentityRef = resolvedAgentIdentityRef.status === 'resolved' ? resolvedAgentIdentityRef.value : buildAgentIdentityRefV2({
    identity_scope: explicitSite ? { kind: 'narada_site', site_id: explicitSite } : { kind: 'unscoped' },
    local_agent_id: agentId.split('.').at(-1) ?? agentId,
    role,
    legacy_agent_id: agentId,
  });
  const agentIdentitySite = agentIdentityRef.identity_scope.kind === 'narada_site'
    ? agentIdentityRef.identity_scope.site_id
    : null;
  return {
    agent: agentId,
    agent_identity_ref: agentIdentityRef,
    title: nonEmpty(agent.Title) ?? agentId.split('.').at(-1) ?? agentId,
    role,
    site: agentIdentitySite ?? agentId.split('.')[0] ?? agentId,
    narada_root: naradaRoot,
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    launcher_path: launcherPath,
    operator_surface: operatorSurface,
    carrier,
    runtime,
    authority,
    enable_native_shell: agent.EnableNativeShell === true,
    mcp_scope: nonEmpty(agent.McpScope) ?? nonEmpty(registry.McpScope) ?? null,
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
  const operatorSurfaceInput = options.operatorSurface ?? record.operator_surface;
  const launchCarriers = normalizeCarrierList(operatorSurfaceInput);
  const primaryCarrierInput = launchCarriers.includes('agent-cli') ? 'agent-cli' : launchCarriers[0] ?? operatorSurfaceInput;
  const runtimeInput = options.runtime ?? record.runtime;
  const carrierRuntimeSelection = resolveWorkspaceCarrierRuntimeSelection(primaryCarrierInput, runtimeInput);
  const launchCarrier = carrierRuntimeSelection.carrier_kind;
  const operatorSurfaceKind = carrierRuntimeSelection.operator_surface_kind;
  const launchRuntime = carrierRuntimeSelection.runtime_substrate_kind;
  const runtimeHostKind = carrierRuntimeSelection.runtime_host_kind;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const mcpScope = normalizeMcpScope(options.mcpScope ?? record.mcp_scope ?? undefined);
  const authority = normalizeRuntimeAuthority(options.authority ?? record.authority ?? undefined);
  const waitForEnter = options.noWaitForEnterBeforeExec !== true && launchCarriers[0] !== 'agent-web-ui';
  const isNarsOperatorSurface = launchCarrier === 'agent-cli' || launchCarrier === 'agent-web-ui';
  const intelligenceProvider = isNarsOperatorSurface
    ? (options.intelligenceProvider ?? providerRegistry.default_provider ?? null)
    : null;
  const cloudflareApiBaseUrl = options.cloudflareApiBaseUrl?.trim()
    || process.env.NARADA_CLOUDFLARE_NARS_PROJECTION_URL
    || process.env.CLOUDFLARE_NARS_PROJECTION_URL
    || null;
  const naradaProper = resolve(process.env.NARADA_PROPER_ROOT ?? 'D:/code/narada');
  const launchSessionToken = workspaceLaunchSessionToken(record);
  const launchSessionId = launchSessionIdFromToken(launchSessionToken);
  const launchBindingPath = launchCarriers.includes('agent-web-ui')
    ? operatorProjectionLaunchBindingPath(record, launchSessionToken)
    : null;
  const processOwnership = launchSessionId
    ? buildLaunchProcessOwnership({
        launchSessionId,
        processRole: 'workspace_launch_plan',
        siteRoot: record.site_root,
        workspaceRoot: record.workspace_root ?? record.narada_root,
        createdByPid: process.pid,
      })
    : null;
  const qualifiedAgentId = workspaceLaunchQualifiedAgentId(record);
  const operatorSurfaceStartCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    'operator-surface',
    'runtime',
    'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--target-site-id', record.site,
    '--runtime', launchRuntime,
    '--exec',
    '--format', 'human',
  ];
  if (record.workspace_root) operatorSurfaceStartCommand.push('--workspace-root', record.workspace_root);
  if (enableNativeShell) operatorSurfaceStartCommand.push('--enable-native-shell');
  operatorSurfaceStartCommand.push('--authority', authority);
  if (intelligenceProvider) operatorSurfaceStartCommand.push('--intelligence-provider', intelligenceProvider);
  operatorSurfaceStartCommand.push('--mcp-scope', mcpScope);
  if (launchBindingPath) operatorSurfaceStartCommand.push('--launch-binding', launchBindingPath);
  if (!launchBindingPath) operatorSurfaceStartCommand.push('--launch-session-id', launchSessionId ?? '');
  if (waitForEnter) operatorSurfaceStartCommand.push('--wait');

  const base = [
    'new-tab',
    '--title', `${qualifiedAgentId} runtime`,
    '-d', record.workspace_root ?? record.narada_root,
    'pwsh',
    '-NoExit',
    '-Command',
    toPowerShellCommand(operatorSurfaceStartCommand),
  ];
  const wtArgs = [...base];
  if (launchCarrier === 'agent-web-ui') {
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath));
  }
  for (const extraCarrier of launchCarriers.filter((carrier) => carrier !== launchCarrier)) {
    if (extraCarrier !== 'agent-web-ui') {
      throw new Error(`unsupported_multi_carrier_projection: ${extraCarrier}`);
    }
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath));
  }

  const smokeCommand = [
    'narada', 'operator-surface', 'runtime', 'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--target-site-id', record.site,
    '--runtime', launchRuntime,
    '--dry-run',
    '--format', 'json',
  ];
  if (record.workspace_root) smokeCommand.push('--workspace-root', record.workspace_root);
  smokeCommand.push('--authority', authority);
  if (intelligenceProvider) smokeCommand.push('--intelligence-provider', intelligenceProvider);
  if (enableNativeShell) smokeCommand.push('--enable-native-shell');
  smokeCommand.push('--mcp-scope', mcpScope);
  if (launchBindingPath) smokeCommand.push('--launch-binding', launchBindingPath);
  if (!launchBindingPath) smokeCommand.push('--launch-session-id', launchSessionId ?? '');
  const operatorProjectionOpenRequests = launchCarriers.includes('agent-web-ui')
    ? [plannedAgentWebUiProjectionOpenRequest(record)]
    : [];

  return {
    ...record,
    operator_surface: operatorSurfaceKind,
    carrier: launchCarrier,
    operator_surface_kind: operatorSurfaceKind,
    runtime_host_kind: runtimeHostKind,
    launch_operator_surface: launchCarrier,
    launch_operator_surfaces: launchCarriers,
    launch_runtime_host: runtimeHostKind,
    launch_runtime_hosts: [runtimeHostKind],
    launch_carrier: launchCarrier,
    launch_runtime: launchRuntime,
    launch_carriers: launchCarriers,
    launch_session_id: launchSessionId,
    process_ownership: processOwnership as Record<string, unknown> | null,
    legacy_carrier_compatibility: legacyCarrierCompatibility(),
    intelligence_provider: intelligenceProvider,
    authority,
    wait_for_enter_before_exec: waitForEnter,
    mcp_scope: mcpScope,
    enable_native_shell: enableNativeShell,
    wt_args: wtArgs,
    smoke_command: smokeCommand,
    operator_projection_launch_binding: launchBindingPath
      ? {
          schema: 'narada.operator_projection_launch_binding_ref.v1',
          path: launchBindingPath,
          exact_attach_required: true,
        }
      : null,
    operator_projection_open_requests: operatorProjectionOpenRequests,
  };
}

function normalizeCarrierList(value: string | undefined): string[] {
  const carriers = String(value ?? 'agent-cli')
    .split(',')
    .map((item) => nonEmpty(item))
    .filter((item): item is string => Boolean(item));
  return unique(carriers.length > 0 ? carriers : ['agent-cli']);
}

function workspaceLaunchSessionToken(record: WorkspaceLaunchRecord): string {
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, '');
  return `${stamp}-${safePathToken(record.site)}-${safePathToken(record.role)}-${randomUUID()}`;
}

function operatorProjectionLaunchBindingPath(record: WorkspaceLaunchRecord, launchSessionToken: string): string {
  const root = record.workspace_root ?? record.narada_root;
  const name = `${launchSessionToken}.json`;
  return join(root, '.ai', 'runtime', 'operator-projection-launch-bindings', name);
}

function safePathToken(value: string): string {
  return value.replace(/[^0-9A-Za-z_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function workspaceLaunchQualifiedAgentId(record: WorkspaceLaunchRecord): string {
  return agentIdentityDisplay(record.agent_identity_ref, record.agent) ?? record.agent;
}

function agentWebUiAttachWtArgs(record: WorkspaceLaunchRecord, naradaProper: string, cloudflareApiBaseUrl: string | null, launchBindingPath: string | null): string[] {
  const agentDisplay = workspaceLaunchQualifiedAgentId(record);
  const attachCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    'agent-web-ui',
    'attach',
    '--site-root', record.site_root,
    ...(launchBindingPath ? ['--launch-binding', launchBindingPath] : ['--agent', record.agent]),
    '--wait-for-session-ms', '60000',
    '--open',
  ];
  if (cloudflareApiBaseUrl) attachCommand.push('--cloudflare-api-base-url', cloudflareApiBaseUrl);
  const prelude = `Write-Host ${quotePowerShellArgument(`agent-web-ui: waiting for ${agentDisplay} launch binding, then starting browser projection`)}`;
  return [
    'new-tab',
    '--title', `${workspaceLaunchQualifiedAgentId(record)} web ui`,
    '-d', record.workspace_root ?? record.narada_root,
    'pwsh',
    '-NoExit',
    '-Command',
    `${prelude}\n${toPowerShellCommand(attachCommand)}`,
  ];
}

function plannedAgentWebUiProjectionOpenRequest(record: WorkspaceLaunchRecord): Record<string, unknown> {
  return {
    schema: 'narada.operator_projection_open_request.v1',
    status: 'planned',
    projection_kind: 'browser_url',
    target_ref: null,
    target_ref_resolution: 'agent-web-ui attach resolves local URL after NARS session attach and server start',
    purpose: 'agent_web_ui_attach',
    caller: { package: '@narada2/cli', command: 'workspace launch', module: 'commands/launcher' },
    mode: 'execute',
    policy: { allow_visible_host_effect: true, suppress_reason: null },
    mutation_performed: false,
    launch_agent: record.agent,
    launch_site: record.site,
  };
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
