/**
 * Operator Console HTTP API routes.
 *
 * Read-only GET endpoints for cross-Site observation plus a single POST
 * control endpoint that routes through ControlRequestRouter.
 *
 * Authority boundary:
 * - GET routes are strictly read-only; they never mutate registry or Site state.
 * - POST /console/sites/:site_id/control delegates through ControlRequestRouter.
 * - POST /console/agents/api/admission delegates through the Site-agent admission gateway.
 * - POST /console/registry/api/sites/:id/launch runs the plan-first sites-launch ensure
 *   (dry-run unless the body explicitly sets dry_run: false).
 * - Registry plan/apply POSTs delegate through the RegistryMutationGateway.
 * - No other direct Site mutation from route handlers.
 */

import type { ServerResponse, IncomingMessage } from 'http';
import type {
  SiteRegistry,
  RegisteredSite,
  SiteObservationApi,
  SiteControlClientFactory,
} from '@narada-core/windows-site';
import type { ConsoleControlRequest } from '@narada-core/windows-site';
import type { SiteRegistryReadModel } from './site-registry-read-model.js';
import type { RegistryMutationGateway, RegistryMutationInput, RegistryMutationOperation } from './site-registry-management-gateway.js';
import type { AgentSessionReadModel } from './agent-session-read-model.js';
import type { SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';
import type { SiteAgentLaunchGateway } from './site-agent-launch-gateway.js';
import type { SiteAgentAdmissionGateway } from './site-agent-admission-gateway.js';
import type { SiteAgentLifecycleGateway } from './site-agent-lifecycle-gateway.js';
import {
  OPERATOR_CONSOLE_AGENTS_API_PATH,
  OPERATOR_CONSOLE_AGENTS_ADMISSION_API_PATH,
  OPERATOR_CONSOLE_AGENTS_ADMISSION_OPTIONS_API_PATH,
  OPERATOR_CONSOLE_AGENTS_DELETE_API_PATH,
  OPERATOR_CONSOLE_AGENTS_STOP_API_PATH,
  OPERATOR_CONSOLE_AGENTS_PATH,
  OPERATOR_CONSOLE_ASSET_PATH,
  OPERATOR_CONSOLE_PATH,
  OPERATOR_CONSOLE_REGISTRY_PATH,
  OPERATOR_CONSOLE_REGISTRY_ADD_PATH,
  OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH,
  OPERATOR_CONSOLE_LAUNCH_PATH,
  OPERATOR_CONSOLE_ONBOARDING_PATH,
  OPERATOR_CONSOLE_ONBOARDING_API_PATH,
  OPERATOR_CONSOLE_ONBOARDING_SCHEMA,
  OPERATOR_CONSOLE_SESSIONS_PATH,
  formatOperatorSiteAgentInvariantViolation,
  validateOperatorSiteAgentOverviewInvariants,
  type OperatorSiteAgentOverviewWireResponse,
  type OperatorWorkspaceRouteDirectory,
  type OperatorConsoleHttpRouteDisposition,
  type OperatorConsoleHttpRouteKind,
  type OperatorConsoleOnboardingHandoff,
  type OperatorConsoleOnboardingProjection,
  type OperatorConsoleOnboardingSetupAction,
  type OperatorConsoleOnboardingUiState,
} from '@narada-core/operator-console-contract';
import type { SiteAgentPendingTracker } from './site-agent-pending-tracker.js';
import {
  readOperatorConsoleUiAsset,
  readOperatorConsoleUiDocument,
} from './console-ui-assets.js';
import { sitesLaunchCommand } from './sites-launch.js';
import { doctorCommand } from './doctor.js';
import { onboardingStartCommand, onboardingStatusCommand } from './onboarding.js';
import { silentCommandContext } from '../lib/command-wrapper.js';

export interface RouteHandler {
  route_id: string;
  method: string;
  pattern: RegExp;
  remote_disposition: OperatorConsoleHttpRouteDisposition;
  remote_kind: OperatorConsoleHttpRouteKind;
  remote_intent: string | null;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    params: RegExpExecArray,
    searchParams: URLSearchParams,
  ) => Promise<void>;
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function exactPathPattern(path: string): RegExp {
  return new RegExp(`^${regexEscape(path)}/?$`);
}

function suffixPathPattern(path: string, suffix: string): RegExp {
  return new RegExp(`^${regexEscape(path)}${suffix}`);
}

export interface ConsoleServerRouteContext {
  registry: SiteRegistry;
  observationFactory: (site: RegisteredSite) => SiteObservationApi;
  controlClientFactory: SiteControlClientFactory;
  registryReadModel: SiteRegistryReadModel;
  registryMutationGateway: RegistryMutationGateway;
  agentSessions?: AgentSessionReadModel;
  siteAgentOverview?: SiteAgentOverviewReadModel;
  siteAgentLaunch?: SiteAgentLaunchGateway;
  siteAgentAdmission?: SiteAgentAdmissionGateway;
  siteAgentLifecycle?: SiteAgentLifecycleGateway;
  siteAgentPending?: SiteAgentPendingTracker;
  workspaceRouteDirectory?: () => Promise<OperatorWorkspaceRouteDirectory>;
  operatorConsoleUiRoot?: string;
  onboardingPlatform?: 'windows' | 'linux';
}

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}


function htmlResponse(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function commandResponse(res: ServerResponse, command: { exitCode: number; result: unknown }): void {
  const body = command.result as Record<string, unknown> | null;
  const status = body?.status === 'refused' && (body.refusals as unknown[] | undefined)?.includes('site_not_found')
    ? 404
    : body?.status === 'conflict'
      ? 409
      : command.exitCode === 0
        ? 200
        : 400;
  jsonResponse(res, status, command.result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function withInvariantDiagnostics(overview: OperatorSiteAgentOverviewWireResponse): OperatorSiteAgentOverviewWireResponse {
  if (overview.status !== 'success') return overview;
  const violations = validateOperatorSiteAgentOverviewInvariants(overview);
  if (violations.length === 0) return overview;
  const diagnostics = violations.map(formatOperatorSiteAgentInvariantViolation);
  return {
    ...overview,
    status: 'refused',
    groups: [],
    refusals: [...overview.refusals, ...diagnostics],
  };
}

function sessionRoutePath(directory: OperatorWorkspaceRouteDirectory, sessionId: string): string | null {
  for (const surface of directory.surfaces) {
    const route = surface.projectedRoutes.find((candidate) =>
      candidate.availability === 'available'
      && candidate.target?.kind === 'session'
      && candidate.target.id === sessionId);
    if (route) return route.path;
  }
  return null;
}

export function scopedAgentSessionsPath(siteId: string, agentId: string): string {
  return `/console/sessions?site=${encodeURIComponent(siteId)}&agent=${encodeURIComponent(agentId)}`;
}

async function requestJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65536) return null;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function commandResultRecord(command: { result: unknown }): Record<string, unknown> | null {
  return isRecord(command.result) ? command.result : null;
}

function redactOnboardingResult(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;
  // Launch internals can contain process commands and environment metadata. The
  // first-use page needs posture and next action, not a second launch artifact.
  return { ...value, launch: null };
}

function onboardingHandoff(
  onboarding: Record<string, unknown> | null,
  start: Record<string, unknown> | null,
): OperatorConsoleOnboardingHandoff | null {
  for (const candidate of [start?.handoff, onboarding?.handoff]) {
    if (!isRecord(candidate)) continue;
    const status = candidate.status;
    if (status !== 'pending' && status !== 'ready' && status !== 'refused') continue;
    const url = typeof candidate.url === 'string' && /^https?:\/\//i.test(candidate.url) ? candidate.url : null;
    return {
      kind: 'browser',
      status,
      url,
      session_id: typeof candidate.session_id === 'string' ? candidate.session_id : null,
      message: typeof candidate.message === 'string' ? candidate.message : null,
    };
  }
  return null;
}

function onboardingSetupActions(
  doctor: Record<string, unknown> | null,
  uiState: OperatorConsoleOnboardingUiState,
): readonly OperatorConsoleOnboardingSetupAction[] {
  if (uiState !== 'needs-intelligence-setup') return [];
  const readiness = isRecord(doctor?.intelligence_catalog_readiness)
    ? doctor.intelligence_catalog_readiness
    : null;
  const nextAction = typeof readiness?.next_action === 'string' ? readiness.next_action : null;
  return [
    {
      id: 'initialize-intelligence-catalog',
      kind: 'command',
      label: 'Initialize catalog and retry onboarding',
      command: 'narada onboarding start --scope user-site',
      description: nextAction ?? 'Populate the User Site catalog and retry the resident launch.',
    },
    {
      id: 'recheck-intelligence-readiness',
      kind: 'refresh',
      label: 'Recheck readiness',
      command: 'narada doctor --bootstrap',
      description: 'Run the readiness check again after setup completes.',
    },
    {
      id: 'credential-free-demo',
      kind: 'demo',
      label: 'Try the no-credential demo',
      command: 'narada onboarding start --scope user-site --demo',
      description: 'Explore the first-use flow without configuring a provider.',
    },
  ];
}

function onboardingUiState(
  doctor: Record<string, unknown> | null,
  onboarding: Record<string, unknown> | null,
  start: Record<string, unknown> | null = null,
): OperatorConsoleOnboardingUiState {
  const startStatus = optionalString(start?.status);
  const startReason = optionalString(start?.reason_code);
  if (startReason === 'intelligence_catalog_not_ready' || startReason === 'intelligence_catalog_setup_required') return 'needs-intelligence-setup';
  if (startStatus === 'blocked') return 'blocked';
  if (startStatus === 'error') return 'failed';

  const onboardingStatus = optionalString(onboarding?.status);
  const session = isRecord(onboarding?.session) ? onboarding.session : null;
  const verification = isRecord(onboarding?.verification) ? onboarding.verification : null;
  if (onboardingStatus === 'first_use_verified' || verification?.status === 'verified') return 'healthy';
  const sessionHealthy = session?.health_status === 'healthy';
  if (startStatus === 'launched' || onboardingStatus === 'launch_requested') return sessionHealthy ? 'runtime-ready' : 'starting';

  const catalogReadiness = isRecord(doctor?.intelligence_catalog_readiness) ? doctor.intelligence_catalog_readiness : null;
  if (catalogReadiness?.status === 'needs_setup' || catalogReadiness?.status === 'check_required') return 'needs-intelligence-setup';
  if (doctor?.status === 'degraded' || onboardingStatus === 'blocked') return 'blocked';
  if (sessionHealthy) return 'runtime-ready';
  return 'ready';
}

function onboardingProjection(
  doctorCommandResult: { result: unknown },
  onboardingCommandResult: { result: unknown },
  startCommandResult?: { result: unknown; exitCode: number },
): OperatorConsoleOnboardingProjection {
  const doctor = commandResultRecord(doctorCommandResult);
  const onboarding = commandResultRecord(onboardingCommandResult);
  const start = startCommandResult ? commandResultRecord(startCommandResult) : null;
  const uiState = onboardingUiState(doctor, onboarding, start);
  const projectedOnboarding = redactOnboardingResult(start ?? onboarding);
  const nextAction = optionalString(projectedOnboarding?.next_action)
    ?? 'Refresh the status to continue.';
  const handoff = ['starting', 'runtime-ready', 'healthy'].includes(uiState)
    ? onboardingHandoff(onboarding, start)
    : null;
  return {
    schema: OPERATOR_CONSOLE_ONBOARDING_SCHEMA,
    status: uiState === 'failed' ? 'failed' : 'success',
    ui_state: uiState,
    posture: uiState,
    doctor,
    onboarding: projectedOnboarding,
    next_action: nextAction,
    actions: {
      start: uiState === 'ready',
      demo: uiState === 'ready' || uiState === 'needs-intelligence-setup',
    },
    handoff,
    setup_actions: onboardingSetupActions(doctor, uiState),
    ...(startCommandResult && startCommandResult.exitCode !== 0 && uiState === 'failed'
      ? { error: optionalString(start?.message) ?? optionalString(start?.reason_code) ?? 'onboarding_start_failed' }
      : {}),
  };
}

function registryMutationInput(payload: Record<string, unknown>): RegistryMutationInput | null {
  const operation = optionalString(payload.operation);
  if (operation !== 'add' && operation !== 'edit' && operation !== 'retire' && operation !== 'restore' && operation !== 'purge') return null;
  const expectedRevision = payload.expected_revision;
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 0)) return null;
  return {
    operation: operation as RegistryMutationOperation,
    siteId: optionalString(payload.site_id),
    reference: optionalString(payload.reference),
    root: optionalString(payload.root),
    variant: optionalString(payload.variant),
    substrate: optionalString(payload.substrate),
    aimJson: optionalString(payload.aim_json),
    controlEndpoint: optionalString(payload.control_endpoint),
    clearAimJson: payload.clear_aim_json === true ? true : undefined,
    clearControlEndpoint: payload.clear_control_endpoint === true ? true : undefined,
    clearAliases: payload.clear_aliases === true ? true : undefined,
    aliases: optionalStringArray(payload.aliases),
    source: optionalString(payload.source),
    sourceRef: optionalString(payload.source_ref),
    reason: optionalString(payload.reason),
    reAdmit: payload.re_admit === true,
    actor: optionalString(payload.actor),
    expectedRevision: expectedRevision as number | undefined,
    confirmSiteId: optionalString(payload.confirm_site_id),
  };
}
function registryQuery(searchParams: URLSearchParams): { source?: 'filesystem' | 'launch_registry' | 'all'; root?: string; actor?: string } | null {
  const source = searchParams.get('source');
  if (source !== null && source !== 'filesystem' && source !== 'launch_registry' && source !== 'all') return null;
  return {
    source: source ?? undefined,
    root: searchParams.get('root') ?? undefined,
    actor: searchParams.get('actor') ?? undefined,
  };
}
function parseLimit(searchParams: URLSearchParams, defaultValue = 50, max = 1000): number {
  const raw = searchParams.get('limit');
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return defaultValue;
  return Math.min(n, max);
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('https://localhost:') ||
    origin.startsWith('https://127.0.0.1:')
  );
}

function setCorsHeaders(res: ServerResponse, origin: string | undefined): boolean {
  if (!isLocalOrigin(origin)) {
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

export function createConsoleServerRoutes(ctx: ConsoleServerRouteContext): RouteHandler[] {
  return [
    // ── CORS preflight ──
    {
      route_id: 'operator-console.cors-preflight',
      method: 'OPTIONS',
      pattern: /^\/console\/.*$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(204);
        res.end();
      },
    },

    // The bundle has a neutral mount; Sites and Agents is the operational entry.
    {
      route_id: 'operator-console.root',
      method: 'GET',
      pattern: new RegExp(`^${regexEscape(OPERATOR_CONSOLE_PATH)}/?$`),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res) => {
        res.writeHead(302, { Location: OPERATOR_CONSOLE_AGENTS_PATH, 'Content-Length': '0' });
        res.end();
      },
    },

    // Shared Operator Console bundle assets are independent of any one page route.
    {
      route_id: 'operator-console.asset',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_ASSET_PATH, '/(.+)$'),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res, params) => {
        const asset = readOperatorConsoleUiAsset(`${OPERATOR_CONSOLE_ASSET_PATH}/${params[1]!}`, ctx.operatorConsoleUiRoot);
        if (!asset) {
          jsonResponse(res, 404, { error: 'Operator Console asset not found' });
          return;
        }
        res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.body.byteLength, 'Cache-Control': 'no-cache' });
        res.end(asset.body);
      },
    },

    // ── CLI-owned first-use onboarding projection ──
    {
      route_id: 'operator-console.onboarding-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_ONBOARDING_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.onboarding-status',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_ONBOARDING_API_PATH, '/status$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const commandContext = silentCommandContext();
          const doctor = await doctorCommand({ bootstrap: true, format: 'json' }, commandContext);
          const onboarding = await onboardingStatusCommand({
            platform: ctx.onboardingPlatform,
            scope: 'user-site',
            format: 'json',
          }, commandContext);
          jsonResponse(res, 200, onboardingProjection(doctor, onboarding));
        } catch (error) {
          jsonResponse(res, 500, {
            schema: OPERATOR_CONSOLE_ONBOARDING_SCHEMA,
            status: 'failed',
            ui_state: 'failed',
            posture: 'failed',
            doctor: null,
            onboarding: null,
            next_action: 'Run `narada doctor --bootstrap` and `narada onboarding status` in the terminal.',
            actions: { start: false, demo: true },
            handoff: null,
            setup_actions: [],
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      route_id: 'operator-console.onboarding-start',
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_ONBOARDING_API_PATH, '/start$'),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'onboarding.start',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const mode = optionalString(payload?.mode) ?? 'live';
        if (!payload || payload.confirm !== true || (mode !== 'live' && mode !== 'demo')) {
          jsonResponse(res, 400, {
            schema: OPERATOR_CONSOLE_ONBOARDING_SCHEMA,
            status: 'failed',
            ui_state: 'blocked',
            posture: 'blocked',
            doctor: null,
            onboarding: null,
            next_action: 'Confirm an onboarding action with mode `live` or `demo`.',
            actions: { start: false, demo: true },
            handoff: null,
            setup_actions: [],
            error: 'confirmed_onboarding_action_required',
          });
          return;
        }
        try {
          const commandContext = silentCommandContext();
          const doctor = await doctorCommand({ bootstrap: true, format: 'json' }, commandContext);
          const existing = await onboardingStatusCommand({
            platform: ctx.onboardingPlatform,
            scope: 'user-site',
            format: 'json',
          }, commandContext);
          const existingRecord = commandResultRecord(existing);
          const existingStatus = optionalString(existingRecord?.status);
          if (mode === 'live' && (existingStatus === 'launch_requested' || existingStatus === 'first_use_verified')) {
            jsonResponse(res, 200, onboardingProjection(doctor, existing));
            return;
          }
          const start = await onboardingStartCommand({
            platform: ctx.onboardingPlatform,
            scope: 'user-site',
            demo: mode === 'demo',
            interactive: false,
            noExec: false,
            format: 'json',
          }, commandContext);
          const onboarding = await onboardingStatusCommand({
            platform: ctx.onboardingPlatform,
            scope: 'user-site',
            format: 'json',
          }, commandContext);
          const projection = onboardingProjection(doctor, onboarding, start);
          const status = projection.status === 'failed' ? 500 : 200;
          jsonResponse(res, status, projection);
        } catch (error) {
          jsonResponse(res, 500, {
            schema: OPERATOR_CONSOLE_ONBOARDING_SCHEMA,
            status: 'failed',
            ui_state: 'failed',
            posture: 'failed',
            doctor: null,
            onboarding: null,
            next_action: 'Run `narada onboarding start` in the terminal to inspect the refusal.',
            actions: { start: false, demo: true },
            handoff: null,
            setup_actions: [],
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },

    // ── CLI-owned launcher routing surface ──
    {
      route_id: 'operator-console.launch-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_LAUNCH_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.sessions-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_SESSIONS_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.agents-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_AGENTS_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.agents-overview',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_AGENTS_API_PATH, '/overview$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        if (!ctx.siteAgentOverview) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.site_agent_overview.v1',
            status: 'refused',
            generated_at: new Date().toISOString(),
            groups: [],
            refusals: ['site_agent_overview_unavailable'],
          });
          return;
        }
        jsonResponse(res, 200, withInvariantDiagnostics(await ctx.siteAgentOverview.read()));
      },
    },
    {
      route_id: 'operator-console.agent-admission-options',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_AGENTS_ADMISSION_OPTIONS_API_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (req, res, _params, searchParams) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = searchParams.get('site_id')?.trim();
        if (!siteId) {
          jsonResponse(res, 400, { error: 'site_id is required' });
          return;
        }
        if (!ctx.siteAgentAdmission) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.site_agent_admission_options.v1',
            status: 'refused',
            generated_at: new Date().toISOString(),
            site_id: siteId,
            site_display_name: null,
            revision: null,
            roles: [],
            agent_kinds: [],
            runtimes: [],
            operator_surfaces: [],
            intelligence: {
              selection_authority: null,
              policy_choices: [],
              provider_choices: [],
              model_choices: [],
            },
            refusals: ['site_agent_admission_unavailable'],
          });
          return;
        }
        const result = await ctx.siteAgentAdmission.options(siteId);
        jsonResponse(res, result.status === 'refused' ? 409 : 200, result);
      },
    },
    {
      route_id: 'operator-console.agent-admission',
      method: 'POST',
      pattern: exactPathPattern(OPERATOR_CONSOLE_AGENTS_ADMISSION_API_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'agent.admit',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const siteId = optionalString(payload?.site_id)?.trim();
        const role = optionalString(payload?.role)?.trim();
        const agentKind = optionalString(payload?.agent_kind)?.trim();
        const runtime = optionalString(payload?.runtime)?.trim();
        const operatorSurface = optionalString(payload?.operator_surface)?.trim();
        if (!siteId || !role || !agentKind || !runtime || !operatorSurface) {
          jsonResponse(res, 400, { error: 'site_id, role, agent_kind, runtime, and operator_surface are required' });
          return;
        }
        if (!ctx.siteAgentAdmission) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.site_agent_admission.v1',
            status: 'failed',
            site_id: siteId,
            agent_id: null,
            local_agent_id: null,
            role,
            agent_kind: agentKind,
            runtime,
            operator_surface: operatorSurface,
            reason: 'site_agent_admission_unavailable',
            message: 'The Site agent admission gateway is unavailable.',
            request_id: `unavailable_${Date.now()}`,
            options_revision: optionalString(payload?.options_revision) ?? null,
            intelligence: {
              selection_authority: null,
              policy: optionalString(payload?.intelligence_policy) ?? null,
              provider: optionalString(payload?.provider) ?? null,
              model: optionalString(payload?.model) ?? null,
            },
          });
          return;
        }
        const result = await ctx.siteAgentAdmission.admit({
          site_id: siteId,
          role,
          agent_kind: agentKind,
          runtime,
          operator_surface: operatorSurface,
          ...(optionalString(payload?.intelligence_policy) ? { intelligence_policy: optionalString(payload?.intelligence_policy) } : {}),
          ...(optionalString(payload?.provider) ? { provider: optionalString(payload?.provider) } : {}),
          ...(optionalString(payload?.model) ? { model: optionalString(payload?.model) } : {}),
          ...(optionalString(payload?.options_revision) ? { options_revision: optionalString(payload?.options_revision) } : {}),
        });
        const status = result.status === 'refused' ? 409 : result.status === 'failed' ? 500 : 201;
        jsonResponse(res, status, result);
      },
    },
    {
      route_id: 'operator-console.agent-stop',
      method: 'POST',
      pattern: exactPathPattern(OPERATOR_CONSOLE_AGENTS_STOP_API_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'agent.stop',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const siteId = optionalString(payload?.site_id)?.trim();
        const agentId = optionalString(payload?.agent_id)?.trim();
        if (!siteId || !agentId) {
          jsonResponse(res, 400, { error: 'site_id and agent_id are required' });
          return;
        }
        if (!ctx.siteAgentLifecycle) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.agent_stop.v1',
            status: 'failed',
            site_id: siteId,
            agent_id: agentId,
            session_id: null,
            reason: 'site_agent_lifecycle_unavailable',
            message: 'The Site agent lifecycle gateway is unavailable.',
            request_id: `unavailable_${Date.now()}`,
          });
          return;
        }
        const result = await ctx.siteAgentLifecycle.stop({ siteId, agentId });
        const status = result.status === 'refused' ? 409 : result.status === 'failed' ? 500 : 200;
        jsonResponse(res, status, result);
      },
    },
    {
      route_id: 'operator-console.agent-delete',
      method: 'POST',
      pattern: exactPathPattern(OPERATOR_CONSOLE_AGENTS_DELETE_API_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'agent.delete',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const siteId = optionalString(payload?.site_id)?.trim();
        const agentId = optionalString(payload?.agent_id)?.trim();
        if (!siteId || !agentId) {
          jsonResponse(res, 400, { error: 'site_id and agent_id are required' });
          return;
        }
        if (!ctx.siteAgentLifecycle) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.agent_delete.v1',
            status: 'failed',
            site_id: siteId,
            agent_id: agentId,
            reason: 'site_agent_lifecycle_unavailable',
            message: 'The Site agent lifecycle gateway is unavailable.',
            request_id: `unavailable_${Date.now()}`,
          });
          return;
        }
        const result = await ctx.siteAgentLifecycle.delete({ siteId, agentId });
        const status = result.status === 'refused' ? 409 : result.status === 'failed' ? 500 : 200;
        jsonResponse(res, status, result);
      },
    },
    {
      route_id: 'operator-console.agent-launch',
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_AGENTS_API_PATH, '/launch$'),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'agent.launch',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const siteId = optionalString(payload?.site_id)?.trim();
        const agentId = optionalString(payload?.agent_id)?.trim();
        const operatorSurface = optionalString(payload?.operator_surface)?.trim() || undefined;
        if (!siteId || !agentId) {
          jsonResponse(res, 400, { error: 'site_id and agent_id are required' });
          return;
        }
        if (!ctx.siteAgentLaunch) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.agent_launch.v1',
            status: 'failed',
            site_id: siteId,
            agent_id: agentId,
            session_id: null,
            reason: 'site_agent_launch_unavailable',
            ...(operatorSurface ? { operator_surface: operatorSurface } : {}),
          });
          return;
        }
        const result = await ctx.siteAgentLaunch.launch({
          siteId,
          agentId,
          ...(operatorSurface ? { operatorSurface } : {}),
        });
        if (result.status === 'launched') {
          const now = new Date().toISOString();
          ctx.siteAgentPending?.record({
            site_id: siteId,
            agent_id: agentId,
            session_id: result.session_id,
            started_at: now,
            updated_at: now,
            phase: 'launch_accepted',
          });
        }
        const status = result.status === 'refused' ? 409 : result.status === 'failed' ? 500 : 200;
        jsonResponse(res, status, result);
      },
    },
    {
      route_id: 'operator-console.agent-pending',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_AGENTS_API_PATH, '/pending$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        jsonResponse(res, 200, {
          schema: 'narada.operator_console.agent_pending.v1',
          status: 'success',
          generated_at: new Date().toISOString(),
          pending: ctx.siteAgentPending?.list() ?? [],
        });
      },
    },
    {
      route_id: 'operator-console.agent-session-route',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_AGENTS_API_PATH, '/session-route$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (req, res, _params, searchParams) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = searchParams.get('site_id')?.trim();
        const agentId = searchParams.get('agent_id')?.trim();
        const requestedSessionId = searchParams.get('session_id')?.trim() || null;
        if (!siteId || !agentId) {
          jsonResponse(res, 400, { error: 'site_id and agent_id are required' });
          return;
        }
        const sessionRouteResponse = (
          status: 'ready' | 'pending' | 'ambiguous' | 'refused',
          sessionId: string | null,
          url: string | null,
          reason: string | null,
          phase: 'waiting_for_session' | 'waiting_for_route' | 'ready' | 'ambiguous' | 'refused',
        ) => ({
          schema: 'narada.operator_console.agent_session_route.v1',
          status,
          site_id: siteId,
          agent_id: agentId,
          session_id: sessionId,
          url,
          sessions_path: scopedAgentSessionsPath(siteId, agentId),
          reason,
          phase,
        });
        if (!ctx.siteAgentOverview) {
          jsonResponse(res, 503, sessionRouteResponse('refused', null, null, 'site_agent_overview_unavailable', 'refused'));
          return;
        }
        const overview = await ctx.siteAgentOverview.read();
        const agent = overview.groups
          .flatMap((group) => group.sites)
          .find((site) => site.site_id === siteId)
          ?.agents.find((candidate) => candidate.agent_id === agentId);
        if (!agent) {
          jsonResponse(res, 404, sessionRouteResponse('refused', null, null, 'agent_not_found', 'refused'));
          return;
        }
        const pending = ctx.siteAgentPending?.resolve(siteId, agentId) ?? null;
        if (requestedSessionId && pending?.session_id && requestedSessionId !== pending.session_id) {
          jsonResponse(res, 409, sessionRouteResponse('refused', requestedSessionId, null, 'launch_session_mismatch', 'refused'));
          return;
        }
        const correlatedSessionId = requestedSessionId ?? pending?.session_id ?? null;
        if (correlatedSessionId && !agent.runtime.healthy_session_ids.includes(correlatedSessionId)) {
          const now = new Date().toISOString();
          ctx.siteAgentPending?.update(siteId, agentId, { phase: 'waiting_for_session', updated_at: now });
          jsonResponse(res, 200, sessionRouteResponse('pending', correlatedSessionId, null, null, 'waiting_for_session'));
          return;
        }
        if (!correlatedSessionId && agent.runtime.state === 'ambiguous') {
          jsonResponse(res, 200, sessionRouteResponse('ambiguous', null, null, 'multiple_healthy_sessions', 'ambiguous'));
          return;
        }
        const candidateSessionId = correlatedSessionId ?? agent.runtime.selected_session_id;
        if (!candidateSessionId) {
          const now = new Date().toISOString();
          ctx.siteAgentPending?.update(siteId, agentId, { phase: 'waiting_for_session', updated_at: now });
          jsonResponse(res, 200, sessionRouteResponse('pending', null, null, null, 'waiting_for_session'));
          return;
        }
        const directory = ctx.workspaceRouteDirectory ? await ctx.workspaceRouteDirectory() : null;
        const routePath = directory ? sessionRoutePath(directory, candidateSessionId) : null;
        if (!routePath) {
          const now = new Date().toISOString();
          ctx.siteAgentPending?.update(siteId, agentId, { phase: 'waiting_for_route', updated_at: now });
          jsonResponse(res, 200, sessionRouteResponse('pending', candidateSessionId, null, null, 'waiting_for_route'));
          return;
        }
        ctx.siteAgentPending?.remove(siteId, agentId);
        jsonResponse(res, 200, sessionRouteResponse('ready', candidateSessionId, routePath, null, 'ready'));
      },
    },
    {
      route_id: 'operator-console.sessions-list',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_SESSIONS_PATH, '/api/sessions$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        if (!ctx.agentSessions) {
          jsonResponse(res, 503, {
            schema: 'narada.operator_console.agent_sessions.v1',
            status: 'refused',
            generated_at: new Date().toISOString(),
            count: 0,
            sessions: [],
            refusals: ['agent_session_read_model_unavailable'],
          });
          return;
        }
        jsonResponse(res, 200, await ctx.agentSessions.list());
      },
    },
    // ── Canonical Site Registry management plan/apply boundary ──
    {
      route_id: 'operator-console.registry-plan',
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/operations/plan$'),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'registry.plan',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const input = payload ? registryMutationInput(payload) : null;
        if (!input) {
          jsonResponse(res, 400, { error: 'Invalid registry management request' });
          return;
        }
        commandResponse(res, await ctx.registryMutationGateway.plan(input));
      },
    },
    {
      route_id: 'operator-console.registry-apply',
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/operations/apply$'),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'registry.apply',
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = await requestJson(req);
        const input = payload ? registryMutationInput(payload) : null;
        if (!payload || !input || payload.confirm_apply !== true) {
          jsonResponse(res, 400, { error: 'Confirmed registry management request required' });
          return;
        }
        commandResponse(res, await ctx.registryMutationGateway.apply(input));
      },
    },
    // ── Canonical Site Registry browser projection ──
    {
      route_id: 'operator-console.registry-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.registry-add-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_REGISTRY_ADD_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.registry-manage-page',
      method: 'GET',
      pattern: exactPathPattern(OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH),
      remote_disposition: 'proxy',
      remote_kind: 'document',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        htmlResponse(res, 200, readOperatorConsoleUiDocument(ctx.operatorConsoleUiRoot));
      },
    },
    {
      route_id: 'operator-console.registry-sites',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/sites$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        commandResponse(res, await ctx.registryReadModel.list());
      },
    },
    {
      route_id: 'operator-console.registry-site',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/sites/([^/]+)$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, params) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        commandResponse(res, await ctx.registryReadModel.show(decodeURIComponent(params[1]!)));
      },
    },
    // Per-site launch/ensure action; plan-first (dry-run) unless explicitly told to apply.
    {
      route_id: 'operator-console.registry-site-launch',
      method: 'POST',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/sites/([^/]+)/launch$'),
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'site.launch',
      handler: async (req, res, params) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const payload = (await requestJson(req)) ?? {};
        const dryRun = payload.dry_run !== false;
        commandResponse(res, await sitesLaunchCommand({
          siteId: decodeURIComponent(params[1]!),
          dryRun,
          format: 'json',
        }, silentCommandContext({})));
      },
    },
    {
      route_id: 'operator-console.registry-discover-plan',
      method: 'GET',
      pattern: suffixPathPattern(OPERATOR_CONSOLE_REGISTRY_PATH, '/api/discover-plan$'),
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const query = registryQuery(searchParams);
        if (!query) {
          jsonResponse(res, 400, { error: 'Invalid registry discovery source' });
          return;
        }
        commandResponse(res, await ctx.registryReadModel.discoverPlan(query));
      },
    },
    // ── Sites ──
    {
      route_id: 'operator-console.sites-list',
      method: 'GET',
      pattern: /^\/console\/sites$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const sites = ctx.registry.listSites();
        const limit = parseLimit(searchParams, 1000);
        jsonResponse(res, 200, { sites: sites.slice(0, limit) });
      },
    },

    {
      route_id: 'operator-console.site-show',
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, params) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const api = ctx.observationFactory(site);
        const health = await api.getHealth();
        jsonResponse(res, 200, { site, health });
      },
    },

    // ── Health ──
    {
      route_id: 'operator-console.health',
      method: 'GET',
      pattern: /^\/console\/health$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const { aggregateHealth } = await import('@narada-core/windows-site');
        const summary = await aggregateHealth(ctx.registry, ctx.observationFactory);
        jsonResponse(res, 200, { summary });
      },
    },

    // ── Attention ──
    {
      route_id: 'operator-console.attention',
      method: 'GET',
      pattern: /^\/console\/attention$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const { deriveAttentionQueue } = await import('@narada-core/windows-site');
        const items = await deriveAttentionQueue(ctx.registry, ctx.observationFactory);
        jsonResponse(res, 200, { items });
      },
    },

    // ── Logs (registry audit) ──
    {
      route_id: 'operator-console.logs',
      method: 'GET',
      pattern: /^\/console\/logs$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        // Cross-site audit: aggregate newest records across all sites
        const sites = ctx.registry.listSites();
        const allRecords = sites.flatMap((site) =>
          ctx.registry.getAuditRecordsForSite(site.siteId, limit),
        );
        allRecords.sort((a, b) => b.routedAt.localeCompare(a.routedAt));
        jsonResponse(res, 200, { logs: allRecords.slice(0, limit) });
      },
    },

    {
      route_id: 'operator-console.site-logs',
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)\/logs$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const logs = ctx.registry.getAuditRecordsForSite(siteId, limit);
        jsonResponse(res, 200, { site_id: siteId, logs });
      },
    },

    // ── Traces ──
    {
      route_id: 'operator-console.site-traces',
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)\/traces$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        // Traces are derived from site observation where available.
        // For v0, return an empty array with a note if the adapter cannot provide traces.
        const api = ctx.observationFactory(site);
        // Attempt to get health as a proxy for trace availability
        const health = await api.getHealth();
        jsonResponse(res, 200, {
          site_id: siteId,
          traces: [],
          note: 'Trace observability is adapter-dependent. v0 returns empty array; adapters may enrich in future versions.',
          health_status: health.status,
        });
      },
    },

    // ── Cycles ──
    {
      route_id: 'operator-console.site-cycles',
      method: 'GET',
      pattern: /^\/console\/sites\/([^/]+)\/cycles$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        // Cycle records are adapter-dependent. v0 returns empty array.
        jsonResponse(res, 200, {
          site_id: siteId,
          cycles: [],
          note: 'Cycle observability is adapter-dependent. v0 returns empty array; adapters may enrich in future versions.',
        });
      },
    },

    // ── Audit ──
    {
      route_id: 'operator-console.audit',
      method: 'GET',
      pattern: /^\/console\/audit$/,
      remote_disposition: 'proxy',
      remote_kind: 'observation',
      remote_intent: null,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 50);
        const sites = ctx.registry.listSites();
        const allRecords = sites.flatMap((site) =>
          ctx.registry.getAuditRecordsForSite(site.siteId, limit),
        );
        allRecords.sort((a, b) => b.routedAt.localeCompare(a.routedAt));
        jsonResponse(res, 200, { audit: allRecords.slice(0, limit) });
      },
    },

    // ── Control ──
    {
      route_id: 'operator-console.site-control',
      method: 'POST',
      pattern: /^\/console\/sites\/([^/]+)\/control$/,
      remote_disposition: 'proxy',
      remote_kind: 'intent',
      remote_intent: 'site.control',
      handler: async (req, res, params) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const siteId = decodeURIComponent(params[1]!);
        const site = ctx.registry.getSite(siteId);
        if (!site) {
          jsonResponse(res, 404, { error: 'Site not found' });
          return;
        }

        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) {
            jsonResponse(res, 413, { error: 'Payload too large' });
            return;
          }
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
          return;
        }

        const payload = parsed as Record<string, unknown>;
        if (!payload.action_type || typeof payload.action_type !== 'string') {
          jsonResponse(res, 400, { error: 'Missing or invalid action_type' });
          return;
        }

        const { ControlRequestRouter } = await import('@narada-core/windows-site');
        const router = new ControlRequestRouter({
          registry: ctx.registry,
          clientFactory: ctx.controlClientFactory,
        });

        const request: ConsoleControlRequest = {
          requestId: `http-${Date.now()}`,
          siteId,
          actionType: payload.action_type as ConsoleControlRequest['actionType'],
          targetId: (payload.target_id as string) ?? '',
          targetKind: (payload.target_kind as ConsoleControlRequest['targetKind']) ?? 'outbound_command',
          scopeId: (payload.scope_id as string) ?? undefined,
          payload: (payload.payload as Record<string, unknown>) ?? undefined,
          requestedAt: new Date().toISOString(),
          requestedBy: (payload.requested_by as string) ?? 'browser',
        };

        const routeResult = await router.route(request);

        const statusCode = routeResult.success
          ? 200
          : routeResult.status === 'rejected'
            ? 422
            : 502;
        jsonResponse(res, statusCode, routeResult);
      },
    },
  ];
}
