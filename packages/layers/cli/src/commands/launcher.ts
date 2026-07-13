import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
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
  workspaceLaunchSelectionMode as workspaceLaunchSelectionModeDomain,
  workspaceLaunchSelectorModel as workspaceLaunchSelectorModelDomain,
  type WorkspaceLaunchSelectionContext,
} from './workspace-launch-selection.js';
import {
  closeWorkspaceLaunchUiServer,
  createWorkspaceLaunchUiServer,
  readWorkspaceLaunchUiAsset,
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
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import {
  buildAgentPlan,
  normalizeCarrierList,
  normalizeWorkspaceLaunchPlanOptions,
  readLaunchRegistry,
  readWorkspaceLaunchRecords,
  requireSiteCatalogForInteractiveSelection,
  resolveRegistryPaths,
  selectLaunchRecords,
  type WorkspaceLaunchRegistryContext,
} from './workspace-launch-registry.js';
import type {
  WorkspaceLaunchSelectionCardinality,
  WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection,
  WorkspaceLaunchSelectionMode,
  WorkspaceLaunchOption as WorkspaceLaunchSelectorOptionContract,
  WorkspaceLaunchSelectorModel as WorkspaceLaunchSelectorModelContract,
} from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchAgentPlan,
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchDashboardState,
  WorkspaceLaunchHandoffRecord,
  WorkspaceLaunchLegacyCarrierCompatibility,
  WorkspaceLaunchObservationRecord,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchProjectionObservationRecord,
  WorkspaceLaunchRecord,
  WorkspaceLaunchRecordsLoad,
  WorkspaceLauncherOutputProjection,
} from './workspace-launch-types.js';
import {
  formatWorkspaceLaunchSelection,
  isRecord,
  legacyCarrierCompatibility,
  normalizeLauncherOutput,
  redactWorkspaceLaunchCommand,
  stringArray,
  unique,
  workspaceLaunchId,
  workspaceLaunchLegacyTerminalWtArgs,
  workspaceLaunchProjectionQualifiedAgentId,
  workspaceLaunchSessionIdentityRef,
  workspaceLaunchSiteRootsFromLaunchResult,
  workspaceLaunchStartHiddenProjectionHost,
  workspaceLaunchStartHiddenRuntimeHost,
  workspaceLaunchString,
  writeLauncherOutput,
  writeWorkspaceLaunchCommandOutput,
  writeWorkspacePlanResult,
} from './workspace-launch-support.js';
import type { WorkspaceLaunchSelectionServices } from './workspace-launch-context.js';
export type {
  WorkspaceLaunchAgentPlan,
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchDashboardState,
  WorkspaceLaunchHandoffRecord,
  WorkspaceLaunchLegacyCarrierCompatibility,
  WorkspaceLaunchObservationRecord,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchProjectionObservationRecord,
  WorkspaceLaunchRecord,
  WorkspaceLaunchRecordsLoad,
  WorkspaceLauncherOutputProjection,
} from './workspace-launch-types.js';

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

function workspaceLaunchSelectionServices(): WorkspaceLaunchSelectionServices {
  const context = workspaceLaunchSelectionContext();
  return {
    registryContext: workspaceLaunchRegistryContext(),
    workspaceLaunchSelectorModel: (records, selection = {}, siteCatalog = []) => workspaceLaunchSelectorModelDomain(records, selection, siteCatalog, context),
    normalizeWorkspaceLaunchBrowserSelection: (payload) => normalizeWorkspaceLaunchBrowserSelectionDomain(payload),
    buildWorkspaceLaunchSelectionUiModel: (records, options, rememberedSelection = null, siteCatalog = []) => buildWorkspaceLaunchSelectionUiModelDomain(records, options, rememberedSelection, siteCatalog, context),
    normalizeInteractiveOperatorSurfaceValues: (values) => normalizeInteractiveOperatorSurfaceValuesDomain(values),
    roleChoicesForSelectedSites: (records, siteSelectors) => roleChoicesForSelectedSitesDomain(records, siteSelectors),
    initialRoleValuesForInteractiveSelection: (roleChoices, explicitRoles) => initialRoleValuesForInteractiveSelectionDomain(roleChoices, explicitRoles),
  };
}

export function workspaceLaunchRegistryContext(): WorkspaceLaunchRegistryContext {
  return {
    providerRegistry,
    resolveCarrierRuntimeSelection: resolveWorkspaceCarrierRuntimeSelection,
    legacyCarrierCompatibility,
  };
}

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
  return workspaceLaunchSelectionModeDomain(raw, selection);
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

export async function workspaceLaunchCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return workspaceLaunchCommandImpl(options, context, workspaceLaunchSelectionServices(), workspaceLaunchRegistryContext());
}

export async function captureWorkspaceLaunchTerminalInvocation(path: string, args: string[]): Promise<{ status: number; error?: Error }> {
  return captureWorkspaceLaunchTerminalInvocationCommand(path, args);
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return workspaceLaunchPlanCommandImpl(options, context, workspaceLaunchSelectionServices(), workspaceLaunchRegistryContext());
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

interface WorkspaceLaunchRememberedSelectionRecord {
  schema: 'narada.workspace_launch.remembered_selection.v1';
  updated_at: string;
  selection: WorkspaceLaunchBrowserSelection;
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

