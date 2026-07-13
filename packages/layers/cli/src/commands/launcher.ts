import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import { executeOperatorProjectionOpenRequest } from '@narada2/process-launch-posture';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
import {
  buildWorkspaceLaunchSelectionUiModel as buildWorkspaceLaunchSelectionUiModelDomain,
  canonicalizeWorkspaceLaunchRecords as canonicalizeWorkspaceLaunchRecordsDomain,
  initialOperatorSurfaceValues as initialOperatorSurfaceValuesDomain,
  initialRoleValuesForInteractiveSelection as initialRoleValuesForInteractiveSelectionDomain,
  intelligenceProviderChoices as intelligenceProviderChoicesDomain,
  intelligenceProviderChoicesForLaunchSelection as intelligenceProviderChoicesForLaunchSelectionDomain,
  normalizeInteractiveOperatorSurfaceValues as normalizeInteractiveOperatorSurfaceValuesDomain,
  normalizeWorkspaceLaunchBrowserSelection as normalizeWorkspaceLaunchBrowserSelectionDomain,
  registryDefaultIntelligenceProvider as registryDefaultIntelligenceProviderDomain,
  registryDefaultIntelligenceProviderLabel as registryDefaultIntelligenceProviderLabelDomain,
  registryDefaultOperatorSurfaceLabel as registryDefaultOperatorSurfaceLabelDomain,
  registryDefaultRuntimeLabel as registryDefaultRuntimeLabelDomain,
  resolveWorkspaceLaunchBrowserSelection as resolveWorkspaceLaunchBrowserSelectionDomain,
  roleChoicesForSelectedSites as roleChoicesForSelectedSitesDomain,
  selectLaunchRecords as selectLaunchRecordsDomain,
  workspaceLaunchSelectionMode as workspaceLaunchSelectionModeDomain,
  workspaceLaunchSelectorModel as workspaceLaunchSelectorModelDomain,
  type WorkspaceLaunchSelectionContext,
} from './workspace-launch-selection.js';
import {
  closeWorkspaceLaunchUiServer,
  createWorkspaceLaunchUiServer,
  readWorkspaceLaunchUiAsset,
  type WorkspaceLaunchUiPortPolicy,
} from './workspace-launch-ui-server.js';
import {
  loadRecoveredWorkspaceLaunchAttempts as loadRecoveredWorkspaceLaunchAttemptsStore,
  normalizeWorkspaceLaunchAttemptRecord as normalizeWorkspaceLaunchAttemptRecordStore,
  persistWorkspaceLaunchDashboardState as persistWorkspaceLaunchDashboardStateStore,
  readWorkspaceLaunchRememberedSelection as readWorkspaceLaunchRememberedSelectionStore,
  workspaceLaunchUiSessionPersistenceDir as workspaceLaunchUiSessionPersistenceDirStore,
  writeWorkspaceLaunchRememberedSelection as writeWorkspaceLaunchRememberedSelectionStore,
  type WorkspaceLaunchAttemptStoreContext,
} from './workspace-launch-attempt-store.js';
import {
  captureWorkspaceLaunchTerminalInvocation as captureWorkspaceLaunchTerminalInvocationCommand,
  workspaceLaunchCommand as workspaceLaunchCommandImpl,
  workspaceLaunchPlanCommand as workspaceLaunchPlanCommandImpl,
} from './workspace-launch-command.js';
import {
  workspaceLaunchActionsForAttempt as workspaceLaunchActionsForAttemptHandoff,
  workspaceLaunchExecuteProjectionAction as workspaceLaunchExecuteProjectionActionHandoff,
  workspaceLaunchExpectedSessionIds as workspaceLaunchExpectedSessionIdsHandoff,
  workspaceLaunchFailedHandoff as workspaceLaunchFailedHandoffHandoff,
  workspaceLaunchHandoffFromResult as workspaceLaunchHandoffFromResultHandoff,
  workspaceLaunchRequestRuntimeStop as workspaceLaunchRequestRuntimeStopHandoff,
  workspaceLaunchResultSummary as workspaceLaunchResultSummaryHandoff,
  workspaceLaunchRuntimeObservations as workspaceLaunchRuntimeObservationsHandoff,
} from './workspace-launch-handoff.js';
import * as workspaceLaunchHandoff from './workspace-launch-handoff.js';
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

function workspaceLaunchSelectionContext(): WorkspaceLaunchSelectionContext {
  return {
    providerRegistry,
    admittedProviders: providerAdapters.admitted_providers,
    resolveCarrierRuntimeSelection: resolveWorkspaceCarrierRuntimeSelection,
  };
}

interface ProviderRegistry {
  default_provider?: string;
  providers?: Record<string, {
    meaning?: string;
    support_state?: string;
  }>;
}

export function workspaceLaunchSiteRootsFromLaunchResult(result: unknown): string[] {
  const resultRecord = isRecord(result) ? result : null;
  const selectedAgents = Array.isArray(resultRecord?.selected_agents) ? resultRecord.selected_agents : [];
  return selectedAgents
    .map((agent) => isRecord(agent) ? workspaceLaunchString(agent.site_root) : null)
    .filter((value): value is string => Boolean(value));
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
  return workspaceLaunchSelectionModeDomain(raw, selection);
}

export function workspaceLaunchSessionIdentityRef(session: Record<string, unknown>): AgentIdentityRefV2 | null {
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

export function workspaceLaunchProjectionQualifiedAgentId(attempt: WorkspaceLaunchAttemptRecord): string | null {
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

export function workspaceLaunchLegacyTerminalWtArgs(record: Record<string, unknown>): string[] {
  const topLevel = stringArray(record.wt_args);
  if (topLevel.length > 0) return topLevel;
  const legacyTerminalPlan = isRecord(record.legacy_terminal_plan) ? record.legacy_terminal_plan : null;
  return legacyTerminalPlan ? stringArray(legacyTerminalPlan.wt_args) : [];
}

export async function workspaceLaunchStartHiddenRuntimeHost(commandArgs: string[], cwd: string): Promise<Record<string, unknown>> {
  const captureLog = process.env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG;
  if (captureLog) {
    await appendFile(captureLog, `${JSON.stringify({ command: workspaceLaunchHandoff.redactWorkspaceLaunchArgv(commandArgs), cwd })}\n`, 'utf8');
    return {
      posture: 'agent_runtime_server',
      command: 'capture',
      args: workspaceLaunchHandoff.redactWorkspaceLaunchArgv(commandArgs),
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      pid: null,
      capture_log: captureLog,
    };
  }
  const [command, ...args] = commandArgs;
  if (!command) throw new Error('narada_workspace_plan_empty_hidden_runtime_command');
  const child = spawnHiddenPostureProcess(command, args, {
    posture: 'agent_runtime_server',
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('spawn', () => resolvePromise());
  });
  child.unref();
  return {
    posture: 'agent_runtime_server',
    command,
    args: workspaceLaunchHandoff.redactWorkspaceLaunchArgv(args),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

export async function workspaceLaunchStartHiddenProjectionHost(command: string, cwd: string): Promise<Record<string, unknown>> {
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
    args: workspaceLaunchHandoff.redactWorkspaceLaunchArgv(hostArgs),
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    pid: typeof child.pid === 'number' ? child.pid : null,
  };
}

export function redactWorkspaceLaunchCommand(command: string): string {
  return workspaceLaunchHandoff.redactWorkspaceLaunchArgv([command])[0] ?? '<redacted>';
}

export async function workspaceLaunchReapStaleSessionOwnedDescendants(
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
): Promise<{ scanned: number; cleanup_requested: number }> {
  const siteRoots = workspaceLaunchHandoff.workspaceLaunchSiteRootsForSelection(selection, records);
  const attempted = new Set<string>();
  let scanned = 0;
  for (const siteRoot of siteRoots) {
    try {
      const discovery = discoverNarsSessions({ siteRoot });
      for (const session of discovery.sessions) {
        const normalized = { ...session, site_root: session.site_root ?? siteRoot };
        scanned += 1;
        if (!workspaceLaunchHandoff.workspaceLaunchSessionMatchesSelection(normalized, selection)) continue;
        if (!workspaceLaunchHandoff.workspaceLaunchSessionOwnedCleanupAllowed(normalized)) continue;
        if (!workspaceLaunchHandoff.workspaceLaunchSessionIsTerminalForCleanup(normalized)) continue;
        await workspaceLaunchHandoff.workspaceLaunchRequestStaleSessionCleanup(normalized, attempted);
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

export interface WorkspaceLaunchProjectionObservationRecord {
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
  operatorRouterPort?: number;
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
export type WorkspaceLauncherOutputProjection = 'summary' | 'events' | 'commands' | 'json' | 'quiet';

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

export interface WorkspaceLaunchHandoffRecord {
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

export interface WorkspaceLaunchObservationRecord {
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
  process_ownership?: Record<string, unknown> | null;
  runtime_pid?: number | null;
  attach_commands?: {
    agent_web_ui?: string | null;
    agent_cli?: string | null;
  };
}

export interface WorkspaceLaunchAttemptRecord {
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

export interface WorkspaceLaunchDashboardState {
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

export async function writeWorkspacePlanResult(path: string | undefined, result: unknown): Promise<void> {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

export function normalizeLauncherOutput(value: unknown, options: WorkspaceLaunchPlanOptions): WorkspaceLauncherOutputProjection[] {
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

export function writeLauncherOutput(outputs: WorkspaceLauncherOutputProjection[], event: Record<string, unknown>, human: string): void {
  if (outputs.includes('quiet')) return;
  if (launcherOutputHas(outputs, 'json')) console.log(JSON.stringify(event));
  if (launcherOutputHas(outputs, 'events')) console.log(human);
}

export function formatWorkspaceLaunchSelection(selection: WorkspaceLaunchBrowserSelection): string {
  return `${selection.site.join(',') || '*'} / ${selection.role.join(',') || '*'} / ${selection.operatorSurface.join(',') || 'registry default'} / ${selection.runtime} / ${selection.intelligenceProvider}`;
}

function formatWorkspaceLaunchCommand(args: string[]): string {
  return args.map((arg) => /\s/.test(arg) ? `'${arg.replace(/'/g, "''")}'` : arg).join(' ');
}

export function writeWorkspaceLaunchCommandOutput(outputs: WorkspaceLauncherOutputProjection[], attempt: WorkspaceLaunchAttemptRecord): void {
  if (!launcherOutputHas(outputs, 'commands')) return;
  for (const handoff of attempt.handoffs) {
    if (handoff.argv_redacted.length > 0) console.log(`[launcher:command] ${formatWorkspaceLaunchCommand(handoff.argv_redacted)}`);
  }
}

export function legacyCarrierCompatibility(): WorkspaceLaunchLegacyCarrierCompatibility {
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
  hidden_runtime_start_command: string[];
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
  return canonicalizeWorkspaceLaunchRecordsDomain(records, siteCatalog);
}

export function requireSiteCatalogForInteractiveSelection(
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

export async function workspaceLaunchCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return workspaceLaunchCommandImpl(options, context);
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  return captureWorkspaceLaunchTerminalInvocationCommand(path, args);
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return workspaceLaunchPlanCommandImpl(options, context);
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

export function requestWorkspaceLaunchSelectionUiProjectionOpen(url: string): void {
  void executeOperatorProjectionOpenRequest({
    projection_kind: 'browser_url',
    target_ref: url,
    purpose: 'workspace_launch_interactive_selection_ui',
    caller: { package: '@narada2/cli', command: 'launcher workspace-launch', module: 'commands/launcher' },
    mode: 'execute',
    policy: { allow_visible_host_effect: true },
  }).catch(() => undefined);
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

export type WorkspaceLaunchSelectorOption = WorkspaceLaunchSelectorOptionContract;
export type WorkspaceLaunchSelectorModel = WorkspaceLaunchSelectorModelContract;

export function workspaceLaunchSelectorModel(
  records: WorkspaceLaunchRecord[],
  selection: Partial<WorkspaceLaunchBrowserSelection> = {},
  siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchSelectorModel {
  return workspaceLaunchSelectorModelDomain(records, selection, siteCatalog, workspaceLaunchSelectionContext());
}

export function workspaceLaunchId(prefix: string): string {
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

function workspaceLaunchAttemptStoreContext(): WorkspaceLaunchAttemptStoreContext {
  return {
    expectedLaunchSessionIds: workspaceLaunchExpectedSessionIds,
  };
}

export async function readWorkspaceLaunchRememberedSelection(): Promise<WorkspaceLaunchBrowserSelection | null> {
  return readWorkspaceLaunchRememberedSelectionStore();
}

export async function writeWorkspaceLaunchRememberedSelection(selection: WorkspaceLaunchBrowserSelection): Promise<void> {
  return writeWorkspaceLaunchRememberedSelectionStore(selection);
}

function workspaceLaunchUiSessionPersistenceDir(uiSessionId: string): string {
  return workspaceLaunchUiSessionPersistenceDirStore(uiSessionId);
}

async function persistWorkspaceLaunchDashboardState(
  dir: string,
  uiSession: WorkspaceLaunchUiSessionRecord,
  attempts: WorkspaceLaunchAttemptRecord[],
): Promise<void> {
  return persistWorkspaceLaunchDashboardStateStore(dir, uiSession, attempts);
}

async function loadRecoveredWorkspaceLaunchAttempts(registryPaths: string[]): Promise<WorkspaceLaunchAttemptRecord[]> {
  return loadRecoveredWorkspaceLaunchAttemptsStore(registryPaths, workspaceLaunchAttemptStoreContext());
}


export function workspaceLaunchString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function workspaceLaunchResultSummary(result: unknown, success: boolean): string {
  return workspaceLaunchResultSummaryHandoff(result, success);
}

export function workspaceLaunchActionsForAttempt(attempt: WorkspaceLaunchAttemptRecord): string[] {
  return workspaceLaunchActionsForAttemptHandoff(attempt);
}

export async function workspaceLaunchRequestRuntimeStop(attempt: WorkspaceLaunchAttemptRecord): Promise<Record<string, unknown>> {
  return workspaceLaunchRequestRuntimeStopHandoff(attempt);
}

export async function workspaceLaunchExecuteProjectionAction(
  attempt: WorkspaceLaunchAttemptRecord,
  action: string,
  command: string,
): Promise<WorkspaceLaunchProjectionObservationRecord> {
  return workspaceLaunchExecuteProjectionActionHandoff(attempt, action, command);
}

export function workspaceLaunchHandoffFromResult(
  launchAttemptId: string,
  result: unknown,
  success: boolean,
): WorkspaceLaunchHandoffRecord {
  return workspaceLaunchHandoffFromResultHandoff(launchAttemptId, result, success);
}

export function workspaceLaunchFailedHandoff(launchAttemptId: string, error: unknown): WorkspaceLaunchHandoffRecord {
  return workspaceLaunchFailedHandoffHandoff(launchAttemptId, error);
}

export async function workspaceLaunchRuntimeObservations(
  launchAttemptId: string,
  selection: WorkspaceLaunchBrowserSelection,
  records: WorkspaceLaunchRecord[],
  expectedLaunchSessionIds: string[] = [],
  launchSiteRoots: string[] = [],
): Promise<WorkspaceLaunchObservationRecord[]> {
  return workspaceLaunchRuntimeObservationsHandoff(
    launchAttemptId,
    selection,
    records,
    expectedLaunchSessionIds,
    launchSiteRoots,
  );
}

export function workspaceLaunchExpectedSessionIds(result: unknown): string[] {
  return workspaceLaunchExpectedSessionIdsHandoff(result);
}


export function normalizeWorkspaceLaunchBrowserSelection(payload: Partial<WorkspaceLaunchBrowserSelection>): WorkspaceLaunchBrowserSelection {
  return normalizeWorkspaceLaunchBrowserSelectionDomain(payload);
}

export function resolveWorkspaceLaunchBrowserSelection(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null,
  siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchBrowserSelection {
  return resolveWorkspaceLaunchBrowserSelectionDomain(
    records,
    options,
    rememberedSelection,
    siteCatalog,
    workspaceLaunchSelectionContext(),
  );
}

export function buildWorkspaceLaunchSelectionUiModel(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null = null,
  siteCatalog: ResolvedSiteRoot[] = [],
): Record<string, unknown> {
  return buildWorkspaceLaunchSelectionUiModelDomain(
    records,
    options,
    rememberedSelection,
    siteCatalog,
    workspaceLaunchSelectionContext(),
  );
}

export function registryDefaultOperatorSurfaceLabel(records: WorkspaceLaunchRecord[]): string {
  return registryDefaultOperatorSurfaceLabelDomain(records);
}

export function registryDefaultRuntimeLabel(records: WorkspaceLaunchRecord[]): string {
  return registryDefaultRuntimeLabelDomain(records);
}

export function registryDefaultIntelligenceProviderLabel(defaultProvider?: string): string {
  return registryDefaultIntelligenceProviderLabelDomain(defaultProvider);
}

export function registryDefaultIntelligenceProvider(): string {
  return registryDefaultIntelligenceProviderDomain(workspaceLaunchSelectionContext());
}

export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  return initialOperatorSurfaceValuesDomain(choices, current);
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  return normalizeInteractiveOperatorSurfaceValuesDomain(values);
}

export function intelligenceProviderChoicesForLaunchSelection(args: {
  records: WorkspaceLaunchRecord[];
  operatorSurface: string;
  runtime: string;
}): Array<{ value: string; label: string; hint?: string }> {
  return intelligenceProviderChoicesForLaunchSelectionDomain({ ...args, context: workspaceLaunchSelectionContext() });
}

export function intelligenceProviderChoices({ admittedProviders }: { admittedProviders?: string[] } = {}): Array<{ value: string; label: string; hint?: string }> {
  const context: WorkspaceLaunchSelectionContext = {
    ...workspaceLaunchSelectionContext(),
    admittedProviders,
  };
  return intelligenceProviderChoicesDomain(context);
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return roleChoicesForSelectedSitesDomain(records, siteSelectors);
}

export function initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[] {
  return initialRoleValuesForInteractiveSelectionDomain(roleChoices, explicitRoles);
}

export function unique(values: string[]): string[] {
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

export function resolveRegistryPaths(options: WorkspaceLaunchPlanOptions): string[] {
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

export function normalizeWorkspaceLaunchPlanOptions(options: WorkspaceLaunchPlanOptions): WorkspaceLaunchPlanOptions {
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

export function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions): WorkspaceLaunchRecord[] {
  return selectLaunchRecordsDomain(records, options);
}

export function buildAgentPlan(record: WorkspaceLaunchRecord, options: WorkspaceLaunchPlanOptions): WorkspaceLaunchAgentPlan {
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
  const runtimeStartArguments = [
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
  const operatorSurfaceStartCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    ...runtimeStartArguments,
  ];
  if (record.workspace_root) operatorSurfaceStartCommand.push('--workspace-root', record.workspace_root);
  if (enableNativeShell) operatorSurfaceStartCommand.push('--enable-native-shell');
  operatorSurfaceStartCommand.push('--authority', authority);
  if (intelligenceProvider) operatorSurfaceStartCommand.push('--intelligence-provider', intelligenceProvider);
  operatorSurfaceStartCommand.push('--mcp-scope', mcpScope);
  if (launchBindingPath) operatorSurfaceStartCommand.push('--launch-binding', launchBindingPath);
  if (!launchBindingPath) operatorSurfaceStartCommand.push('--launch-session-id', launchSessionId ?? '');
  if (waitForEnter) operatorSurfaceStartCommand.push('--wait');
  const hiddenRuntimeStartCommand = [
    process.execPath,
    join(naradaProper, 'packages', 'layers', 'cli', 'dist', 'main.js'),
    ...operatorSurfaceStartCommand.slice(5),
  ];
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
    hidden_runtime_start_command: hiddenRuntimeStartCommand,
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

export function normalizeCarrierList(value: string | undefined): string[] {
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
