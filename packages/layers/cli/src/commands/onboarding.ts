import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as prompts from '@clack/prompts';
import { resolveNaradaSitePaths, siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import { readNarsEventLogTail } from '@narada2/nars-session-core/event-log';
import { defaultLaunchRegistryPath } from '../lib/site-root-resolver.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { registryDefaultIntelligenceProvider, workspaceLaunchCommand } from './workspace-launch-application.js';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import { narsSessionsCommand } from './nars.js';
import type { CommandContext } from '../lib/command-wrapper.js';

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

function userSiteLaunchRegistryJson(root: string): string {
  return `${JSON.stringify({ NaradaRoot: root, Agents: [userSiteLaunchRegistryAgent(root)] }, null, 2)}\n`;
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
}

interface OnboardingRoleExpansionRecommendation {
  status: 'available' | 'not_needed' | 'unavailable' | 'approved';
  recommended_roles: string[];
  requires_operator_confirmation: boolean;
  trigger: 'after_first_useful_interaction' | 'after_resident_ready';
  next_action: string;
  approved_roles?: string[];
}

interface OnboardingStatusResult {
  schema: 'narada.onboarding.status.v1';
  status: 'not_started' | 'launch_requested' | 'first_use_verified' | 'blocked';
  mutation_performed: boolean;
  platform: 'windows';
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

interface OnboardingResult {
  schema: 'narada.onboarding.start.v1';
  status: 'ready' | 'launched' | 'planned' | 'demo_available' | 'cancelled' | 'blocked' | 'error';
  mutation_performed: boolean;
  platform: 'windows';
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
    intelligence_provider: string;
  };
  role_expansion: OnboardingRoleExpansionRecommendation;
  readiness: OnboardingReadiness;
  launch: unknown | null;
  state_path: string | null;
  reason_code?: string;
  message?: string;
  next_action: string;
}

function userSiteRoot(input?: string): string {
  return resolve(input ?? process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada'));
}

function userSiteRegistryPath(root: string, input?: string): string {
  if (input) return resolve(input);
  const configuredUserSiteRoot = process.env.NARADA_USER_SITE_ROOT ? resolve(process.env.NARADA_USER_SITE_ROOT) : null;
  return configuredUserSiteRoot && configuredUserSiteRoot.toLowerCase() === root.toLowerCase()
    ? defaultLaunchRegistryPath()
    : join(root, 'config', 'launch', 'agents.psd1');
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
        ? 'Materialize the approved roles through the Site roster authority; this approval does not mutate the launch registry.'
        : 'Keep the current role roster; no default expansion is needed.',
    ...(cumulativeApprovedRoles.length > 0 ? { approved_roles: cumulativeApprovedRoles } : {}),
  };
}

function providerDefault(): string {
  return registryDefaultIntelligenceProvider();
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
    && (value.status === 'available' || value.status === 'not_needed' || value.status === 'unavailable' || value.status === 'approved')
    && stringArray(value.recommended_roles)
    && typeof value.requires_operator_confirmation === 'boolean'
    && (value.trigger === 'after_first_useful_interaction' || value.trigger === 'after_resident_ready')
    && typeof value.next_action === 'string'
    && (value.approved_roles === undefined || stringArray(value.approved_roles));
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
  return {
    ...(value as unknown as OnboardingState),
    launch_registry_path: value.launch_registry_path === undefined ? null : value.launch_registry_path as string | null,
    launch_session_id: value.launch_session_id === undefined ? null : value.launch_session_id as string | null,
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

function userSiteLaunchRegistryAgent(root: string): Record<string, unknown> {
  const siteId = defaultUserSiteId(root);
  const launcher = siteId.endsWith('-user') ? `${siteId}.ps1` : 'narada-user.ps1';
  return {
    Agent: `${siteId}.resident`,
    Title: 'General assistant',
    Role: 'resident',
    Site: siteId,
    NaradaRoot: root,
    WorkspaceRoot: root,
    SiteRoot: root,
    Launcher: launcher,
    OperatorSurface: 'agent-web-ui',
    Runtime: 'narada-agent-runtime-server',
    EnableNativeShell: false,
  };
}

function userSiteLaunchRegistryText(root: string): string {
  const agent = userSiteLaunchRegistryAgent(root);
  const values: Array<[string, string]> = [
    ['Agent', String(agent.Agent)],
    ['Title', String(agent.Title)],
    ['Role', String(agent.Role)],
    ['Site', String(agent.Site)],
    ['NaradaRoot', String(agent.NaradaRoot)],
    ['WorkspaceRoot', String(agent.WorkspaceRoot)],
    ['SiteRoot', String(agent.SiteRoot)],
    ['Launcher', String(agent.Launcher)],
    ['OperatorSurface', String(agent.OperatorSurface)],
    ['Runtime', String(agent.Runtime)],
  ];
  return [
    '@{',
    '  Agents = @(',
    '    @{',
    ...values.map(([key, value]) => `      ${key} = ${powerShellDataString(value)}`),
    '      EnableNativeShell = $false',
    '    }',
    '  )',
    '}',
  ].join('\n') + '\n';
}

async function ensureUserSiteProvisioned(
  root: string,
  registryPath: string,
  context: CommandContext,
): Promise<{ site_created: boolean; launch_registry_created: boolean }> {
  let siteCreated = false;
  if (!existsSync(root)) {
    const { sitesInitCommand } = await import('./sites.js');
    const initialized = await sitesInitCommand(defaultUserSiteId(root), {
      substrate: 'windows-native',
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
      registryPath.toLowerCase().endsWith('.json') ? userSiteLaunchRegistryJson(root) : userSiteLaunchRegistryText(root),
    );
    registryCreated = true;
  }
  return { site_created: siteCreated, launch_registry_created: registryCreated };
}

async function refreshRoleExpansionRecommendation(
  root: string,
  state: OnboardingState,
  firstUseVerified: boolean,
): Promise<OnboardingRoleExpansionRecommendation> {
  if (state.role_expansion.status === 'approved') return state.role_expansion;
  try {
    const registryPath = state.launch_registry_path ?? userSiteRegistryPath(root);
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
    const platform = (options.platform ?? 'windows').trim().toLowerCase();
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (platform !== 'windows') throw new Error(`onboarding_platform_unsupported: ${platform}`);
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot);
    const statePath = onboardingStatePath(root);
    const state = readOnboardingState(root);
    if (!state) {
      const result: OnboardingStatusResult = {
        schema: 'narada.onboarding.status.v1',
        status: 'not_started',
        mutation_performed: false,
        platform: 'windows',
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
      ? await refreshRoleExpansionRecommendation(root, state, true)
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
      platform: 'windows',
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
    return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, onboardingStatusHuman(result), options.format ?? 'human') };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: OnboardingStatusResult = {
      schema: 'narada.onboarding.status.v1',
      status: 'blocked',
      mutation_performed: false,
      platform: 'windows',
      scope: 'user-site',
      user_site: { root: userSiteRoot(options.siteRoot), resident_agent: null },
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
    const platform = (options.platform ?? 'windows').trim().toLowerCase();
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (platform !== 'windows') throw new Error(`onboarding_platform_unsupported: ${platform}`);
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot);
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
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, onboardingRoleApprovalHuman(result), options.format ?? 'human') };
    };
    if (!state) return blocked('onboarding_state_missing', 'Run onboarding start, then verify first use before approving role expansion.');
    if (state.readiness.first_useful_interaction !== 'verified') {
      return blocked('role_expansion_requires_first_use', 'Run onboarding status after one useful resident interaction, then retry approval.');
    }
    if (options.confirm !== true) {
      return blocked('role_expansion_confirmation_required', 'Review the architect/builder preview, then rerun with --confirm.');
    }

    const currentRecommendation = await refreshRoleExpansionRecommendation(root, state, true);
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
      : 'Materialize the approved roles through the Site roster authority; this approval does not mutate the launch registry.';
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
      user_site: { root: userSiteRoot(options.siteRoot), resident_agent: null },
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
    .filter((event) => kinds(event) === 'input_admitted_to_turn')
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
  });
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
  return [
    'Narada onboarding status',
    `Workspace: ${result.user_site.root}`,
    `Resident: ${result.user_site.resident_agent ?? 'not configured'}`,
    `Session: ${result.session.id ?? 'not found'}`,
    `Health: ${result.session.health_status ?? 'not checked'}`,
    `Readiness: ${result.status}`,
    `First use: ${verification?.status ?? 'pending'}`,
    `Response: ${verification?.response_kind ?? 'pending'}`,
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
    `Approved: ${result.approved_roles.join(', ') || 'none'}`,
    `Roster changed: ${result.preview.roster_mutation_performed ? 'yes' : 'no'}`,
    result.approval_path ? `Approval: ${result.approval_path}` : '',
    `Next: ${result.next_action}`,
  ].filter(Boolean);
}

function baseResult(
  root: string,
  registryPath: string,
  record: WorkspaceLaunchRecord | null,
  records: WorkspaceLaunchRecord[],
): OnboardingResult {
  return {
    schema: 'narada.onboarding.start.v1',
    status: 'ready',
    mutation_performed: false,
    platform: 'windows',
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
      intelligence_provider: providerDefault(),
    },
    role_expansion: roleExpansionRecommendation(records, root, record !== null),
    readiness: {
      status: 'not_started',
      first_useful_interaction: 'pending',
      evidence: [],
    },
    launch: null,
    state_path: null,
    next_action: record ? 'Confirm Start my assistant to launch the User Site resident.' : 'Register a resident launch record for this User Site, then rerun onboarding.',
  };
}

function renderHuman(result: OnboardingResult): string[] {
  const lines = [
    result.status === 'launched' ? 'Narada onboarding started' : 'Narada User Site onboarding',
    `Workspace: ${result.user_site.root}`,
    `Assistant: ${result.defaults.assistant_label} (${result.defaults.role})`,
    `Surface: ${result.defaults.operator_surface ?? 'not configured'}`,
    `Runtime: ${result.defaults.runtime_host ?? 'not configured'}`,
    `Intelligence: ${result.defaults.intelligence_provider}`,
    `Readiness: ${result.readiness.status}`,
    `Role expansion: ${result.role_expansion.status}`,
    result.state_path ? `State: ${result.state_path}` : '',
    `Next: ${result.next_action}`,
  ].filter(Boolean);
  if (result.message) lines.push(`Message: ${result.message}`);
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
  try {
    const platform = (options.platform ?? 'windows').trim().toLowerCase();
    const scope = (options.scope ?? 'user-site').trim().toLowerCase();
    if (platform !== 'windows') throw new Error(`onboarding_platform_unsupported: ${platform}`);
    if (scope !== 'user-site') throw new Error(`onboarding_scope_unsupported: ${scope}`);

    const root = userSiteRoot(options.siteRoot);
    const registryPath = userSiteRegistryPath(root, options.registryPath);
    if (options.demo) {
      const result: OnboardingResult = {
        ...baseResult(root, registryPath, null, []),
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

    if (!existsSync(root) || !existsSync(registryPath)) {
      if (options.noExec) {
        const result: OnboardingResult = {
          ...baseResult(root, registryPath, null, []),
          status: 'planned',
          reason_code: 'user_site_bootstrap_required',
          message: 'The first-use path will create the User Site and its resident launch record before starting the assistant.',
          next_action: 'Rerun onboarding without --no-exec to provision the User Site and start the resident.',
        };
        return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
      }
      await ensureUserSiteProvisioned(root, registryPath, context);
    }

    if (!existsSync(root) || !existsSync(registryPath)) {
      const result: OnboardingResult = {
        ...baseResult(root, registryPath, null, []),
        status: 'blocked',
        reason_code: 'user_site_bootstrap_incomplete',
        message: 'The User Site bootstrap did not produce the required launch authority.',
        next_action: `Inspect ${root} and ${registryPath}, then rerun onboarding.`,
      };
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
    }

    const loaded = await readWorkspaceLaunchRecords({ registryPath });
    const resident = findResidentRecord(loaded.records, root);
    const result = baseResult(root, registryPath, resident, loaded.records);

    if (!resident) {
      result.status = 'blocked';
      result.reason_code = 'user_site_resident_missing';
      result.message = 'No resident launch record is admitted for this User Site.';
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
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
      const providerAuthFailure = /credential|api[_-]?key|provider[_-]?auth|codex[_-]?subscription/i.test(launchMessage);
      result.status = 'blocked';
      result.reason_code = providerAuthFailure ? 'provider_auth_required' : 'launch_refused';
      result.readiness = {
        status: 'blocked',
        first_useful_interaction: 'pending',
        evidence: ['launch_refused'],
      };
      result.message = providerAuthFailure ? 'The selected intelligence provider is not ready.' : 'The resident launch was refused.';
      result.next_action = providerAuthFailure
        ? 'Authenticate the selected provider, then rerun onboarding. Use --demo for a no-credential introduction.'
        : 'Resolve the launch refusal, then rerun onboarding.';
      return { exitCode: launch.exitCode, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
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
      result.state_path = await persistOnboardingState(root, resident.agent, result.readiness, result.role_expansion, {
        launchRegistryPath: registryPath,
        launchRequestedAt: new Date().toISOString(),
        launchSessionId,
      });
    }
    result.next_action = options.noExec
      ? 'Review the plan, then rerun onboarding without --no-exec to start the resident.'
      : 'Use the opened operator surface and send the first request to the General assistant; role expansion remains operator-approved.';
    return { exitCode: launch.exitCode, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: OnboardingResult = {
      ...baseResult(userSiteRoot(options.siteRoot), userSiteRegistryPath(userSiteRoot(options.siteRoot), options.registryPath), null, []),
      status: 'error',
      reason_code: message.includes('codex_subscription') ? 'provider_auth_required' : 'onboarding_start_failed',
      message,
      next_action: /credential|api[_-]?key|provider[_-]?auth|codex[_-]?subscription/i.test(message)
        ? 'Authenticate the selected provider, then rerun onboarding. Use --demo for a no-credential introduction.'
        : 'Run onboarding again after resolving the reported prerequisite.',
    };
    return { exitCode: ExitCode.GENERAL_ERROR, result: formattedResult(result, renderHuman(result), options.format ?? 'auto') };
  }
}
