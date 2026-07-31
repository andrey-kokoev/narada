import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as prompts from '@clack/prompts';
import { ensureIntelligenceCatalog } from '@narada2/invokable-intelligence-management';
import { resolveNaradaSitePaths, siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import { readNarsEventLogTail } from '@narada2/nars-session-core/event-log';
import { defaultLaunchRegistryPath } from '../lib/site-root-resolver.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { workspaceLaunchCommand } from './workspace-launch-application.js';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import { readWorkspaceLaunchRecords, readLaunchRegistryRaw, rawLaunchRegistryAgents, type RawAgentRecord } from './workspace-launch-registry.js';
import { narsSessionsCommand } from './nars.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import type { OperatorConsoleOnboardingHandoff } from '@narada2/operator-console-contract';

export interface OnboardingStartOptions {
  platform?: string;
  scope?: string;
  siteRoot?: string;
  registryPath?: string;
  interactive?: boolean;
  demo?: boolean;
  noExec?: boolean;
  format?: CliFormat;
}

export type OnboardingPlatform = 'windows' | 'linux';

export function normalizeOnboardingPlatform(value?: string): OnboardingPlatform {
  const normalized = (value ?? (process.platform === 'win32' ? 'windows' : 'linux')).trim().toLowerCase();
  if (normalized === 'windows' || normalized === 'linux') return normalized;
  throw new Error(`onboarding_platform_unsupported: ${normalized}`);
}

function userSiteLaunchRegistryJson(root: string, platform: OnboardingPlatform = normalizeOnboardingPlatform()): string {
  return `${JSON.stringify({ NaradaRoot: root, Agents: [userSiteLaunchRegistryAgent(root, platform)] }, null, 2)}\n`;
}

export interface OnboardingStatusOptions {
  platform?: string;
  scope?: string;
  siteRoot?: string;
  session?: string;
  format?: CliFormat;
}

type OnboardingFirstUseStatus = 'pending' | 'verified' | 'failed';
type OnboardingResponseKind = 'pending' | 'useful' | 'no_work' | 'failed';

interface OnboardingReadiness {
  status: 'not_started' | 'demo_available' | 'launch_requested' | 'first_use_verified' | 'blocked';
  first_useful_interaction: OnboardingFirstUseStatus;
  evidence: string[];
}

interface OnboardingFirstUseVerification {
  schema: 'narada.onboarding.first_use_verification.v1';
  status: OnboardingFirstUseStatus;
  checked_at: string;
  session_id: string | null;
  events_path: string | null;
  response_kind: OnboardingResponseKind;
  checks: {
    healthy_session: boolean;
    identity_hydrated: boolean;
    input_ready: boolean;
    admitted_message: boolean;
    useful_or_no_work_response: boolean;
  };
  evidence: string[];
}

interface OnboardingState {
  schema: 'narada.user_site_onboarding_state.v1';
  updated_at: string;
  user_site_root: string;
  resident_agent: string;
  readiness: OnboardingReadiness;
  role_expansion: OnboardingRoleExpansionRecommendation;
  launch_registry_path: string | null;
  launch_requested_at: string | null;
  launch_session_id: string | null;
  session_id: string | null;
  verification: OnboardingFirstUseVerification | null;
  projection_binding_path: string | null;
  projection_readiness_path: string | null;
  projection_url: string | null;
}

interface OnboardingRoleExpansionRecommendation {
  status: 'available' | 'not_needed' | 'unavailable' | 'approved' | 'materialized';
  recommended_roles: string[];
  requires_operator_confirmation: boolean;
  trigger: 'after_first_useful_interaction' | 'after_resident_ready';
  next_action: string;
  approved_roles?: string[];
  materialized_roles?: string[];
}

interface OnboardingStatusResult {
  schema: 'narada.onboarding.status.v1';
  status: 'not_started' | 'launch_requested' | 'first_use_verified' | 'blocked';
  mutation_performed: boolean;
  platform: OnboardingPlatform;
  scope: 'user-site';
  user_site: {
    root: string;
    resident_agent: string | null;
  };
  session: {
    id: string | null;
    launch_session_id: string | null;
    display_state: string | null;
    health_status: string | null;
  };
  readiness: OnboardingReadiness;
  verification: OnboardingFirstUseVerification | null;
  role_expansion: OnboardingRoleExpansionRecommendation;
  handoff: OperatorConsoleOnboardingHandoff | null;
  state_path: string | null;
  next_action: string;
  reason_code?: string;
}

export interface OnboardingRoleApprovalOptions {
  platform?: string;
  scope?: string;
  siteRoot?: string;
  roles?: string[];
  confirm?: boolean;
  format?: CliFormat;
}

interface OnboardingRoleApprovalResult {
  schema: 'narada.onboarding.role_expansion_approval.v1';
  status: 'approved_pending_materialization' | 'blocked';
  mutation_performed: boolean;
  user_site: { root: string; resident_agent: string | null };
  approved_roles: string[];
  preview: { action: 'add_roles'; roles: string[]; roster_mutation_performed: false };
  approval_path: string | null;
  state_path: string | null;
  next_action: string;
  reason_code?: string;
}

export interface OnboardingRoleMaterializeOptions {
  platform?: string;
  scope?: string;
  siteRoot?: string;
  roles?: string[];
  format?: CliFormat;
}

interface OnboardingRoleMaterializeResult {
  schema: 'narada.onboarding.role_expansion_materialization.v1';
  status: 'materialized' | 'already_materialized' | 'blocked';
  mutation_performed: boolean;
  user_site: { root: string; resident_agent: string | null };
  materialized_roles: string[];
  pending_roles: string[];
  registry_path: string | null;
  approval_path: string | null;
  state_path: string | null;
  next_action: string;
  reason_code?: string;
}

interface OnboardingResult {
  schema: 'narada.onboarding.start.v1';
  status: 'ready' | 'launched' | 'planned' | 'demo_available' | 'cancelled' | 'blocked' | 'error';
  mutation_performed: boolean;
  platform: OnboardingPlatform;
  scope: 'user-site';
  user_site: {
    root: string;
    registry_path: string;
    resident_agent: string | null;
  };
  defaults: {
    assistant_label: 'General assistant';
    role: 'resident';
    operator_surface: string | null;
    runtime_host: string | null;
    intelligence: {
      resolution_phase: 'runtime-invocation';
      authority: 'site-catalog-and-materialized-policy';
    };
  };
  role_expansion: OnboardingRoleExpansionRecommendation;
  readiness: OnboardingReadiness;
  launch: unknown | null;
  handoff: OperatorConsoleOnboardingHandoff | null;
  intelligence_catalog?: unknown;
  state_path: string | null;
  reason_code?: string;
  message?: string;
  next_action: string;
}

export function userSiteRoot(input?: string, platform: OnboardingPlatform = normalizeOnboardingPlatform()): string {
  if (input || process.env.NARADA_USER_SITE_ROOT) {
    return resolve(input ?? process.env.NARADA_USER_SITE_ROOT!);
  }
  if (platform === 'linux') {
    return resolve(join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'narada', 'user'));
  }
  return resolve(join(homedir(), 'Narada'));
}

export function userSiteRegistryPath(
  root: string,
  input?: string,
  platform: OnboardingPlatform = normalizeOnboardingPlatform(),
): string {
  if (input) return resolve(input);
  if (platform === 'linux') return join(root, 'config', 'launch', 'agents.json');
  const configuredUserSiteRoot = process.env.NARADA_USER_SITE_ROOT ? resolve(process.env.NARADA_USER_SITE_ROOT) : null;
  return configuredUserSiteRoot && configuredUserSiteRoot.toLowerCase() === root.toLowerCase()
    ? defaultLaunchRegistryPath()
    : join(root, 'config', 'launch', 'agents.psd1');
}

function isIntelligenceSetupFailure(message: string): boolean {
  return /workspace[_-]launch[_-]catalog[_-]preflight|intelligence[_-](?:context|local[_-]readiness|catalog)/i.test(message);
}

function recordSiteRoot(record: WorkspaceLaunchRecord): string {
  return resolve(record.site_root);
}

function findResidentRecord(records: WorkspaceLaunchRecord[], root: string): WorkspaceLaunchRecord | null {
  const matches = records.filter((record) => record.role.toLowerCase() === 'resident' && recordSiteRoot(record).toLowerCase() === root.toLowerCase());
  if (matches.length > 1) throw new Error(`user_site_resident_ambiguous: ${matches.map((record) => record.agent).join(', ')}`);
  return matches[0] ?? null;
}

function roleExpansionRecommendation(
  records: WorkspaceLaunchRecord[],
  root: string,
  residentPresent: boolean,
  firstUseVerified = false,
  approvedRoles: string[] = [],
): OnboardingRoleExpansionRecommendation {
  if (!residentPresent) {
    return {
      status: 'unavailable',
      recommended_roles: [],
      requires_operator_confirmation: true,
      trigger: 'after_resident_ready',
      next_action: 'Start the User Site resident before considering additional roles.',
    };
  }
  if (!firstUseVerified) {
    return {
      status: 'unavailable',
      recommended_roles: [],
      requires_operator_confirmation: true,
      trigger: 'after_first_useful_interaction',
      next_action: 'Verify one useful resident interaction before offering role expansion.',
    };
  }
  const roles = new Set(records.filter((record) => recordSiteRoot(record).toLowerCase() === root.toLowerCase()).map((record) => record.role.toLowerCase()));
  const cumulativeApprovedRoles: string[] = [...new Set(approvedRoles.map((role) => role.toLowerCase()))]
    .filter((role) => role === 'architect' || role === 'builder');
  const recommendedRoles = ['architect', 'builder']
    .filter((role) => !roles.has(role) && !cumulativeApprovedRoles.includes(role));
  return {
    status: recommendedRoles.length > 0 ? 'available' : cumulativeApprovedRoles.length > 0 ? 'approved' : 'not_needed',
    recommended_roles: recommendedRoles,
    requires_operator_confirmation: recommendedRoles.length > 0,
    trigger: 'after_first_useful_interaction',
    next_action: recommendedRoles.length > 0
      ? 'After the first useful interaction, offer the operator an explicit Add recommended roles action.'
      : cumulativeApprovedRoles.length > 0
        ? 'Materialize the approved roles with narada onboarding roles materialize; approval alone does not mutate the launch registry.'
        : 'Keep the current role roster; no default expansion is needed.',
    ...(cumulativeApprovedRoles.length > 0 ? { approved_roles: cumulativeApprovedRoles } : {}),
  };
}

function onboardingStatePath(root: string): string {
  return join(siteAuthorityRootFromSiteRoot(root), 'runtime', 'onboarding', 'user-site-onboarding.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isVerification(value: unknown): value is OnboardingFirstUseVerification {
  if (!isRecord(value)) return false;
  const checks = value.checks;
  return value.schema === 'narada.onboarding.first_use_verification.v1'
    && (value.status === 'pending' || value.status === 'verified' || value.status === 'failed')
    && typeof value.checked_at === 'string'
    && (value.session_id === null || typeof value.session_id === 'string')
    && (value.events_path === null || typeof value.events_path === 'string')
    && (value.response_kind === 'pending' || value.response_kind === 'useful' || value.response_kind === 'no_work' || value.response_kind === 'failed')
    && isRecord(checks)
    && typeof checks.healthy_session === 'boolean'
    && typeof checks.identity_hydrated === 'boolean'
    && typeof checks.input_ready === 'boolean'
    && typeof checks.admitted_message === 'boolean'
    && typeof checks.useful_or_no_work_response === 'boolean'
    && stringArray(value.evidence);
}

function isReadiness(value: unknown): value is OnboardingReadiness {
  return isRecord(value)
    && (value.status === 'not_started' || value.status === 'demo_available' || value.status === 'launch_requested' || value.status === 'first_use_verified' || value.status === 'blocked')
    && (value.first_useful_interaction === 'pending' || value.first_useful_interaction === 'verified' || value.first_useful_interaction === 'failed')
    && stringArray(value.evidence);
}

function isRoleExpansion(value: unknown): value is OnboardingRoleExpansionRecommendation {
  return isRecord(value)
    && (value.status === 'available' || value.status === 'not_needed' || value.status === 'unavailable' || value.status === 'approved' || value.status === 'materialized')
    && stringArray(value.recommended_roles)
    && typeof value.requires_operator_confirmation === 'boolean'
    && (value.trigger === 'after_first_useful_interaction' || value.trigger === 'after_resident_ready')
    && typeof value.next_action === 'string'
    && (value.approved_roles === undefined || stringArray(value.approved_roles))
    && (value.materialized_roles === undefined || stringArray(value.materialized_roles));
}

function parseOnboardingState(value: unknown): OnboardingState {
  if (!isRecord(value) || value.schema !== 'narada.user_site_onboarding_state.v1') {
    throw new Error('onboarding_state_invalid_schema');
  }
  if (typeof value.updated_at !== 'string' || typeof value.user_site_root !== 'string' || typeof value.resident_agent !== 'string') {
    throw new Error('onboarding_state_invalid_identity');
  }
  if (!isReadiness(value.readiness) || !isRoleExpansion(value.role_expansion)) {
    throw new Error('onboarding_state_invalid_posture');
  }
  if (!(value.launch_requested_at === null || typeof value.launch_requested_at === 'string')) {
    throw new Error('onboarding_state_invalid_launch_timestamp');
  }
  if (!(value.launch_registry_path === undefined || value.launch_registry_path === null || typeof value.launch_registry_path === 'string')) {
    throw new Error('onboarding_state_invalid_registry_path');
  }
  if (!(value.launch_session_id === undefined || value.launch_session_id === null || typeof value.launch_session_id === 'string')) {
    throw new Error('onboarding_state_invalid_launch_session');
  }
  if (!(value.session_id === null || typeof value.session_id === 'string')) {
    throw new Error('onboarding_state_invalid_session');
  }
  if (!(value.verification === null || isVerification(value.verification))) {
    throw new Error('onboarding_state_invalid_verification');
  }
  for (const [key, field] of [
    ['projection_binding_path', value.projection_binding_path],
    ['projection_readiness_path', value.projection_readiness_path],
    ['projection_url', value.projection_url],
  ] as const) {
    if (!(field === undefined || field === null || typeof field === 'string')) {
      throw new Error(`onboarding_state_invalid_${key}`);
    }
  }
  return {
    ...(value as unknown as OnboardingState),
    launch_registry_path: value.launch_registry_path === undefined ? null : value.launch_registry_path as string | null,
    launch_session_id: value.launch_session_id === undefined ? null : value.launch_session_id as string | null,
    projection_binding_path: value.projection_binding_path === undefined ? null : value.projection_binding_path as string | null,
    projection_readiness_path: value.projection_readiness_path === undefined ? null : value.projection_readiness_path as string | null,
    projection_url: value.projection_url === undefined ? null : value.projection_url as string | null,
  };
}

function readOnboardingState(root: string): OnboardingState | null {
  const path = onboardingStatePath(root);
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`onboarding_state_invalid_json: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseOnboardingState(value);
}

function safeHttpUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function projectionHandoffFromLaunch(value: unknown, residentAgent: string): {
  bindingPath: string | null;
  readinessPath: string | null;
  handoff: OperatorConsoleOnboardingHandoff | null;
} {
  const body = isRecord(value) && isRecord(value.result) ? value.result : value;
  if (!isRecord(body)) return { bindingPath: null, readinessPath: null, handoff: null };
  const agents = [
    ...(Array.isArray(body.launch_agents) ? body.launch_agents : []),
    ...(Array.isArray(body.selected_agents) ? body.selected_agents : []),
  ].filter(isRecord);
  const residentAliases = new Set(residentIdentityAliases(residentAgent));
  const selected = agents.find((agent) => sessionIdentityAliases(agent).some((alias) => residentAliases.has(alias)))
    ?? agents[0]
    ?? null;
  const binding = selected && isRecord(selected.operator_projection_launch_binding)
    ? selected.operator_projection_launch_binding
    : isRecord(body.operator_projection_launch_binding)
      ? body.operator_projection_launch_binding
      : null;
  const bindingPath = binding && typeof binding.path === 'string' ? binding.path : null;
  const readinessPath = bindingPath ? `${bindingPath}.ready.json` : null;
  const requests = [
    ...(selected && Array.isArray(selected.operator_projection_open_requests) ? selected.operator_projection_open_requests : []),
    ...(Array.isArray(body.operator_projection_open_requests) ? body.operator_projection_open_requests : []),
    ...(isRecord(body.operator_projection_open_request) ? [body.operator_projection_open_request] : []),
  ].filter(isRecord);
  const url = requests
    .map((request) => safeHttpUrl(request.url) ?? safeHttpUrl(request.target_ref))
    .find((candidate): candidate is string => candidate !== null) ?? null;
  const sessionId = selected && typeof selected.launch_session_id === 'string'
    ? selected.launch_session_id
    : null;
  const handoff = bindingPath || requests.length > 0
    ? {
        kind: 'browser' as const,
        status: url ? 'ready' as const : 'pending' as const,
        url,
        session_id: sessionId,
        message: url ? 'Agent Web UI is ready.' : 'Waiting for the Agent Web UI readiness artifact.',
      }
    : null;
  return { bindingPath, readinessPath, handoff };
}

function readProjectionHandoff(state: OnboardingState): OperatorConsoleOnboardingHandoff | null {
  const persistedUrl = safeHttpUrl(state.projection_url);
  if (persistedUrl) {
    return {
      kind: 'browser',
      status: 'ready',
      url: persistedUrl,
      session_id: state.launch_session_id,
      message: 'Agent Web UI is ready.',
    };
  }
  if (state.projection_readiness_path && existsSync(state.projection_readiness_path)) {
    try {
      const readiness = JSON.parse(readFileSync(state.projection_readiness_path, 'utf8')) as unknown;
      const record = isRecord(readiness) ? readiness : null;
      const url = record
        ? safeHttpUrl(record.url) ?? safeHttpUrl(record.browser_url) ?? safeHttpUrl(record.operator_projection_url)
        : null;
      if (url) {
        return {
          kind: 'browser',
          status: 'ready',
          url,
          session_id: state.launch_session_id,
          message: 'Agent Web UI is ready.',
        };
      }
    } catch {
      // The projection may still be writing its readiness artifact.
    }
  }
  return state.projection_binding_path || state.projection_readiness_path
    ? {
        kind: 'browser',
        status: 'pending',
        url: null,
        session_id: state.launch_session_id,
        message: 'Waiting for the Agent Web UI readiness artifact.',
      }
    : null;
}

async function atomicWriteText(path: string, contents: string): Promise<void> {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, contents, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultUserSiteId(root: string): string {
  const configured = process.env.NARADA_USER_SITE_ID?.trim();
  if (configured) return configured;
  const defaultRoot = resolve(join(homedir(), 'Narada'));
  const username = (process.env.USERNAME ?? process.env.USER ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (username && root.toLowerCase() === defaultRoot.toLowerCase()) return `${username}-user`;
  return 'user-site';
}

function powerShellDataString(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function userSiteLaunchRegistryAgent(root: string, platform: OnboardingPlatform = normalizeOnboardingPlatform()): Record<string, unknown> {
  const siteId = defaultUserSiteId(root);
  const launcher = siteId.endsWith('-user') ? `${siteId}.ps1` : 'narada-user.ps1';
  const launcherPath = platform === 'linux'
    ? process.env.NARADA_CLI_ENTRYPOINT ?? process.argv[1] ?? 'narada'
    : undefined;
  return {
    Agent: `${siteId}.resident`,
    Title: 'General assistant',
    Role: 'resident',
    Site: siteId,
    NaradaRoot: root,
    WorkspaceRoot: root,
    SiteRoot: root,
    ...(launcherPath ? { LauncherPath: launcherPath } : { Launcher: launcher }),
    OperatorSurface: 'agent-web-ui',
    Runtime: 'narada-agent-runtime-server',
    McpScope: 'none',
    EnableNativeShell: false,
  };
}

const LAUNCH_REGISTRY_STRING_FIELDS = [
  'Agent',
  'Title',
  'Role',
  'Site',
  'NaradaRoot',
  'WorkspaceRoot',
  'SiteRoot',
  'Launcher',
  'LauncherPath',
  'OperatorSurface',
  'Carrier',
  'Runtime',
  'Authority',
  'McpScope',
] as const;

function renderLaunchRegistryAgentBlock(agent: Record<string, unknown>): string[] {
  const lines = ['    @{'];
  for (const field of LAUNCH_REGISTRY_STRING_FIELDS) {
    const value = agent[field];
    if (typeof value === 'string' && value.length > 0) lines.push(`      ${field} = ${powerShellDataString(value)}`);
  }
  lines.push(`      EnableNativeShell = ${agent.EnableNativeShell === true ? '$true' : '$false'}`);
  lines.push('    }');
  return lines;
}

function userSiteLaunchRegistryText(root: string, platform: OnboardingPlatform = normalizeOnboardingPlatform()): string {
  return [
    '@{',
    '  Agents = @(',
    ...renderLaunchRegistryAgentBlock(userSiteLaunchRegistryAgent(root, platform)),
    '  )',
    '}',
  ].join('\n') + '\n';
}

function userSiteLaunchRegistryRoleAgent(
  root: string,
  role: 'architect' | 'builder',
  platform: OnboardingPlatform = normalizeOnboardingPlatform(),
): Record<string, unknown> {
  const siteId = defaultUserSiteId(root);
  const launcher = siteId.endsWith('-user') ? `${siteId}.ps1` : 'narada-user.ps1';
  const launcherPath = platform === 'linux'
    ? process.env.NARADA_CLI_ENTRYPOINT ?? process.argv[1] ?? 'narada'
    : undefined;
  return {
    Agent: `${siteId}.${role}`,
    Title: role === 'architect' ? 'Architect' : 'Builder',
    Role: role,
    Site: siteId,
    NaradaRoot: root,
    WorkspaceRoot: root,
    SiteRoot: root,
    ...(launcherPath ? { LauncherPath: launcherPath } : { Launcher: launcher }),
    OperatorSurface: 'agent-cli',
    Runtime: 'narada-agent-runtime-server',
    EnableNativeShell: false,
  };
}

export function appendAgentsToPsd1RegistryText(text: string, agentBlocks: string[][]): string {
  if (agentBlocks.length === 0) return text;
  const openMatch = /(^|\n)[ \t]*Agents[ \t]*=[ \t]*@\([ \t]*(\r?\n|$)/.exec(text);
  if (!openMatch) throw new Error('launch_registry_agents_array_not_found');
  const searchFrom = openMatch.index + openMatch[0].length;
  const closeMatch = /(^|\n)([ \t]*\)[ \t]*(\r?\n|$))/.exec(text.slice(searchFrom));
  if (!closeMatch) throw new Error('launch_registry_agents_array_not_found');
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const insertAt = searchFrom + closeMatch.index + (closeMatch[1] ? closeMatch[1].length : 0);
  const insertion = agentBlocks.map((block) => block.join(lineEnding) + lineEnding).join('');
  return `${text.slice(0, insertAt)}${insertion}${text.slice(insertAt)}`;
}

export function appendAgentsToJsonRegistryText(text: string, newAgents: Record<string, unknown>[]): string {
  if (newAgents.length === 0) return text;
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const existing = Array.isArray(parsed.Agents) ? parsed.Agents : parsed.Agents ? [parsed.Agents] : [];
  return `${JSON.stringify({ ...parsed, Agents: [...existing, ...newAgents] }, null, 2)}\n`;
}

export async function ensureUserSiteProvisioned(
  root: string,
  registryPath: string,
  context: CommandContext,
  platform: OnboardingPlatform = normalizeOnboardingPlatform(),
): Promise<{
  site_created: boolean;
  launch_registry_created: boolean;
  intelligence_catalog: Awaited<ReturnType<typeof ensureIntelligenceCatalog>>;
}> {
  let siteCreated = false;
  // The install target may already exist as an empty directory. The Site
  // contract is established by config.json, not by directory existence.
  if (!existsSync(join(root, 'config.json'))) {
    const { sitesInitCommand } = await import('./sites.js');
    const initialized = await sitesInitCommand(defaultUserSiteId(root), {
      substrate: platform === 'linux' ? 'linux-user' : 'windows-native',
      authorityLocus: 'user',
      root,
      sync: 'hybrid_capable_plain_folder',
      registryDbPath: join(root, 'registry.db'),
      dryRun: false,
      format: 'json',
      verbose: false,
    }, context);
    if (initialized.exitCode !== ExitCode.SUCCESS) {
      throw new Error(`user_site_bootstrap_failed: ${JSON.stringify(initialized.result)}`);
    }
    siteCreated = true;
  }
  let registryCreated = false;
  if (!existsSync(registryPath)) {
    await mkdir(dirname(registryPath), { recursive: true });
    await atomicWriteText(
      registryPath,
      registryPath.toLowerCase().endsWith('.json')
        ? userSiteLaunchRegistryJson(root, platform)
        : userSiteLaunchRegistryText(root, platform),
    );
    registryCreated = true;
  }
  const intelligenceCatalog = await ensureIntelligenceCatalog({
    siteRoot: root,
    targetSiteId: defaultUserSiteId(root),
    userSiteId: defaultUserSiteId(root),
    hostSiteId: process.env.NARADA_HOST_SITE_ID ?? defaultUserSiteId(root),
  });
  return {
    site_created: siteCreated,
    launch_registry_created: registryCreated,
    intelligence_catalog: intelligenceCatalog,
  };
}

async function refreshRoleExpansionRecommendation(
  root: string,
  state: OnboardingState,
  firstUseVerified: boolean,
  platform: OnboardingPlatform = normalizeOnboardingPlatform(),
): Promise<OnboardingRoleExpansionRecommendation> {
  if (state.role_expansion.status === 'approved' || state.role_expansion.status === 'materialized') return state.role_expansion;
  try {
    const registryPath = state.launch_registry_path ?? userSiteRegistryPath(root, undefined, platform);
    if (!existsSync(registryPath)) return state.role_expansion;
    const loaded = await readWorkspaceLaunchRecords({ registryPath });
    const resident = findResidentRecord(loaded.records, root);
    return roleExpansionRecommendation(
      loaded.records,
      root,
      resident !== null,
      firstUseVerified,
      state.role_expansion.approved_roles ?? [],
    );
  } catch {
    // Readiness proof is independent from roster refresh. Preserve the last
    // durable recommendation and let the next approval surface report roster drift.
    return state.role_expansion;
  }
}

function roleExpansionEqual(
  left: OnboardingRoleExpansionRecommendation,
  right: OnboardingRoleExpansionRecommendation,
): boolean {
  return left.status === right.status
    && left.recommended_roles.join('\u0000') === right.recommended_roles.join('\u0000')
    && left.requires_operator_confirmation === right.requires_operator_confirmation
    && left.trigger === right.trigger
    && left.next_action === right.next_action
    && (left.approved_roles ?? []).join('\u0000') === (right.approved_roles ?? []).join('\u0000');
}

export async function onboardingStatusCommand(
  options: OnboardingStatusOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const platform = normalizeOnboardingPlatform(options.platform);
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot, platform);
    const statePath = onboardingStatePath(root);
    const state = readOnboardingState(root);
    if (!state) {
      const result: OnboardingStatusResult = {
        schema: 'narada.onboarding.status.v1',
        status: 'not_started',
        mutation_performed: false,
        platform,
        scope: 'user-site',
        user_site: { root, resident_agent: null },
        session: { id: null, launch_session_id: null, display_state: null, health_status: null },
        readiness: { status: 'not_started', first_useful_interaction: 'pending', evidence: [] },
        verification: null,
        role_expansion: {
          status: 'unavailable',
          recommended_roles: [],
          requires_operator_confirmation: true,
          trigger: 'after_resident_ready',
          next_action: 'Run onboarding start before checking first-use readiness.',
        },
        handoff: null,
        state_path: existsSync(statePath) ? statePath : null,
        next_action: 'Run `narada onboarding start` to start the User Site resident.',
        reason_code: 'onboarding_state_missing',
      };
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, onboardingStatusHuman(result), options.format ?? 'human') };
    }

    const sessionsResult = await narsSessionsCommand({
      siteRoot: root,
      health: true,
      limit: 50,
      format: 'json',
    }, context);
    if (sessionsResult.exitCode !== ExitCode.SUCCESS) {
      throw new Error('onboarding_session_discovery_failed');
    }
    const raw = sessionsResult.result;
    const body = isRecord(raw) && isRecord(raw.result) ? raw.result : raw;
    const sessions = isRecord(body) && Array.isArray(body.sessions)
      ? body.sessions.filter(isRecord)
      : [];
    const session = selectOnboardingSession(
      sessions,
      state.resident_agent,
      state.launch_session_id,
      state.session_id,
      options.session,
    );
    const observedVerification = buildFirstUseVerification(root, session);
    const priorVerificationIsStable = state.verification?.status === 'verified'
      && state.readiness.first_useful_interaction === 'verified'
      && state.session_id !== null
      && state.verification.session_id === state.session_id
      && (!session || session.session_id === state.session_id);
    const verification = priorVerificationIsStable ? state.verification! : observedVerification;
    const currentFirstUseVerified = verification.status === 'verified';
    const readiness: OnboardingReadiness = {
      ...state.readiness,
      status: currentFirstUseVerified
        ? 'first_use_verified'
        : verification.status === 'failed'
          ? 'blocked'
          : state.readiness.status,
      first_useful_interaction: currentFirstUseVerified && priorVerificationIsStable ? 'verified' : verification.status,
      evidence: priorVerificationIsStable
        ? state.readiness.evidence
        : [...new Set([...state.readiness.evidence, ...verification.evidence])],
    };
    const roleExpansion = currentFirstUseVerified
      ? await refreshRoleExpansionRecommendation(root, state, true, platform)
      : state.role_expansion;
    const roleChanged = !roleExpansionEqual(roleExpansion, state.role_expansion);
    const status: OnboardingStatusResult['status'] = verification.status === 'verified'
      ? 'first_use_verified'
      : verification.status === 'failed'
        ? 'blocked'
        : 'launch_requested';
    const nextAction = status === 'first_use_verified'
      ? roleExpansion.status === 'available'
        ? 'Review the contextual architect/builder recommendation; adding roles still requires explicit operator approval.'
        : 'The resident-only User Site path is ready.'
      : verification.status === 'failed'
        ? 'Inspect the operator surface error, repair the resident session, and rerun onboarding status.'
        : session
          ? 'Use the operator surface and send one human request, then rerun `narada onboarding status`.'
          : 'Wait for the resident session to appear, then rerun `narada onboarding status`.';
    const result: OnboardingStatusResult = {
      schema: 'narada.onboarding.status.v1',
      status,
      mutation_performed: !priorVerificationIsStable || roleChanged,
      platform: normalizeOnboardingPlatform(options.platform),
      scope: 'user-site',
      user_site: { root, resident_agent: state.resident_agent },
      session: {
        id: typeof session?.session_id === 'string' ? session.session_id : null,
        launch_session_id: typeof session?.launch_session_id === 'string' ? session.launch_session_id : null,
        display_state: typeof session?.display_state === 'string' ? session.display_state : null,
        health_status: typeof session?.health_status === 'string' ? session.health_status : null,
      },
      readiness,
      verification,
      role_expansion: roleExpansion,
      handoff: readProjectionHandoff(state),
      state_path: priorVerificationIsStable && !roleChanged
        ? statePath
        : await persistOnboardingState(root, state.resident_agent, readiness, roleExpansion, {
            launchSessionId: typeof session?.launch_session_id === 'string' ? session.launch_session_id : state.launch_session_id,
            sessionId: typeof session?.session_id === 'string' ? session.session_id : state.session_id,
            verification,
          }),
      next_action: nextAction,
      ...(verification.status === 'failed' ? { reason_code: 'first_use_verification_failed' } : {}),
    };
    return {
      exitCode: status === 'blocked' ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
      result: formattedResult(result, onboardingStatusHuman(result), options.format ?? 'human'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: OnboardingStatusResult = {
      schema: 'narada.onboarding.status.v1',
      status: 'blocked',
      mutation_performed: false,
      platform: normalizeOnboardingPlatform(options.platform),
      scope: 'user-site',
      user_site: { root: userSiteRoot(options.siteRoot, normalizeOnboardingPlatform(options.platform)), resident_agent: null },
      session: { id: null, launch_session_id: null, display_state: null, health_status: null },
      readiness: { status: 'blocked', first_useful_interaction: 'pending', evidence: ['status_check_failed'] },
      verification: null,
      role_expansion: {
        status: 'unavailable',
        recommended_roles: [],
        requires_operator_confirmation: true,
        trigger: 'after_resident_ready',
        next_action: 'Resolve the onboarding status prerequisite, then retry.',
      },
      handoff: null,
      state_path: null,
      next_action: 'Resolve the reported onboarding status failure, then retry.',
      reason_code: message,
    };
    return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, onboardingStatusHuman(result), options.format ?? 'human') };
  }
}

export async function onboardingRoleApprovalCommand(
  options: OnboardingRoleApprovalOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const platform = normalizeOnboardingPlatform(options.platform);
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot, platform);
    const state = readOnboardingState(root);
    const blocked = (reasonCode: string, nextAction: string): { exitCode: ExitCode; result: unknown } => {
      const result: OnboardingRoleApprovalResult = {
        schema: 'narada.onboarding.role_expansion_approval.v1',
        status: 'blocked',
        mutation_performed: false,
        user_site: { root, resident_agent: state?.resident_agent ?? null },
        approved_roles: [],
        preview: { action: 'add_roles', roles: [], roster_mutation_performed: false },
        approval_path: null,
        state_path: state ? onboardingStatePath(root) : null,
        next_action: nextAction,
        reason_code: reasonCode,
      };
      return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, onboardingRoleApprovalHuman(result), options.format ?? 'human') };
    };
    if (!state) return blocked('onboarding_state_missing', 'Run onboarding start, then verify first use before approving role expansion.');
    if (state.readiness.first_useful_interaction !== 'verified') {
      return blocked('role_expansion_requires_first_use', 'Run onboarding status after one useful resident interaction, then retry approval.');
    }
    if (options.confirm !== true) {
      return blocked('role_expansion_confirmation_required', 'Review the architect/builder preview, then rerun with --confirm.');
    }

    const currentRecommendation = await refreshRoleExpansionRecommendation(root, state, true, platform);
    if (currentRecommendation.status !== 'available') {
      return blocked('role_expansion_not_available', 'The current resident roster has no pending role expansion recommendation.');
    }

    const requestedRoles = [...new Set((options.roles?.length ? options.roles : currentRecommendation.recommended_roles)
      .map((role) => role.trim().toLowerCase()).filter(Boolean))];
    const allowedRoles = new Set(['architect', 'builder']);
    const recommendedRoles = new Set(currentRecommendation.recommended_roles.map((role) => role.toLowerCase()));
    const invalidRoles = requestedRoles.filter((role) => !allowedRoles.has(role) || !recommendedRoles.has(role));
    if (requestedRoles.length === 0 || invalidRoles.length > 0) {
      return blocked('role_expansion_roles_not_admitted', 'The requested roles are no longer admitted by the current User Site roster; refresh status and retry.');
    }

    const approvalPath = onboardingRoleApprovalPath(root);
    const previousApproval = existsSync(approvalPath) ? readFileSync(approvalPath, 'utf8') : null;
    const previouslyApproved = state.role_expansion.approved_roles ?? [];
    const approvedRoles = [...new Set([...previouslyApproved, ...requestedRoles])];
    const remainingRoles = currentRecommendation.recommended_roles.filter((role) => !approvedRoles.includes(role));
    const nextAction = remainingRoles.length > 0
      ? `Approval recorded for ${requestedRoles.join(', ')}. Review and approve the remaining roles: ${remainingRoles.join(', ')}.`
      : 'Materialize the approved roles with narada onboarding roles materialize; this approval does not mutate the launch registry.';
    const approval = {
      schema: 'narada.onboarding.role_expansion_approval.v1',
      status: 'approved_pending_materialization',
      approved_at: new Date().toISOString(),
      approved_by: process.env.NARADA_OPERATOR_ID ?? 'operator',
      user_site_root: root,
      resident_agent: state.resident_agent,
      approved_roles: requestedRoles,
      cumulative_approved_roles: approvedRoles,
      preview: {
        action: 'add_roles',
        roles: requestedRoles,
        roster_mutation_performed: false,
      },
      source_readiness: state.readiness,
      next_action: nextAction,
    };
    await mkdir(join(siteAuthorityRootFromSiteRoot(root), 'runtime', 'onboarding'), { recursive: true });
    await atomicWriteJson(approvalPath, approval);
    const roleExpansion: OnboardingRoleExpansionRecommendation = {
      ...currentRecommendation,
      status: remainingRoles.length > 0 ? 'available' : 'approved',
      recommended_roles: remainingRoles,
      requires_operator_confirmation: remainingRoles.length > 0,
      approved_roles: approvedRoles,
      next_action: nextAction,
    };
    let statePath: string;
    try {
      statePath = await persistOnboardingState(root, state.resident_agent, state.readiness, roleExpansion, {
        launchSessionId: state.launch_session_id,
        sessionId: state.session_id,
        verification: state.verification,
      });
    } catch (error) {
      if (previousApproval !== null) await atomicWriteText(approvalPath, previousApproval);
      else await rm(approvalPath, { force: true });
      throw error;
    }
    const result: OnboardingRoleApprovalResult = {
      schema: 'narada.onboarding.role_expansion_approval.v1',
      status: 'approved_pending_materialization',
      mutation_performed: true,
      user_site: { root, resident_agent: state.resident_agent },
      approved_roles: requestedRoles,
      preview: { action: 'add_roles', roles: requestedRoles, roster_mutation_performed: false },
      approval_path: approvalPath,
      state_path: statePath,
      next_action: nextAction,
    };
    return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, onboardingRoleApprovalHuman(result), options.format ?? 'human') };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: OnboardingRoleApprovalResult = {
      schema: 'narada.onboarding.role_expansion_approval.v1',
      status: 'blocked',
      mutation_performed: false,
      user_site: { root: userSiteRoot(options.siteRoot, normalizeOnboardingPlatform(options.platform)), resident_agent: null },
      approved_roles: [],
      preview: { action: 'add_roles', roles: [], roster_mutation_performed: false },
      approval_path: null,
      state_path: null,
      next_action: 'Resolve the reported role approval failure, then retry.',
      reason_code: message,
    };
    return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, onboardingRoleApprovalHuman(result), options.format ?? 'human') };
  }
}

interface OnboardingRoleExpansionApproval {
  schema: 'narada.onboarding.role_expansion_approval.v1';
  status: 'approved_pending_materialization' | 'materialized';
  approved_at: string;
  approved_by: string;
  user_site_root: string;
  resident_agent: string;
  approved_roles: string[];
  cumulative_approved_roles: string[];
  preview: { action: string; roles: string[]; roster_mutation_performed: boolean };
  source_readiness: unknown;
  next_action: string;
  materialized_roles?: string[];
  materialized_at?: string;
}

function readRoleExpansionApproval(path: string): OnboardingRoleExpansionApproval | null {
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value) || value.schema !== 'narada.onboarding.role_expansion_approval.v1') return null;
  if (value.status !== 'approved_pending_materialization' && value.status !== 'materialized') return null;
  if (!stringArray(value.cumulative_approved_roles)) return null;
  if (value.materialized_roles !== undefined && !stringArray(value.materialized_roles)) return null;
  return value as unknown as OnboardingRoleExpansionApproval;
}

function rawString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function rawAgentSiteRoot(raw: { SiteRoot?: string; NaradaRoot?: string }, agent: RawAgentRecord): string | null {
  const value = rawString(agent.SiteRoot) ?? rawString(raw.SiteRoot) ?? rawString(agent.NaradaRoot) ?? rawString(raw.NaradaRoot);
  return value ? resolve(value) : null;
}

function rawAgentRole(agent: RawAgentRecord): string {
  const explicit = rawString(agent.Role);
  if (explicit) return explicit.toLowerCase();
  const id = rawString(agent.Agent) ?? '';
  return (id.split('.').at(-1) ?? id).replace(/\d+$/, '').toLowerCase();
}

function onboardingRoleMaterializeHuman(result: OnboardingRoleMaterializeResult): string[] {
  return [
    'Narada onboarding role materialization',
    `Workspace: ${result.user_site.root}`,
    `Resident: ${result.user_site.resident_agent ?? 'not configured'}`,
    `Status: ${result.status}`,
    `Materialized: ${result.materialized_roles.join(', ') || 'none'}`,
    `Pending: ${result.pending_roles.join(', ') || 'none'}`,
    result.registry_path ? `Registry: ${result.registry_path}` : '',
    `Next: ${result.next_action}`,
    result.reason_code ? `Reason: ${result.reason_code}` : '',
  ].filter(Boolean);
}

export async function onboardingRoleMaterializeCommand(
  options: OnboardingRoleMaterializeOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const platform = normalizeOnboardingPlatform(options.platform);
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot, platform);
    const state = readOnboardingState(root);
    const blocked = (reasonCode: string, nextAction: string): { exitCode: ExitCode; result: unknown } => {
      const result: OnboardingRoleMaterializeResult = {
        schema: 'narada.onboarding.role_expansion_materialization.v1',
        status: 'blocked',
        mutation_performed: false,
        user_site: { root, resident_agent: state?.resident_agent ?? null },
        materialized_roles: [],
        pending_roles: [],
        registry_path: null,
        approval_path: null,
        state_path: state ? onboardingStatePath(root) : null,
        next_action: nextAction,
        reason_code: reasonCode,
      };
      return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, onboardingRoleMaterializeHuman(result), options.format ?? 'human') };
    };
    if (!state) return blocked('onboarding_state_missing', 'Run onboarding start, then verify first use before materializing roles.');

    const approvalPath = onboardingRoleApprovalPath(root);
    const approval = readRoleExpansionApproval(approvalPath);
    if (!approval) {
      return blocked('role_materialization_requires_approval', 'Run narada onboarding roles approve --confirm before materializing roles.');
    }

    const approvedSet: string[] = [...new Set(approval.cumulative_approved_roles
      .map((role) => role.trim().toLowerCase())
      .filter((role) => role === 'architect' || role === 'builder'))];
    const requestedRoles = [...new Set((options.roles?.length ? options.roles : approvedSet)
      .map((role) => role.trim().toLowerCase()).filter(Boolean))];
    const notApproved = requestedRoles.filter((role) => !approvedSet.includes(role));
    if (requestedRoles.length === 0 || notApproved.length > 0) {
      return blocked('role_materialization_roles_not_approved', `Only previously approved roles can be materialized: ${approvedSet.join(', ') || 'none'}.`);
    }

    const registryPath = state.launch_registry_path ?? userSiteRegistryPath(root, undefined, platform);
    if (!existsSync(registryPath)) {
      return blocked('launch_registry_missing', `Restore the launch registry at ${registryPath}, then retry materialization.`);
    }
    const raw = await readLaunchRegistryRaw(registryPath);
    const existingAgents = rawLaunchRegistryAgents(raw);
    const presentRoles = new Set(
      existingAgents
        .filter((agent) => rawAgentSiteRoot(raw, agent)?.toLowerCase() === root.toLowerCase())
        .map((agent) => rawAgentRole(agent)),
    );
    const toMaterialize = requestedRoles.filter((role) => !presentRoles.has(role));
    const pendingRoles = approvedSet.filter((role) => !presentRoles.has(role) && !toMaterialize.includes(role));
    const quietDone = 'Approved roles have quiet background launcher entries; start them from the advanced launcher when needed. Resident remains your assistant.';

    if (toMaterialize.length === 0) {
      const result: OnboardingRoleMaterializeResult = {
        schema: 'narada.onboarding.role_expansion_materialization.v1',
        status: 'already_materialized',
        mutation_performed: false,
        user_site: { root, resident_agent: state.resident_agent },
        materialized_roles: [],
        pending_roles: pendingRoles,
        registry_path: registryPath,
        approval_path: approvalPath,
        state_path: onboardingStatePath(root),
        next_action: pendingRoles.length > 0
          ? `Materialize the remaining approved roles with narada onboarding roles materialize: ${pendingRoles.join(', ')}.`
          : quietDone,
      };
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, onboardingRoleMaterializeHuman(result), options.format ?? 'human') };
    }

    const previousRegistryText = readFileSync(registryPath, 'utf8');
    const previousApprovalText = readFileSync(approvalPath, 'utf8');
    const newAgents = toMaterialize.map((role) => userSiteLaunchRegistryRoleAgent(root, role as 'architect' | 'builder', platform));
    const registryText = registryPath.toLowerCase().endsWith('.json')
      ? appendAgentsToJsonRegistryText(previousRegistryText, newAgents)
      : appendAgentsToPsd1RegistryText(previousRegistryText, newAgents.map((agent) => renderLaunchRegistryAgentBlock(agent)));
    await atomicWriteText(registryPath, registryText);

    const materializedCumulative = [...new Set([...(approval.materialized_roles ?? []), ...toMaterialize])];
    const fullyMaterialized = pendingRoles.length === 0;
    const nextAction = fullyMaterialized
      ? quietDone
      : `Materialize the remaining approved roles with narada onboarding roles materialize: ${pendingRoles.join(', ')}.`;
    const updatedApproval: OnboardingRoleExpansionApproval = {
      ...approval,
      status: fullyMaterialized ? 'materialized' : 'approved_pending_materialization',
      materialized_roles: materializedCumulative,
      materialized_at: new Date().toISOString(),
      next_action: nextAction,
    };
    await atomicWriteJson(approvalPath, updatedApproval);

    const roleExpansion: OnboardingRoleExpansionRecommendation = {
      ...state.role_expansion,
      status: fullyMaterialized ? 'materialized' : 'approved',
      recommended_roles: [],
      requires_operator_confirmation: false,
      approved_roles: approvedSet,
      materialized_roles: materializedCumulative,
      next_action: nextAction,
    };
    let statePath: string;
    try {
      statePath = await persistOnboardingState(root, state.resident_agent, state.readiness, roleExpansion, {
        verification: state.verification,
      });
    } catch (error) {
      await atomicWriteText(approvalPath, previousApprovalText).catch(() => undefined);
      await atomicWriteText(registryPath, previousRegistryText).catch(() => undefined);
      throw error;
    }

    const result: OnboardingRoleMaterializeResult = {
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'materialized',
      mutation_performed: true,
      user_site: { root, resident_agent: state.resident_agent },
      materialized_roles: toMaterialize,
      pending_roles: pendingRoles,
      registry_path: registryPath,
      approval_path: approvalPath,
      state_path: statePath,
      next_action: nextAction,
    };
    return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, onboardingRoleMaterializeHuman(result), options.format ?? 'human') };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: OnboardingRoleMaterializeResult = {
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'blocked',
      mutation_performed: false,
      user_site: { root: userSiteRoot(options.siteRoot, normalizeOnboardingPlatform(options.platform)), resident_agent: null },
      materialized_roles: [],
      pending_roles: [],
      registry_path: null,
      approval_path: null,
      state_path: null,
      next_action: 'Resolve the reported role materialization failure, then retry.',
      reason_code: message,
    };
    return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, onboardingRoleMaterializeHuman(result), options.format ?? 'human') };
  }
}

async function persistOnboardingState(
  root: string,
  residentAgent: string,
  readiness: OnboardingReadiness,
  roleExpansion: OnboardingRoleExpansionRecommendation,
  metadata: {
    launchRegistryPath?: string | null;
    launchRequestedAt?: string | null;
    launchSessionId?: string | null;
    sessionId?: string | null;
    verification?: OnboardingFirstUseVerification | null;
    projectionBindingPath?: string | null;
    projectionReadinessPath?: string | null;
    projectionUrl?: string | null;
  } = {},
): Promise<string> {
  const path = onboardingStatePath(root);
  await mkdir(join(siteAuthorityRootFromSiteRoot(root), 'runtime', 'onboarding'), { recursive: true });
  const previous = readOnboardingState(root);
  const state: OnboardingState = {
    schema: 'narada.user_site_onboarding_state.v1',
    updated_at: new Date().toISOString(),
    user_site_root: root,
    resident_agent: residentAgent,
    readiness,
    role_expansion: roleExpansion,
    launch_registry_path: metadata.launchRegistryPath !== undefined
      ? metadata.launchRegistryPath
      : previous?.launch_registry_path ?? null,
    launch_requested_at: metadata.launchRequestedAt !== undefined
      ? metadata.launchRequestedAt
      : previous?.launch_requested_at ?? null,
    launch_session_id: metadata.launchSessionId !== undefined
      ? metadata.launchSessionId
      : previous?.launch_session_id ?? null,
    session_id: metadata.sessionId !== undefined
      ? metadata.sessionId
      : previous?.session_id ?? null,
    verification: metadata.verification !== undefined
      ? metadata.verification
      : previous?.verification ?? null,
    projection_binding_path: metadata.projectionBindingPath !== undefined
      ? metadata.projectionBindingPath
      : previous?.projection_binding_path ?? null,
    projection_readiness_path: metadata.projectionReadinessPath !== undefined
      ? metadata.projectionReadinessPath
      : previous?.projection_readiness_path ?? null,
    projection_url: metadata.projectionUrl !== undefined
      ? metadata.projectionUrl
      : previous?.projection_url ?? null,
  };
  await atomicWriteJson(path, state);
  return path;
}

function nestedEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(event.event) ? event.event : null;
}

function eventKind(event: Record<string, unknown>): string | null {
  const nested = nestedEvent(event);
  const value = typeof event.event === 'string'
    ? event.event
    : event.event_kind ?? event.kind ?? event.lifecycle_event ?? event.type
      ?? nested?.type ?? nested?.event_kind ?? nested?.kind ?? nested?.event;
  return typeof value === 'string' ? value : null;
}

function eventSequence(event: Record<string, unknown>): number {
  const value = event.event_sequence ?? event.sequence;
  return Number.isInteger(value) ? value as number : 0;
}

function sessionIdentityAliases(session: Record<string, unknown>): string[] {
  const aliases: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) aliases.push(value.trim().toLowerCase());
  };
  const addIdentityRef = (value: unknown) => {
    if (!isRecord(value)) return;
    add(value.canonical_agent_id);
    add(value.legacy_agent_id);
    add(value.local_agent_id);
    add(value.role);
  };
  add(session.agent_id);
  add(session.agent);
  addIdentityRef(session.agent_identity_ref);
  if (isRecord(session.record)) {
    add(session.record.agent_id);
    addIdentityRef(session.record.agent_identity_ref);
  }
  return aliases;
}

function residentIdentityAliases(residentAgent: string): string[] {
  const normalized = residentAgent.trim().toLowerCase();
  const aliases = [normalized];
  const local = normalized.split('.').at(-1);
  if (local && local !== normalized) aliases.push(local);
  return aliases;
}

function sessionMatchesResident(session: Record<string, unknown>, residentAgent: string): boolean {
  const sessionAliases = new Set(sessionIdentityAliases(session));
  return residentIdentityAliases(residentAgent).some((alias) => sessionAliases.has(alias));
}

function selectOnboardingSession(
  sessions: Array<Record<string, unknown>>,
  residentAgent: string,
  launchSessionId: string | null,
  knownSessionId: string | null,
  requestedSessionId?: string,
): Record<string, unknown> | null {
  const exact = (id: string | null | undefined) => id
    ? sessions.find((session) => {
        const values = [session.session_id, session.carrier_session_id, session.launch_session_id];
        if (isRecord(session.record)) values.push(session.record.session_id, session.record.carrier_session_id, session.record.launch_session_id);
        return values.includes(id);
      }) ?? null
    : null;
  const requested = exact(requestedSessionId);
  if (requested) return requested;
  const bound = exact(launchSessionId);
  if (bound && sessionMatchesResident(bound, residentAgent)) return bound;
  const known = exact(knownSessionId);
  if (known && sessionMatchesResident(known, residentAgent)) return known;
  // New onboarding state always carries a launch binding. A legacy state without
  // one must not guess from recency; the operator can pass --session explicitly.
  return null;
}

function onboardingEventsPath(root: string, session: Record<string, unknown>): string | null {
  const sessionId = typeof session.session_id === 'string' ? session.session_id : null;
  const sessionDir = typeof session.session_dir === 'string' ? session.session_dir : null;
  const resolved = sessionId ? resolveNaradaSitePaths({ siteRoot: root, sessionId }) : null;
  const candidates = [
    typeof session.events_path === 'string' ? session.events_path : null,
    sessionDir ? join(sessionDir, 'events.jsonl') : null,
    resolved?.narsEventsPath ?? null,
  ].filter((value): value is string => Boolean(value));
  return candidates.find((value) => existsSync(value)) ?? candidates[0] ?? null;
}

function eventPayload(event: Record<string, unknown>): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function eventValue(event: Record<string, unknown>, key: string): unknown {
  if (event[key] !== undefined) return event[key];
  const payload = eventPayload(event);
  if (payload[key] !== undefined) return payload[key];
  const nested = nestedEvent(event);
  if (nested?.[key] !== undefined) return nested[key];
  return isRecord(nested?.payload) ? nested.payload[key] : undefined;
}

function eventInputId(event: Record<string, unknown>): string | null {
  const value = eventValue(event, 'input_event_id') ?? eventValue(event, 'event_id');
  return typeof value === 'string' && value.trim() ? value : null;
}

function eventTurnId(event: Record<string, unknown>): string | null {
  const value = eventValue(event, 'turn_id');
  return typeof value === 'string' && value.trim() ? value : null;
}

function eventText(event: Record<string, unknown>): string | null {
  const direct = eventValue(event, 'content') ?? eventValue(event, 'text') ?? eventValue(event, 'delta');
  if (typeof direct === 'string' && direct.trim()) return direct;
  const item = providerItem(event);
  const message = eventValue(event, 'message');
  if (isRecord(message) && typeof message.content === 'string' && message.content.trim()) return message.content;
  if (isRecord(item)) {
    const itemText = item.content ?? item.text ?? item.delta;
    if (typeof itemText === 'string' && itemText.trim()) return itemText;
  }
  return null;
}

function providerItem(event: Record<string, unknown>): Record<string, unknown> | null {
  const nested = nestedEvent(event);
  return isRecord(event.item) ? event.item : isRecord(nested?.item) ? nested.item : null;
}

function isAssistantMessageEvent(event: Record<string, unknown>): boolean {
  const kind = eventKind(event);
  if (kind === 'assistant_message' || kind === 'assistant_message_stream') return true;
  const item = providerItem(event);
  return kind === 'item.completed' && item?.type === 'agent_message';
}

function eventToolName(event: Record<string, unknown>): string {
  const direct = eventValue(event, 'tool') ?? eventValue(event, 'tool_name');
  if (typeof direct === 'string') return direct;
  const item = providerItem(event);
  if (isRecord(item)) {
    const nested = item.tool ?? item.tool_name ?? item.name;
    if (typeof nested === 'string') return nested;
  }
  return '';
}

function eventSucceeded(event: Record<string, unknown>): boolean {
  const item = providerItem(event);
  const status = eventValue(event, 'status') ?? (isRecord(item) ? item.status : undefined);
  if (typeof status === 'string' && /fail|error|reject/i.test(status)) return false;
  return !eventValue(event, 'error');
}

function isOperatorSource(event: Record<string, unknown>): boolean {
  const sourceKind = event.source_kind ?? event.source ?? eventPayload(event).source_kind ?? eventPayload(event).source;
  return typeof sourceKind === 'string' && ['operator', 'operator_input', 'operator_message', 'user'].includes(sourceKind.toLowerCase());
}

function isInputCompletionFor(event: Record<string, unknown>, inputId: string | null): boolean {
  if (!inputId) return false;
  const kind = eventKind(event);
  return (kind === 'input_completed' || kind === 'input_event_completed') && eventInputId(event) === inputId;
}

function buildFirstUseVerification(
  root: string,
  session: Record<string, unknown> | null,
): OnboardingFirstUseVerification {
  const checkedAt = new Date().toISOString();
  if (!session) {
    return {
      schema: 'narada.onboarding.first_use_verification.v1',
      status: 'pending',
      checked_at: checkedAt,
      session_id: null,
      events_path: null,
      response_kind: 'pending',
      checks: {
        healthy_session: false,
        identity_hydrated: false,
        input_ready: false,
        admitted_message: false,
        useful_or_no_work_response: false,
      },
      evidence: ['resident_session_not_found_after_launch'],
    };
  }

  const sessionId = typeof session.session_id === 'string' ? session.session_id : null;
  const eventsPath = onboardingEventsPath(root, session);
  const events = eventsPath ? readNarsEventLogTail(eventsPath, 1000).events : [];
  const kinds = (event: Record<string, unknown>) => eventKind(event);
  const queuedInputs = new Map(
    events
      .filter((event) => kinds(event) === 'input_event_queued' && typeof eventValue(event, 'event_id') === 'string')
      .map((event) => [String(eventValue(event, 'event_id')), event] as const),
  );
  const admitted = events
    .filter((event) => kinds(event) === 'input_admitted_to_turn' || kinds(event) === 'input_event_started')
    .find((event) => {
      const inputId = eventInputId(event);
      const queued = inputId ? queuedInputs.get(inputId) : null;
      return Boolean(queued && isOperatorSource(queued));
    }) ?? null;
  const admittedInputId = admitted ? eventInputId(admitted) : null;
  const admittedSequence = admitted ? eventSequence(admitted) : 0;
  const nextOperatorInputSequence = admitted
    ? events.find((event) => eventSequence(event) > admittedSequence && kinds(event) === 'input_event_queued' && isOperatorSource(event))
      ? eventSequence(events.find((event) => eventSequence(event) > admittedSequence && kinds(event) === 'input_event_queued' && isOperatorSource(event))!)
      : Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const firstTurnStarted = admitted
    ? events.find((event) => eventSequence(event) >= admittedSequence
      && eventSequence(event) < nextOperatorInputSequence
      && ['carrier_turn_started', 'turn_started'].includes(kinds(event) ?? ''))
    : null;
  const turnId = (admitted ? eventTurnId(admitted) : null) ?? (firstTurnStarted ? eventTurnId(firstTurnStarted) : null);
  const relevant = events.filter((event) => {
    if (eventSequence(event) < admittedSequence) return false;
    if (eventSequence(event) >= nextOperatorInputSequence) return false;
    if (isInputCompletionFor(event, admittedInputId)) return true;
    if (!turnId) return true;
    const eventTurn = eventTurnId(event);
    return eventTurn === null || eventTurn === turnId;
  });
  const identityHydrated = events.some((event) => {
    const kind = kinds(event);
    return (kind === 'tool_result' || kind === 'carrier_tool_completed' || kind === 'item.completed')
      && eventToolName(event).includes('agent_context_startup_sequence')
      && eventSucceeded(event);
  }) || (
    // narada-agent-runtime-server does not run an MCP startup tool; its hydration
    // proof is the session start followed by a ready lifecycle transition.
    events.some((event) => kinds(event) === 'session_started')
    && events.some((event) => kinds(event) === 'session_lifecycle_transition' && eventValue(event, 'lifecycle_state') === 'ready')
  );
  const assistantMessages = relevant
    .filter(isAssistantMessageEvent)
    .map(eventText)
    .filter((value): value is string => Boolean(value));
  const assistantContent = assistantMessages.join('');
  const turnFailed = relevant.some((event) => {
    const kind = kinds(event);
    const terminalState = eventValue(event, 'terminal_state');
    return kind === 'turn_failed'
      || kind === 'carrier_turn_failed'
      || ((kind === 'turn_complete' || kind === 'turn_completed') && terminalState === 'failed')
      || (isInputCompletionFor(event, admittedInputId) && terminalState === 'failed');
  });
  const turnCompleted = relevant.some((event) => {
    const kind = kinds(event);
    const terminalState = eventValue(event, 'terminal_state');
    return (kind === 'turn_complete' || kind === 'turn_completed' || kind === 'carrier_turn_completed')
      ? terminalState !== 'failed'
      : isInputCompletionFor(event, admittedInputId) && terminalState !== 'failed';
  });
  const responseKind: OnboardingResponseKind = turnFailed
    ? 'failed'
    : assistantContent
      ? /no[- ]work|nothing to do|await[_ ]operator|no admitted work/i.test(assistantContent) ? 'no_work' : 'useful'
      : 'pending';
  const healthySession = session.health_status === 'healthy';
  const inputReady = healthySession && session.display_state === 'active';
  const admittedMessage = Boolean(admitted && admittedInputId);
  const usefulOrNoWorkResponse = Boolean(assistantContent) && turnCompleted && responseKind !== 'failed';
  const failed = turnFailed;
  const verified = healthySession && identityHydrated && inputReady && admittedMessage && usefulOrNoWorkResponse;
  const evidence = [
    healthySession ? 'session_health_healthy' : 'session_health_not_proven',
    identityHydrated ? 'identity_hydrated' : 'identity_hydration_not_proven',
    inputReady ? 'input_ready' : 'input_not_ready',
    admittedMessage ? 'operator_message_admitted' : 'operator_message_not_admitted',
    responseKind === 'useful' ? 'useful_response_observed' : responseKind === 'no_work' ? 'explicit_no_work_response_observed' : 'response_not_observed',
  ];
  return {
    schema: 'narada.onboarding.first_use_verification.v1',
    status: verified ? 'verified' : failed ? 'failed' : 'pending',
    checked_at: checkedAt,
    session_id: sessionId,
    events_path: eventsPath,
    response_kind: responseKind,
    checks: {
      healthy_session: healthySession,
      identity_hydrated: identityHydrated,
      input_ready: inputReady,
      admitted_message: admittedMessage,
      useful_or_no_work_response: usefulOrNoWorkResponse,
    },
    evidence,
  };
}

function onboardingStatusHuman(result: OnboardingStatusResult): string[] {
  const verification = result.verification;
  const failedChecks = verification
    ? Object.entries(verification.checks)
      .filter(([, passed]) => passed === false)
      .map(([name]) => name)
    : [];
  return [
    'Narada onboarding status',
    `Workspace: ${result.user_site.root}`,
    `Resident: ${result.user_site.resident_agent ?? 'not configured'}`,
    `Session: ${result.session.id ?? 'not found'}`,
    `Health: ${result.session.health_status ?? 'not checked'}`,
    `Status: ${result.status}`,
    `Readiness: ${result.readiness.status}`,
    `First use: ${verification?.status ?? 'pending'}`,
    `Response: ${verification?.response_kind ?? 'pending'}`,
    verification?.events_path ? `Events: ${verification.events_path}` : '',
    failedChecks.length > 0 ? `Failed checks: ${failedChecks.join(', ')}` : '',
    verification && verification.evidence.length > 0 ? `Evidence: ${verification.evidence.join(', ')}` : '',
    result.reason_code ? `Reason: ${result.reason_code}` : '',
    result.state_path ? `State: ${result.state_path}` : '',
    `Next: ${result.next_action}`,
  ].filter(Boolean);
}

function onboardingRoleApprovalPath(root: string): string {
  return join(siteAuthorityRootFromSiteRoot(root), 'runtime', 'onboarding', 'role-expansion-approval.json');
}

function onboardingRoleApprovalHuman(result: OnboardingRoleApprovalResult): string[] {
  return [
    'Narada onboarding role expansion',
    `Workspace: ${result.user_site.root}`,
    `Resident: ${result.user_site.resident_agent ?? 'not configured'}`,
    `Status: ${result.status}`,
    `Approved: ${result.approved_roles.join(', ') || 'none'}`,
    `Roster changed: ${result.preview.roster_mutation_performed ? 'yes' : 'no'}`,
    result.approval_path ? `Approval: ${result.approval_path}` : '',
    result.reason_code ? `Reason: ${result.reason_code}` : '',
    `Next: ${result.next_action}`,
  ].filter(Boolean);
}

function baseResult(
  root: string,
  registryPath: string,
  record: WorkspaceLaunchRecord | null,
  records: WorkspaceLaunchRecord[],
  platform: OnboardingPlatform,
): OnboardingResult {
  return {
    schema: 'narada.onboarding.start.v1',
    status: 'ready',
    mutation_performed: false,
    platform,
    scope: 'user-site',
    user_site: {
      root,
      registry_path: registryPath,
      resident_agent: record?.agent ?? null,
    },
    defaults: {
      assistant_label: 'General assistant',
      role: 'resident',
      operator_surface: record?.operator_surface ?? null,
      runtime_host: record?.runtime ?? null,
      intelligence: {
        resolution_phase: 'runtime-invocation',
        authority: 'site-catalog-and-materialized-policy',
      },
    },
    role_expansion: roleExpansionRecommendation(records, root, record !== null),
    readiness: {
      status: 'not_started',
      first_useful_interaction: 'pending',
      evidence: [],
    },
    launch: null,
    handoff: null,
    state_path: null,
    next_action: record ? 'Confirm Start my assistant to launch the User Site resident.' : 'Register a resident launch record for this User Site, then rerun onboarding.',
  };
}

function renderHuman(result: OnboardingResult): string[] {
  const heading = result.status === 'launched'
    ? 'Narada onboarding started'
    : result.status === 'blocked'
      ? 'Narada onboarding blocked'
      : 'Narada User Site onboarding';
  const lines = [
    heading,
    `Workspace: ${result.user_site.root}`,
    `Assistant: ${result.defaults.assistant_label} (${result.defaults.role})`,
    `Surface: ${result.defaults.operator_surface ?? 'not configured'}`,
    `Runtime: ${result.defaults.runtime_host ?? 'not configured'}`,
    `Intelligence: ${result.defaults.intelligence.resolution_phase} via ${result.defaults.intelligence.authority}`,
    `Readiness: ${result.readiness.status}`,
    `Role expansion: ${result.role_expansion.status}`,
    result.state_path ? `State: ${result.state_path}` : '',
    ...launchHandoffLines(result.launch, result.user_site.resident_agent),
    `Next: ${result.next_action}`,
  ].filter(Boolean);
  if (result.message) lines.push(`Message: ${result.message}`);
  return lines;
}

function launchHandoffLines(value: unknown, residentAgent: string | null): string[] {
  const body = isRecord(value) && isRecord(value.result) ? value.result : value;
  if (!isRecord(body)) return [];

  const agents = [
    ...(Array.isArray(body.launch_agents) ? body.launch_agents : []),
    ...(Array.isArray(body.selected_agents) ? body.selected_agents : []),
  ].filter(isRecord);
  const selectedAgent = agents.find((agent) => agent.agent === residentAgent) ?? agents[0] ?? null;
  const attachment = isRecord(body.attachment) ? body.attachment : null;
  const sessions = attachment && Array.isArray(attachment.sessions)
    ? attachment.sessions.filter(isRecord)
    : [];
  const selectedLaunchSessionId = selectedAgent && typeof selectedAgent.launch_session_id === 'string'
    ? selectedAgent.launch_session_id
    : null;
  const projectionBinding = selectedAgent && isRecord(selectedAgent.operator_projection_launch_binding)
    ? selectedAgent.operator_projection_launch_binding
    : null;
  const projectionBindingPath = projectionBinding && typeof projectionBinding.path === 'string'
    ? projectionBinding.path
    : null;
  const projectionReadinessPath = projectionBindingPath ? `${projectionBindingPath}.ready.json` : null;
  const session = sessions.find((candidate) => candidate.launch_session_id === selectedLaunchSessionId) ?? sessions[0] ?? null;
  const projectionRequests = [
    ...(selectedAgent && Array.isArray(selectedAgent.operator_projection_open_requests)
      ? selectedAgent.operator_projection_open_requests
      : []),
    ...(Array.isArray(body.operator_projection_open_requests) ? body.operator_projection_open_requests : []),
    ...(Array.isArray(body.operator_projection_open_request) ? body.operator_projection_open_request : [body.operator_projection_open_request]),
  ].filter(isRecord);
  const projectionUrl = projectionRequests
    .map((request) => typeof request.url === 'string' ? request.url : request.target_ref)
    .find((candidate): candidate is string => typeof candidate === 'string' && /^https?:\/\//i.test(candidate));
  const resultPath = typeof body.result_path === 'string'
    ? body.result_path
    : isRecord(body.launch_result_artifact) && typeof body.launch_result_artifact.path === 'string'
      ? body.launch_result_artifact.path
      : null;
  const lines: string[] = [];
  if (resultPath) lines.push(`Result: ${resultPath}`);
  if (selectedLaunchSessionId) lines.push(`Launch session: ${selectedLaunchSessionId}`);
  if (session && typeof session.session_id === 'string') lines.push(`Session: ${session.session_id}`);
  if (session && typeof session.health_endpoint === 'string') lines.push(`Health: ${session.health_endpoint}`);
  if (session && typeof session.event_endpoint === 'string') lines.push(`Events: ${session.event_endpoint}`);
  if (projectionUrl) {
    lines.push(`Open: ${projectionUrl}`);
  } else if (projectionRequests.length > 0) {
    lines.push('Browser: waiting for agent-web-ui attachment and browser URL');
    lines.push('Projection: exact NARS session binding is resolved before browser open');
    if (projectionReadinessPath) lines.push(`Projection readiness: ${projectionReadinessPath}`);
  }
  return lines;
}

function launchSessionIdFromResult(value: unknown, residentAgent: string): string | null {
  const body = isRecord(value) && isRecord(value.result) ? value.result : value;
  if (!isRecord(body)) return null;
  const agents = [
    ...(Array.isArray(body.launch_agents) ? body.launch_agents : []),
    ...(Array.isArray(body.selected_agents) ? body.selected_agents : []),
  ].filter(isRecord);
  const residentAliases = new Set(residentIdentityAliases(residentAgent));
  const selected = agents.find((agent) => {
    const aliases = new Set(sessionIdentityAliases(agent));
    return [...aliases].some((alias) => residentAliases.has(alias));
  });
  return selected && typeof selected.launch_session_id === 'string' ? selected.launch_session_id : null;
}

export async function onboardingStartCommand(
  options: OnboardingStartOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  let provisioned: Awaited<ReturnType<typeof ensureUserSiteProvisioned>> | null = null;
  try {
    const platform = normalizeOnboardingPlatform(options.platform);
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot, platform);
    const registryPath = userSiteRegistryPath(root, options.registryPath, platform);
    if (options.demo) {
      const result: OnboardingResult = {
        ...baseResult(root, registryPath, null, [], platform),
        status: 'demo_available',
        readiness: {
          status: 'demo_available',
          first_useful_interaction: 'pending',
          evidence: ['demo_path_available'],
        },
        next_action: 'Run `narada demo` for a no-credential introduction, or rerun without --demo for the User Site resident.',
      };
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
    }

    if (!options.noExec) {
      provisioned = await ensureUserSiteProvisioned(root, registryPath, context, platform);
    }

    if (!existsSync(root) || !existsSync(registryPath)) {
      if (options.noExec) {
        const result: OnboardingResult = {
          ...baseResult(root, registryPath, null, [], platform),
          status: 'planned',
          reason_code: 'user_site_bootstrap_required',
          message: 'The first-use path will create the User Site and its resident launch record before starting the assistant.',
          next_action: 'Rerun onboarding without --no-exec to provision the User Site and start the resident.',
        };
        return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
      }
    }

    if (!existsSync(root) || !existsSync(registryPath)) {
      const result: OnboardingResult = {
        ...baseResult(root, registryPath, null, [], platform),
        status: 'blocked',
        reason_code: 'user_site_bootstrap_incomplete',
        message: 'The User Site bootstrap did not produce the required launch authority.',
        next_action: `Inspect ${root} and ${registryPath}, then rerun onboarding.`,
      };
      return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
    }

    const loaded = await readWorkspaceLaunchRecords({ registryPath });
    const resident = findResidentRecord(loaded.records, root);
    const result = baseResult(root, registryPath, resident, loaded.records, platform);
    if (provisioned) result.intelligence_catalog = provisioned.intelligence_catalog;

    if (!resident) {
      result.status = 'blocked';
      result.reason_code = 'user_site_resident_missing';
      result.message = 'No resident launch record is admitted for this User Site.';
      return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
    }

    if (options.interactive) {
      if (!process.stdin.isTTY) throw new Error('onboarding_interactive_requires_tty');
      const accepted = await prompts.confirm({ message: 'Start my assistant in the Personal workspace?', initialValue: true });
      if (prompts.isCancel(accepted) || accepted !== true) {
        result.status = 'cancelled';
        result.next_action = 'Rerun onboarding when you are ready to start the User Site resident.';
        return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
      }
    }

    const launchOptions: WorkspaceLaunchPlanOptions = {
      agent: [resident.agent],
      registryPath,
      onboarding: true,
      dryRun: options.noExec === true,
      noWaitForEnterBeforeExec: true,
      format: 'json',
    };
    const launch = await workspaceLaunchCommand(launchOptions, context);
    result.launch = launch.result;
    if (launch.exitCode !== ExitCode.SUCCESS) {
      const launchMessage = typeof launch.result === 'string' ? launch.result : JSON.stringify(launch.result);
      const intelligenceSetupFailure = isIntelligenceSetupFailure(launchMessage);
      if (intelligenceSetupFailure && provisioned) {
        result.mutation_performed = provisioned.site_created
          || provisioned.launch_registry_created
          || provisioned.intelligence_catalog.mutation_performed;
        result.intelligence_catalog = provisioned.intelligence_catalog;
      }
      result.status = 'blocked';
      result.reason_code = intelligenceSetupFailure ? 'intelligence_catalog_setup_required' : 'launch_refused';
      result.readiness = {
        status: 'blocked',
        first_useful_interaction: 'pending',
        evidence: ['launch_refused'],
      };
      result.message = intelligenceSetupFailure
        ? `The resident launch is blocked by User Site intelligence setup: ${launchMessage}`
        : 'The resident launch was refused.';
      result.next_action = intelligenceSetupFailure
        ? 'Complete User Site intelligence setup (principal admission, launch context, and provider readiness), then rerun onboarding. Use --demo for a no-credential introduction.'
        : 'Resolve the launch refusal, then rerun onboarding.';
      return {
        exitCode: intelligenceSetupFailure ? ExitCode.GENERAL_ERROR : launch.exitCode,
        result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
      };
    }
    result.status = options.noExec ? 'planned' : 'launched';
    result.mutation_performed = !options.noExec;
    result.readiness = {
      status: options.noExec ? 'not_started' : 'launch_requested',
      first_useful_interaction: 'pending',
      evidence: options.noExec ? ['launch_plan'] : ['launch_result', 'operator_surface_open_requested'],
    };
    if (!options.noExec) {
      const launchSessionId = launchSessionIdFromResult(launch.result, resident.agent);
      const projection = projectionHandoffFromLaunch(launch.result, resident.agent);
      result.handoff = projection.handoff;
      result.state_path = await persistOnboardingState(root, resident.agent, result.readiness, result.role_expansion, {
        launchRegistryPath: registryPath,
        launchRequestedAt: new Date().toISOString(),
        launchSessionId,
        projectionBindingPath: projection.bindingPath,
        projectionReadinessPath: projection.readinessPath,
        projectionUrl: projection.handoff?.url ?? null,
      });
    }
    result.next_action = options.noExec
      ? 'Review the plan, then rerun onboarding without --no-exec to start the resident.'
      : 'Use the opened operator surface and send the first request to the General assistant; role expansion remains operator-approved.';
    return { exitCode: launch.exitCode, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const platform = normalizeOnboardingPlatform(options.platform);
    const root = userSiteRoot(options.siteRoot, platform);
    const registryPath = userSiteRegistryPath(root, options.registryPath, platform);
    let records: WorkspaceLaunchRecord[] = [];
    let resident: WorkspaceLaunchRecord | null = null;
    if (existsSync(registryPath)) {
      try {
        const loaded = await readWorkspaceLaunchRecords({ registryPath });
        records = loaded.records;
        resident = findResidentRecord(records, root);
      } catch {
        // Preserve the original launch failure when the registry itself is also malformed.
      }
    }
    const intelligenceSetupRequired = isIntelligenceSetupFailure(message);
    const result: OnboardingResult = {
      ...baseResult(
        root,
        registryPath,
        resident,
        records,
        platform,
      ),
      mutation_performed: provisioned
        ? provisioned.site_created || provisioned.launch_registry_created || provisioned.intelligence_catalog.mutation_performed
        : false,
      status: intelligenceSetupRequired ? 'blocked' : 'error',
      reason_code: message.includes('codex_subscription')
        ? 'provider_auth_required'
        : intelligenceSetupRequired
          ? 'intelligence_catalog_setup_required'
          : 'onboarding_start_failed',
      readiness: intelligenceSetupRequired
        ? { status: 'blocked', first_useful_interaction: 'pending', evidence: ['launch_refused'] }
        : { status: 'not_started', first_useful_interaction: 'pending', evidence: [] },
      message: intelligenceSetupRequired
        ? `The resident launch is blocked by User Site intelligence setup: ${message}`
        : message,
      ...(provisioned ? { intelligence_catalog: provisioned.intelligence_catalog } : {}),
      next_action: /credential|api[_-]?key|provider[_-]?auth|codex[_-]?subscription/i.test(message)
        ? 'Authenticate the selected provider, then rerun onboarding. Use --demo for a no-credential introduction.'
        : intelligenceSetupRequired
          ? 'Complete User Site intelligence setup (principal admission, launch context, and provider readiness), then rerun onboarding. Use --demo for a no-credential introduction.'
        : 'Run onboarding again after resolving the reported prerequisite.',
    };
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  }
}
