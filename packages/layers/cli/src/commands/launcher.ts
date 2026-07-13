import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startOperatorTerminal } from '@narada2/process-launch-posture';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import { executeOperatorProjectionOpenRequest } from '@narada2/process-launch-posture';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import * as prompts from '@clack/prompts';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef, type AgentIdentityRefV2 } from '@narada2/agent-identity';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import { commandResultError, type CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { buildLaunchProcessOwnership, launchSessionIdFromToken } from '@narada2/launch-process-ownership';
import { carrierStartCommand } from './carrier.js';
import {
  defaultRuntimeForCarrier,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  resolveCarrierRuntimeSelection,
} from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import { discoverNarsSessions } from '@narada2/nars-session-core/session-index';
import {
  DEFAULT_OPERATOR_ROUTER_PORT,
  ensureOperatorRouter,
  readOperatorRouterRoutes,
  type EnsureOperatorRouterOptions,
  type EnsureOperatorRouterResult,
} from '@narada2/operator-router';
import {
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH,
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA,
  type OperatorWorkspaceRouteDirectory,
} from '@narada2/operator-console-contract';
import { explainMcpCommand as explainMcpAuthorityCommand } from './launcher-mcp-authority.js';
import {
  isWorkspaceLaunchUiSessionRecord,
  readWorkspaceLaunchUiSessions,
  workspaceLaunchUiSessionPersistenceRoot,
  workspaceLaunchUiSessionRoute,
  workspaceLaunchUserSiteRoot,
  type WorkspaceLaunchUiSessionRecord,
} from './workspace-launch-session-store.js';
import { defaultLaunchRegistryPath, listKnownSiteRootsForCli, type ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type {
  WorkspaceLaunchSelectionCardinality,
  WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection,
  WorkspaceLaunchSelectionMode,
  WorkspaceLaunchOption as WorkspaceLaunchSelectorOptionContract,
  WorkspaceLaunchSelectorModel as WorkspaceLaunchSelectorModelContract,
} from '@narada2/workspace-launch-contract';

const requireFromLauncherCommand = createRequire(import.meta.url);
const providerRegistry = loadProviderRegistry();
const providerAdapters = loadProviderAdapters();
const ADMITTED_LAUNCH_RUNTIME_SUBSTRATE_KINDS = [
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  'codex',
  'kimi',
  'pi',
  'claude-code',
  'opencode',
] as const;
const NARS_OPERATOR_SURFACE_KINDS = ['agent-cli', 'agent-web-ui'] as const;

interface ProviderRegistry {
  default_provider?: string;
  providers?: Record<string, {
    meaning?: string;
    support_state?: string;
  }>;
}

interface WorkspaceLaunchCapabilityPair {
  operatorSurface: string;
  runtime: string;
}

function workspaceLaunchCapabilityPairs(records: WorkspaceLaunchRecord[]): WorkspaceLaunchCapabilityPair[] {
  const candidates = records.flatMap((record) => {
    const runtime = normalizeRuntimeAlias(record.runtime);
    const pairs: WorkspaceLaunchCapabilityPair[] = [{ operatorSurface: record.carrier, runtime }];
    if (runtime === NARADA_AGENT_RUNTIME_SERVER_KIND) {
      for (const operatorSurface of NARS_OPERATOR_SURFACE_KINDS) pairs.push({ operatorSurface, runtime });
    }
    return pairs;
  });
  const admitted = new Map<string, WorkspaceLaunchCapabilityPair>();
  for (const pair of candidates) {
    try {
      resolveWorkspaceCarrierRuntimeSelection(pair.operatorSurface, pair.runtime);
      admitted.set(`${pair.operatorSurface}\u0000${pair.runtime}`, pair);
    } catch {
      // Registry records can be historical. Only expose launchable pairs.
    }
  }
  return [...admitted.values()];
}

function workspaceLaunchCapabilityValues(
  records: WorkspaceLaunchRecord[],
  operatorSurfaces: string[] = [],
  runtime?: string,
): { operatorSurfaceValues: string[]; runtimeValues: string[] } {
  const pairs = workspaceLaunchCapabilityPairs(records);
  const explicitSurfaces = operatorSurfaces.filter((value) => value !== 'registry default');
  const explicitRuntime = runtime && runtime !== 'registry default' ? normalizeRuntimeAlias(runtime) : null;
  const filteredPairs = explicitRuntime
    ? pairs.filter((pair) => pair.runtime === explicitRuntime)
    : pairs;
  const operatorSurfaceValues = unique(['registry default', ...filteredPairs.map((pair) => pair.operatorSurface)]);
  const selectedSurfaces = explicitSurfaces.filter((surface) => operatorSurfaceValues.includes(surface));
  const compatiblePairs = selectedSurfaces.length === 0
    ? pairs
    : pairs.filter((pair) => selectedSurfaces.every((surface) => pair.operatorSurface === surface || pairs.some((candidate) => candidate.operatorSurface === surface && candidate.runtime === pair.runtime)));
  return {
    operatorSurfaceValues,
    runtimeValues: unique(['registry default', ...compatiblePairs.map((pair) => pair.runtime)]),
  };
}

function workspaceLaunchSelectionMode(
  raw: unknown,
  selection: Pick<WorkspaceLaunchBrowserSelection, 'site' | 'role' | 'operatorSurface'>,
): WorkspaceLaunchSelectionMode | undefined {
  const source = isRecord(raw) ? raw : {};
  const cardinality = (key: keyof WorkspaceLaunchSelectionMode, values: string[]): WorkspaceLaunchSelectionCardinality =>
    values.length > 1 || source[key] === 'multiple' ? 'multiple' : 'single';
  const mode = {
    site: cardinality('site', selection.site),
    role: cardinality('role', selection.role),
    operatorSurface: cardinality('operatorSurface', selection.operatorSurface),
  };
  return mode.site === 'single' && mode.role === 'single' && mode.operatorSurface === 'single' && !isRecord(raw) ? undefined : mode;
}

function workspaceLaunchSessionIdentityRef(session: Record<string, unknown>): AgentIdentityRefV2 | null {
  const record = isRecord(session.record) ? session.record : null;
  const agentId = workspaceLaunchString(session.agent_id) ?? workspaceLaunchString(record?.agent_id);
  const siteId = workspaceLaunchString(session.site_id) ?? workspaceLaunchString(record?.site_id);
  const role = agentId?.split('.').filter(Boolean).at(-1) ?? null;
  const inputs = [session.agent_identity_ref, record?.agent_identity_ref, agentId]
    .filter((value): value is unknown => value !== null && value !== undefined);
  for (const input of inputs) {
    const resolved = resolveAgentIdentityRef(input, { site_id: siteId, role });
    if (resolved.status === 'resolved') return resolved.value;
  }
  return null;
}

function workspaceLaunchProjectionQualifiedAgentId(attempt: WorkspaceLaunchAttemptRecord): string | null {
  const observation = attempt.observations.find((candidate) => candidate.agent_identity_ref || candidate.agent_id);
  const canonical = observation?.agent_identity_ref?.canonical_agent_id;
  if (typeof canonical === 'string' && canonical.trim()) return canonical.trim();

  if (observation?.agent_id) {
    const resolved = resolveAgentIdentityRef(observation.agent_id, {
      site_id: observation.site_id,
      role: observation.agent_id.split('.').filter(Boolean).at(-1),
    });
    if (resolved.status === 'resolved') return resolved.value.canonical_agent_id;
  }

  const selectedSite = attempt.selection.site.length === 1 ? attempt.selection.site[0] : null;
  const selectedRole = attempt.selection.role.length === 1 ? attempt.selection.role[0] : null;
  return selectedSite && selectedRole ? `${selectedSite}.${selectedRole}` : null;
}

function workspaceLaunchLegacyTerminalWtArgs(record: Record<string, unknown>): string[] {
  const topLevel = stringArray(record.wt_args);
  if (topLevel.length > 0) return topLevel;
  const legacyTerminalPlan = isRecord(record.legacy_terminal_plan) ? record.legacy_terminal_plan : null;
  return legacyTerminalPlan ? stringArray(legacyTerminalPlan.wt_args) : [];
}

async function workspaceLaunchStartHiddenRuntimeHost(commandArgs: string[], cwd: string): Promise<Record<string, unknown>> {
  const captureLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
  if (captureLog) {
    await appendFile(captureLog, `${JSON.stringify({ command: redactWorkspaceLaunchArgv(commandArgs), cwd })}\n`, 'utf8');
    return {
      posture: 'agent_runtime_server',
      command: 'capture',
      args: redactWorkspaceLaunchArgv(commandArgs),
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      pid: null,
      capture_log: captureLog,
    };
  }
  const hostCommand = process.platform === 'win32' ? 'pwsh' : 'sh';
  const hostArgs = process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', toPowerShellCommand(commandArgs)]
    : ['-lc', toShCommand(commandArgs)];
  const child = spawnHiddenPostureProcess(hostCommand, hostArgs, {
    posture: 'agent_runtime_server',
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
    posture: 'agent_runtime_server',
    command: hostCommand,
    args: redactWorkspaceLaunchArgv(hostArgs),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
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
  onboarding?: boolean;
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

interface WorkspaceLaunchHandoffRecord {
  schema: 'narada.workspace_launch.handoff.v1';
  handoff_id: string;
  launch_attempt_id: string;
  posture: 'operator_terminal' | 'hidden_runtime_host';
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
  agent_id?: string | null;
  site_id?: string | null;
  agent_identity_ref?: AgentIdentityRefV2 | null;
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
    admittedRuntimeSubstrateKinds: [...ADMITTED_LAUNCH_RUNTIME_SUBSTRATE_KINDS],
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
  legacy_site?: string | null;
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
  onboarding_mode: 'user-site' | null;
  launch_session_id: string | null;
  process_ownership: Record<string, unknown> | null;
  intelligence_provider: string | null;
  authority: string | null;
  wait_for_enter_before_exec: boolean;
  runtime_start_execution_mode: 'hidden_detached' | 'operator_terminal';
  runtime_start_command: string[];
  runtime_start_cwd: string;
  mcp_scope: string;
  wt_args: string[];
  smoke_command: string[];
  operator_projection_launch_binding: Record<string, unknown> | null;
  operator_projection_open_requests: Array<Record<string, unknown>>;
  legacy_carrier_compatibility: WorkspaceLaunchLegacyCarrierCompatibility;
}

export interface WorkspaceLaunchRecordsLoad {
  records: WorkspaceLaunchRecord[];
  siteCatalog: ResolvedSiteRoot[];
}

export async function readWorkspaceLaunchRecords(options: WorkspaceLaunchPlanOptions): Promise<WorkspaceLaunchRecordsLoad> {
  const registryPaths = resolveRegistryPaths(options);
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  let siteCatalog: ResolvedSiteRoot[] = [];
  try {
    siteCatalog = await listKnownSiteRootsForCli({ launchRegistryPath: registryPaths[0] });
  } catch {
    // Keep launch planning usable for explicit non-interactive compatibility
    // paths; interactive selection reports the missing catalog below.
  }
  return {
    records: canonicalizeWorkspaceLaunchRecords(records, siteCatalog),
    siteCatalog,
  };
}

function canonicalizeWorkspaceLaunchRecords(
  records: WorkspaceLaunchRecord[],
  siteCatalog: ResolvedSiteRoot[],
): WorkspaceLaunchRecord[] {
  const byRoot = new Map(
    siteCatalog
      .filter((site): site is ResolvedSiteRoot & { site_id: string } => typeof site.site_id === 'string' && site.site_id.length > 0)
      .map((site) => [resolve(site.site_root).toLowerCase(), site.site_id] as const),
  );
  if (byRoot.size === 0) return records;
  return records.map((record) => {
    const canonicalSiteId = byRoot.get(resolve(record.site_root).toLowerCase());
    if (!canonicalSiteId || canonicalSiteId === record.site) return record;
    const identityRef = record.agent_identity_ref
      ? buildAgentIdentityRefV2({
          identity_scope: { kind: 'narada_site', site_id: canonicalSiteId },
          local_agent_id: record.agent_identity_ref.local_agent_id,
          role: record.agent_identity_ref.role,
          legacy_agent_id: record.agent_identity_ref.legacy_agent_id ?? record.agent,
        })
      : record.agent_identity_ref;
    return {
      ...record,
      agent_identity_ref: identityRef,
      site: canonicalSiteId,
      legacy_site: record.legacy_site ?? record.site,
    };
  });
}

function requireSiteCatalogForInteractiveSelection(
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[],
  records: WorkspaceLaunchRecord[],
): void {
  if ((options.interactiveSelection === true || options.interactiveSelectionUi === true) && siteCatalog.length === 0) {
    throw new Error('site_registry_empty_for_interactive_selection: run `narada sites discover` before opening launcher selection');
  }
  if (options.interactiveSelection !== true && options.interactiveSelectionUi !== true) return;
  const catalogRoots = new Set(siteCatalog.map((site) => resolve(site.site_root).toLowerCase()));
  const unregisteredRoots = unique(records
    .filter((record) => !catalogRoots.has(resolve(record.site_root).toLowerCase()))
    .map((record) => record.site_root));
  if (unregisteredRoots.length > 0) {
    throw new Error(`site_registry_missing_launch_roots: run 'narada sites discover' before opening launcher selection (${unregisteredRoots.join(', ')})`);
  }
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(normalizedOptions);
  const loaded = await readWorkspaceLaunchRecords(normalizedOptions);
  const records = loaded.records;
  requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const resolvedOptions = await resolveInteractiveSelectionOptions(records, normalizedOptions, loaded.siteCatalog);
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
    wt_args_authority: 'compatibility_non_authoritative',
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
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(isRecord) : [];
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
      const runtimeStartCommand = stringArray(agent.runtime_start_command);
      const runtimeStartCwd = workspaceLaunchString(agent.runtime_start_cwd) ?? process.cwd();
      if (runtimeStartCommand.length === 0) throw new Error('narada_workspace_plan_empty_runtime_start_command');
      hiddenLaunches.push(await workspaceLaunchStartHiddenRuntimeHost(runtimeStartCommand, runtimeStartCwd));
    }
    const launchResult = finalizeWorkspaceLaunchResult({
      ...result,
      windows_terminal_invoked: false,
      hidden_runtime_invoked: true,
      launcher_execution_owner: 'narada-cli',
      hidden_runtime_launches: hiddenLaunches,
    });
    await writeWorkspacePlanResult(options.resultPath, launchResult);
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
  await writeWorkspacePlanResult(options.resultPath, launchResult);
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(launchResult, `launched ${result.count ?? 0} workspace launch(es)`, options.format ?? 'auto'),
  };
}

async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  await appendFile(path, `${JSON.stringify(args)}\n`, 'utf8');
  return { status: 0 };
}

function finalizeWorkspaceLaunchResult(result: Record<string, unknown>): Record<string, unknown> {
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(isRecord) : [];
  const wtArgs = stringArray(result.wt_args);
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
  const legacyTerminalPlan = isRecord(result.legacy_terminal_plan) ? result.legacy_terminal_plan : null;
  if (legacyTerminalPlan && legacyTerminalPlan.authority !== 'compatibility_non_authoritative') {
    throw new Error('workspace_launch_result_legacy_terminal_plan_authority_invalid');
  }
  if (!Array.isArray(result.launch_agents)) {
    throw new Error('workspace_launch_result_launch_agents_required');
  }
  const selectedAgents = Array.isArray(result.selected_agents) ? result.selected_agents.filter(isRecord) : [];
  if (hiddenRuntimeInvoked && selectedAgents.some((agent) => agent.runtime_start_execution_mode !== 'hidden_detached')) {
    throw new Error('workspace_launch_result_hidden_runtime_requires_hidden_agent_modes');
  }
}

export interface WorkspaceLaunchUiIngress {
  url: string;
  direct_url: string;
  router_url: string | null;
  stable_url: string | null;
  ingress_mode: 'operator-router' | 'diagnostic';
  reason: string | null;
}

export interface ResolveWorkspaceLaunchUiIngressOptions {
  uiSessionId: string;
  directUrl: string;
  host?: string;
  port?: number;
  ensureRouter?: (options: EnsureOperatorRouterOptions) => Promise<EnsureOperatorRouterResult>;
  readRoutes?: typeof readOperatorRouterRoutes;
  readWorkspaceRouteDirectory?: typeof readOperatorWorkspaceRouteDirectory;
}

function boundedWorkspaceLaunchIngressError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const bounded = message.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
  return `operator_router_unavailable:${bounded || 'unknown_error'}`;
}

function operatorRouterIngressUrl(routerUrl: string, uiSessionId: string): string {
  return `${routerUrl.replace(/\/+$/, '')}${workspaceLaunchUiSessionRoute(uiSessionId)}`;
}

export async function readOperatorWorkspaceRouteDirectory(options: {
  url: string;
  fetch_fn?: typeof fetch;
  timeout_ms?: number;
}): Promise<OperatorWorkspaceRouteDirectory> {
  const timeoutMs = options.timeout_ms ?? 3_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error('operator_workspace_route_directory_timeout_invalid');
  }
  const response = await (options.fetch_fn ?? fetch)(
    `${options.url.replace(/\/+$/, '')}${OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH}`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isOperatorWorkspaceRouteDirectory(payload)) {
    throw new Error(`operator_workspace_route_directory_read_failed:${response.status}`);
  }
  return payload;
}

function isOperatorWorkspaceRouteDirectory(value: unknown): value is OperatorWorkspaceRouteDirectory {
  if (!isRecord(value)
    || value.schema !== OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA
    || !Array.isArray(value.surfaces)) return false;
  return value.surfaces.every((surface) => {
    if (!isRecord(surface)
      || typeof surface.id !== 'string'
      || !['available', 'unavailable', 'planned'].includes(String(surface.availability))
      || !Array.isArray(surface.projectedRoutes)) return false;
    return surface.projectedRoutes.every((route) => isRecord(route)
      && typeof route.id === 'string'
      && typeof route.path === 'string'
      && (route.kind === 'page' || route.kind === 'workflow')
      && typeof route.label === 'string'
      && ['available', 'unavailable', 'planned'].includes(String(route.availability))
      && typeof route.projectedDetail === 'string');
  });
}

function workspaceLaunchRouteDirectoryHealthy(directory: OperatorWorkspaceRouteDirectory): boolean {
  const launcher = directory.surfaces.find((surface) => surface.id === 'launcher');
  return launcher?.availability === 'available'
    && launcher.projectedRoutes.some((route) => route.id === 'launcher'
      && route.path === '/console/launch'
      && route.availability === 'available');
}

export async function resolveWorkspaceLaunchUiIngress(
  options: ResolveWorkspaceLaunchUiIngressOptions,
): Promise<WorkspaceLaunchUiIngress> {
  const directUrl = options.directUrl;
  let routerUrl: string | null = null;
  try {
    const ensureRouter = options.ensureRouter ?? ensureOperatorRouter;
    const readRoutes = options.readRoutes ?? readOperatorRouterRoutes;
    const readWorkspaceRouteDirectory = options.readWorkspaceRouteDirectory ?? readOperatorWorkspaceRouteDirectory;
    const router = await ensureRouter({
      host: options.host ?? '127.0.0.1',
      port: options.port ?? DEFAULT_OPERATOR_ROUTER_PORT,
    });
    routerUrl = router.url;
    const routes = await readRoutes({ url: router.url });
    const consoleProjection = routes.routes.find((route) => route.route_id === 'operator-console');
    const consoleProjectionHealthy = consoleProjection?.route_class === 'operator-console'
      && consoleProjection.public_path === '/'
      && consoleProjection.route_mode === 'prefix'
      && consoleProjection.state === 'healthy';
    if (consoleProjectionHealthy) {
      const workspaceRouteDirectory = await readWorkspaceRouteDirectory({ url: router.url });
      if (!workspaceLaunchRouteDirectoryHealthy(workspaceRouteDirectory)) {
        return {
          url: directUrl,
          direct_url: directUrl,
          router_url: router.url,
          stable_url: null,
          ingress_mode: 'diagnostic',
          reason: 'operator_workspace_launcher_route_unavailable',
        };
      }
      const stableUrl = operatorRouterIngressUrl(router.url, options.uiSessionId);
      return {
        url: stableUrl,
        direct_url: directUrl,
        router_url: router.url,
        stable_url: stableUrl,
        ingress_mode: 'operator-router',
        reason: null,
      };
    }
    return {
      url: directUrl,
      direct_url: directUrl,
      router_url: router.url,
      stable_url: null,
      ingress_mode: 'diagnostic',
      reason: 'operator_console_projection_unavailable',
    };
  } catch (error) {
    return {
      url: directUrl,
      direct_url: directUrl,
      router_url: routerUrl,
      stable_url: null,
      ingress_mode: 'diagnostic',
      reason: boundedWorkspaceLaunchIngressError(error),
    };
  }
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
  const loaded = await readWorkspaceLaunchRecords(normalizedOptions);
  requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const session = await runPersistentWorkspaceLaunchSelectionUi(loaded.records, normalizedOptions, async (selection) => {
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
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
): Promise<WorkspaceLaunchPlanOptions> {
  if (options.interactiveSelectionUi) return resolveInteractiveSelectionUiOptions(records, options, siteCatalog);
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

  const selectedCarrierValues = normalizeInteractiveOperatorSurfaceValues(selectedCarriers as string[]);
  const providerSelectorModel = workspaceLaunchSelectorModel(records, {
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
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
): Promise<WorkspaceLaunchPlanOptions> {
  const selection = await runWorkspaceLaunchSelectionUi(records, options, siteCatalog);
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

export type WorkspaceLaunchSelectorOption = WorkspaceLaunchSelectorOptionContract;
export type WorkspaceLaunchSelectorModel = WorkspaceLaunchSelectorModelContract;

export function workspaceLaunchSelectorModel(
  records: WorkspaceLaunchRecord[],
  selection: Partial<WorkspaceLaunchBrowserSelection> = {},
  siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchSelectorModel {
  const effectiveRecords = canonicalizeWorkspaceLaunchRecords(records, siteCatalog);
  const siteValues = unique(effectiveRecords.map((record) => record.site));
  const selectedSites = nonEmptyStringArray(selection.site).filter((site) => siteValues.includes(site));
  const roleValues = roleChoicesForSelectedSites(effectiveRecords, selectedSites);
  const requestedRoles = nonEmptyStringArray(selection.role).filter((role) => roleValues.includes(role));
  const selectedRoles = requestedRoles.length > 0 ? requestedRoles : initialRoleValuesForInteractiveSelection(roleValues);
  const selectedRecords = selectLaunchRecords(effectiveRecords, { all: true, site: selectedSites, role: selectedRoles });
  const capabilityValues = workspaceLaunchCapabilityValues(selectedRecords);
  const selectedOperatorSurfaces = initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, nonEmptyStringArray(selection.operatorSurface).join(','));
  const requestedRuntime = nonEmpty(selection.runtime);
  const runtimeValues = workspaceLaunchCapabilityValues(selectedRecords, selectedOperatorSurfaces).runtimeValues;
  const selectedRuntime = requestedRuntime && runtimeValues.includes(normalizeRuntimeAlias(requestedRuntime)) ? normalizeRuntimeAlias(requestedRuntime) : 'registry default';
  const operatorSurfaceValues = workspaceLaunchCapabilityValues(selectedRecords, selectedOperatorSurfaces, selectedRuntime).operatorSurfaceValues;
  const normalizedOperatorSurfaces = initialOperatorSurfaceValues(operatorSurfaceValues, selectedOperatorSurfaces.join(','));
  const providerOperatorSurface = normalizedOperatorSurfaces.includes('agent-cli') ? 'agent-cli' : (normalizedOperatorSurfaces[0] ?? 'registry default');
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
      operatorSurface: normalizedOperatorSurfaces,
      runtime: selectedRuntime,
      intelligenceProvider: selectedProvider,
    },
  };
}

async function runWorkspaceLaunchSelectionUi(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
): Promise<WorkspaceLaunchBrowserSelection> {
  const host = '127.0.0.1';
  let server: Server | null = null;
  let settled = false;
  const portPolicy = resolveWorkspaceLaunchUiPortPolicy(options);

  const rememberedSelection = await readWorkspaceLaunchRememberedSelection();
  const pageModel = buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog);
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
        if (req.method === 'GET') {
          const asset = readWorkspaceLaunchUiAsset(url.pathname);
          if (asset) {
            res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.body.byteLength });
            res.end(asset.body);
            return;
          }
        }
        if (req.method === 'POST' && url.pathname === '/selector-model') {
          const payload = JSON.parse(await readBody(req)) as Partial<WorkspaceLaunchBrowserSelection>;
          jsonResponse(res, 200, workspaceLaunchSelectorModel(records, payload, siteCatalog));
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
  siteCatalog: ResolvedSiteRoot[] = [],
): Promise<WorkspaceLaunchUiIngress & { status: 'cancelled' | 'timeout'; launch_count: number }> {
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
  const pageModel = buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog);
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
        if (req.method === 'GET') {
          const asset = readWorkspaceLaunchUiAsset(url.pathname);
          if (asset) {
            res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.body.byteLength });
            res.end(asset.body);
            return;
          }
        }
        if (req.method === 'GET' && url.pathname === '/launches') {
          jsonResponse(res, 200, dashboardState());
          return;
        }
        if (req.method === 'POST' && url.pathname === '/selector-model') {
          const payload = JSON.parse(await readBody(req)) as Partial<WorkspaceLaunchBrowserSelection>;
          jsonResponse(res, 200, workspaceLaunchSelectorModel(records, payload, siteCatalog));
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

  const ingress = await resolveWorkspaceLaunchUiIngress({
    uiSessionId: uiSession.ui_session_id,
    directUrl: url,
    host,
  });
  console.log(`Narada launcher selection UI: ${ingress.url}`);
  if (fallback_used) {
    console.log(`[launcher] preferred UI port ${portPolicy.port} was occupied; using ephemeral port ${port} instead.`);
  }
  if (ingress.ingress_mode === 'diagnostic') {
    console.log(`[launcher] direct UI URL is diagnostic; Operator Console projection unavailable (${ingress.reason ?? 'unknown'}).`);
  }
  console.log('Selection UI will remain available for additional launches until you close it.');
  uiSession.url = url;
  await persistWorkspaceLaunchDashboardState(persistenceDir, uiSession, attempts);
  requestWorkspaceLaunchSelectionUiProjectionOpen(ingress.url);

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
    return { ...ingress, status, launch_count: launchCount };
  } finally {
    await closeWorkspaceLaunchSelectionServer(server);
  }
}

function workspaceLaunchId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
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
  const normalizedSelection = normalizeWorkspaceLaunchBrowserSelection(selection);
  await writeJsonFile(path, {
    schema: 'narada.workspace_launch.remembered_selection.v1',
    updated_at: new Date().toISOString(),
    selection: normalizedSelection,
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
  const qualifiedAgentId = workspaceLaunchProjectionQualifiedAgentId(attempt);
  const titleSuffix = qualifiedAgentId
    ? (projectionKind === 'agent-web-ui' ? 'web ui' : 'runtime')
    : (sessionId ?? attempt.launch_attempt_id);
  const title = `${qualifiedAgentId ?? projectionKind} ${titleSuffix}`;
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
  const hiddenRuntimeLaunches = Array.isArray(record.hidden_runtime_launches) ? record.hidden_runtime_launches : [];
  if (record.hidden_runtime_invoked === true || hiddenRuntimeLaunches.length > 0) {
    const selectedAgents = Array.isArray(record.selected_agents) ? record.selected_agents.filter(isRecord) : [];
    const firstAgent = selectedAgents.find((agent) => agent.runtime_start_execution_mode === 'hidden_detached') ?? selectedAgents[0];
    return {
      schema: 'narada.workspace_launch.handoff.v1',
      handoff_id: workspaceLaunchId('wlh'),
      launch_attempt_id: launchAttemptId,
      posture: 'hidden_runtime_host',
      status: success ? 'handed_off' : 'failed',
      command: 'hidden_runtime_host',
      argv_redacted: redactWorkspaceLaunchArgv(stringArray(firstAgent?.runtime_start_command)),
      cwd: workspaceLaunchString(firstAgent?.runtime_start_cwd) ?? workspaceLaunchHandoffCwd(record),
      exit_code: null,
      ownership_posture: 'handoff_only',
      diagnostic_ref: workspaceLaunchString(record.result_path),
    };
  }
  const wtArgs = workspaceLaunchLegacyTerminalWtArgs(record);
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
  const record = isRecord(session.record) ? session.record : null;
  const agentId = workspaceLaunchString(session.agent_id) ?? workspaceLaunchString(record?.agent_id);
  const siteId = workspaceLaunchString(session.site_id) ?? workspaceLaunchString(record?.site_id);
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
    agent_id: agentId,
    site_id: siteId,
    agent_identity_ref: workspaceLaunchSessionIdentityRef(session),
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
  const explicitSurfaces = operatorSurface.filter((value) => value !== 'registry default');
  if (explicitSurfaces.length > 1 && explicitSurfaces.some((value) => !NARS_OPERATOR_SURFACE_KINDS.includes(value as typeof NARS_OPERATOR_SURFACE_KINDS[number]))) {
    throw new Error('interactive_selection_ui_multiple_operator_surfaces_require_nars_projections');
  }
  const selectionMode = workspaceLaunchSelectionMode(payload.selectionMode, { site, role, operatorSurface });
  return { site, role, operatorSurface, runtime, intelligenceProvider, ...(selectionMode ? { selectionMode } : {}) };
}

function filterWorkspaceLaunchValues(values: string[] | undefined, allowed: string[]): string[] {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return unique(stringArray(values).filter((value) => allowedSet.has(value.toLowerCase())));
}

export function resolveWorkspaceLaunchBrowserSelection(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null,
  siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchBrowserSelection {
  const effectiveRecords = canonicalizeWorkspaceLaunchRecords(records, siteCatalog);
  const siteChoices = unique(effectiveRecords.map((record) => record.site));
  const requestedSites = filterWorkspaceLaunchValues(options.site, siteChoices);
  const rememberedSites = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.site, siteChoices) : [];
  const selectedSites = requestedSites.length > 0 ? requestedSites : rememberedSites;

  const roleChoices = roleChoicesForSelectedSites(effectiveRecords, selectedSites);
  const requestedRoles = initialRoleValuesForInteractiveSelection(roleChoices, options.role);
  const rememberedRoles = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.role, roleChoices) : [];
  const selectedRoles = nonEmptyStringArray(options.role).length > 0 ? requestedRoles : (rememberedRoles.length > 0 ? rememberedRoles : requestedRoles);

  const selectedRecords = selectLaunchRecords(effectiveRecords, { ...options, all: true, site: selectedSites, role: selectedRoles });
  const capabilityValues = workspaceLaunchCapabilityValues(selectedRecords);
  const requestedOperatorSurfaces = initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, options.operatorSurface);
  const rememberedOperatorSurfaces = rememberedSelection ? initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, rememberedSelection.operatorSurface.join(',')) : [];
  const selectedOperatorSurfaces = options.operatorSurface ? requestedOperatorSurfaces : (rememberedOperatorSurfaces.length > 0 ? rememberedOperatorSurfaces : requestedOperatorSurfaces);

  const runtimeValues = workspaceLaunchCapabilityValues(selectedRecords, selectedOperatorSurfaces).runtimeValues;
  const requestedRuntime = nonEmpty(options.runtime);
  const rememberedRuntime = rememberedSelection && nonEmpty(rememberedSelection.runtime) && runtimeValues.includes(normalizeRuntimeAlias(rememberedSelection.runtime))
    ? normalizeRuntimeAlias(rememberedSelection.runtime)
    : null;
  const selectedRuntime = requestedRuntime
    ? (runtimeValues.includes(normalizeRuntimeAlias(requestedRuntime)) ? normalizeRuntimeAlias(requestedRuntime) : 'registry default')
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

  const selection = {
    site: selectedSites,
    role: selectedRoles,
    operatorSurface: selectedOperatorSurfaces,
    runtime: selectedRuntime,
    intelligenceProvider: selectedProvider,
  };
  const selectionMode = workspaceLaunchSelectionMode(
    options.site || options.role || options.operatorSurface ? undefined : rememberedSelection?.selectionMode,
    selection,
  );
  return { ...selection, ...(selectionMode ? { selectionMode } : {}) };
}

export function buildWorkspaceLaunchSelectionUiModel(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null = null,
  siteCatalog: ResolvedSiteRoot[] = [],
): Record<string, unknown> {
  const effectiveRecords = canonicalizeWorkspaceLaunchRecords(records, siteCatalog);
  const resolvedSelection = resolveWorkspaceLaunchBrowserSelection(effectiveRecords, options, rememberedSelection, siteCatalog);
  const siteChoices = unique(effectiveRecords.map((record) => record.site));
  return {
    records: effectiveRecords,
    siteChoices,
    siteCatalog: siteCatalog.map((site) => ({
      site_id: site.site_id,
      site_root: site.site_root,
      source: site.source,
    })),
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
    initialSelectionMode: resolvedSelection.selectionMode ?? { site: 'single', role: 'single', operatorSurface: 'single' },
    narsOperatorSurfaceChoices: [...NARS_OPERATOR_SURFACE_KINDS],
    selectorModel: workspaceLaunchSelectorModel(effectiveRecords, resolvedSelection, siteCatalog),
    explicitSelection: {
      site: nonEmptyStringArray(options.site).length > 0,
      role: nonEmptyStringArray(options.role).length > 0,
      operatorSurface: normalizeInteractiveOperatorSurfaceValues(options.operatorSurface ? options.operatorSurface.split(',') : []).length > 0,
      runtime: !!options.runtime,
      intelligenceProvider: !!options.intelligenceProvider,
    },
  };
}

export function buildWorkspaceLaunchSelectionHtml(
  model: Record<string, unknown>,
  options: { persistent?: boolean; basePath?: string } = {},
): string {
  const templatePath = requireFromLauncherCommand.resolve('@narada2/workspace-launch-ui/dist/index.html');
  const template = readFileSync(templatePath, 'utf8');
  const bootstrap = JSON.stringify({
    model,
    persistent: options.persistent === true,
    ...(options.basePath ? { basePath: options.basePath } : {}),
  }).replace(/</g, '\\u003c');
  const placeholder = '__NARADA_WORKSPACE_LAUNCH_BOOTSTRAP__';
  if (!template.includes(placeholder)) {
    throw new Error('workspace_launch_ui_bootstrap_placeholder_missing');
  }
  return template.replace(placeholder, bootstrap);
}

function readWorkspaceLaunchUiAsset(pathname: string): { body: Buffer; contentType: string } | null {
  if (!pathname.startsWith('/assets/')) return null;
  const relativePath = pathname.slice('/assets/'.length);
  if (!relativePath || relativePath.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(relativePath)) return null;
  const indexPath = requireFromLauncherCommand.resolve('@narada2/workspace-launch-ui/dist/index.html');
  const assetsRoot = resolve(dirname(indexPath), 'assets');
  const assetPath = resolve(assetsRoot, relativePath);
  if (assetPath !== assetsRoot && !assetPath.startsWith(`${assetsRoot}${sep}`)) return null;
  try {
    const extension = extname(assetPath).toLowerCase();
    const contentType = extension === '.css'
      ? 'text/css; charset=utf-8'
      : extension === '.js'
        ? 'text/javascript; charset=utf-8'
        : 'application/octet-stream';
    return { body: readFileSync(assetPath), contentType };
  } catch {
    return null;
  }
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

export function registryDefaultIntelligenceProvider(): string {
  return providerRegistry.default_provider ?? 'registry default';
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
    : [options.registryPath ?? defaultLaunchRegistryPath()];
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
    ?? (launcher ? join(naradaRoot, launcher) : '');
  if (!launcherPath) throw new Error(`launcher_path_missing: ${agentId} in ${configPath}`);
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
    record.legacy_site,
    record.site.replace(/^narada-/, ''),
    record.agent.split('.')[0],
  ].filter((value): value is string => typeof value === 'string' && value.length > 0).map((value) => value.toLowerCase());
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
  const onboarding = options.onboarding === true;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const mcpScope = normalizeMcpScope(options.mcpScope ?? record.mcp_scope ?? undefined);
  const authority = normalizeRuntimeAuthority(options.authority ?? record.authority ?? undefined);
  const isNarsRuntimeHost = runtimeHostKind === 'narada-agent-runtime-server';
  const waitForEnter = options.noWaitForEnterBeforeExec !== true && launchCarriers[0] !== 'agent-web-ui' && !isNarsRuntimeHost;
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
  const runtimeStartExecutionMode: WorkspaceLaunchAgentPlan['runtime_start_execution_mode'] = isNarsRuntimeHost
    ? 'hidden_detached'
    : 'operator_terminal';
  const runtimeStartCwd = record.workspace_root ?? record.narada_root;

  const base = [
    'new-tab',
    '--title', `${qualifiedAgentId} runtime`,
    '-d', runtimeStartCwd,
    'pwsh',
    waitForEnter ? '-NoExit' : '-NoProfile',
    '-Command',
    toPowerShellCommand(operatorSurfaceStartCommand),
  ];
  const wtArgs = [...base];
  if (launchCarrier === 'agent-web-ui') {
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding));
  }
  for (const extraCarrier of launchCarriers.filter((carrier) => carrier !== launchCarrier)) {
    if (extraCarrier !== 'agent-web-ui') {
      throw new Error(`unsupported_multi_carrier_projection: ${extraCarrier}`);
    }
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding));
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
    onboarding_mode: onboarding ? 'user-site' : null,
    launch_session_id: launchSessionId,
    process_ownership: processOwnership as Record<string, unknown> | null,
    legacy_carrier_compatibility: legacyCarrierCompatibility(),
    intelligence_provider: intelligenceProvider,
    authority,
    wait_for_enter_before_exec: waitForEnter,
    runtime_start_execution_mode: runtimeStartExecutionMode,
    runtime_start_command: operatorSurfaceStartCommand,
    runtime_start_cwd: runtimeStartCwd,
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
  const canonical = record.agent_identity_ref?.canonical_agent_id;
  if (typeof canonical === 'string' && canonical.trim()) return canonical.trim();
  const localAgentId = record.agent_identity_ref?.local_agent_id
    ?? record.agent.split('.').filter(Boolean).at(-1)
    ?? record.agent;
  const identityScope = record.agent_identity_ref?.identity_scope;
  const siteId = identityScope?.kind === 'narada_site' ? identityScope.site_id : record.site;
  return record.agent.includes('.') || !siteId ? record.agent : `${siteId}.${localAgentId}`;
}

function agentWebUiAttachWtArgs(record: WorkspaceLaunchRecord, naradaProper: string, cloudflareApiBaseUrl: string | null, launchBindingPath: string | null, onboarding: boolean): string[] {
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
  if (onboarding) attachCommand.push('--onboarding');
  if (cloudflareApiBaseUrl) attachCommand.push('--cloudflare-api-base-url', cloudflareApiBaseUrl);
  const prelude = `Write-Host ${quotePowerShellArgument(`agent-web-ui: waiting for ${agentDisplay} launch binding, then starting browser projection`)}`;
  return [
    'new-tab',
    '--title', `${agentDisplay} web ui`,
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

function toShCommand(args: string[]): string {
  return args.map(quoteShArgument).join(' ');
}

function quoteShArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
