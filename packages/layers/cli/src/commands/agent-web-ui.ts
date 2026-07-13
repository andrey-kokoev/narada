import type { CommandContext } from '../lib/command-wrapper.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { executeOperatorProjectionOpenRequest } from '@narada2/process-launch-posture';
import { agentIdentityDisplay, agentIdentityGroupKey, agentIdentityRefMatchesRequest, normalizeSiteToken, roleSegment, siteSegment } from '@narada2/agent-identity';
import {
  DEFAULT_OPERATOR_ROUTER_PORT,
  ensureOperatorRouter,
  inspectOperatorRouterRouteSet,
  readOperatorRouterRoutes,
  reconstructOperatorRouteSet,
  registerOperatorRoute,
  registerOperatorRouteSet,
  type EnsureOperatorRouterOptions,
  type EnsureOperatorRouterResult,
  type OperatorRouterAdminOptions,
} from '@narada2/operator-router';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { narsAttachCommandCommand, narsSessionsCommand } from './nars.js';

export interface AgentWebUiAttachOptions {
  session?: string;
  agent?: string;
  site?: string;
  siteRoot?: string;
  host?: string;
  port?: number;
  dryRun?: boolean;
  allowStaleSession?: boolean;
  inspectStaleSession?: boolean;
  healthTimeoutMs?: number;
  waitForSessionMs?: number;
  launchBindingPath?: string;
  format?: CliFormat;
  launchRegistryPath?: string;
  open?: boolean;
  onboarding?: boolean;
  cloudflareApiBaseUrl?: string;
}

function allowsStaleSessionInspection(options: AgentWebUiAttachOptions): boolean {
  return options.inspectStaleSession === true || options.allowStaleSession === true;
}

function operatorRouterSessionKey(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex').slice(0, 32);
}

function operatorRouterSessionPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

function operatorRouterUrl(host: string, port: number): string {
  const displayHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${displayHost}:${port}`;
}

function operatorRouterWebsocketUrl(routerUrl: string, publicPath: string): string {
  const parsed = new URL(`${routerUrl.replace(/\/+$/, '')}${publicPath}`);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return parsed.toString();
}

function operatorRouterAdmin(router: EnsureOperatorRouterResult): OperatorRouterAdminOptions {
  return { url: router.url, registration_token: router.registration_token };
}

function closeStartedServer(server: unknown): Promise<void> {
  if (!server || typeof server !== 'object') return Promise.resolve();
  const close = (server as { close?: (callback: () => void) => void }).close;
  if (typeof close !== 'function') return Promise.resolve();
  return new Promise((resolve) => close.call(server, resolve));
}

async function resolveAttachSessionIdFromLaunchBinding(options: AgentWebUiAttachOptions, progress: ProgressReporter): Promise<ResolvedAttachSession> {
  const bindingPath = options.launchBindingPath?.trim();
  if (!bindingPath) throw new Error('launch_binding_required');
  const startedAt = Date.now();
  let observedCurrentLaunchStart = false;
  const timeoutMs = Math.max(0, Math.trunc(options.waitForSessionMs ?? 0));
  if (!options.dryRun) {
    progress(timeoutMs > 0
      ? `agent-web-ui: waiting up to ${Math.ceil(timeoutMs / 1000)}s for launch binding`
      : 'agent-web-ui: reading launch binding');
  }
  let nextProgressAt = startedAt + 5000;
  let lastReason = 'launch_binding_unresolved';
  do {
    const binding = await readJsonRecord(bindingPath);
    if (isCurrentLaunchBindingStart(binding, startedAt)) observedCurrentLaunchStart = true;
    const readyBinding = isAttachableLaunchBinding(binding, { startedAt, observedCurrentLaunchStart });
    const directSession = sessionIdFromRecord(binding);
    if (directSession && readyBinding) {
      if (!options.dryRun) progress(`agent-web-ui: launch binding resolved NARS session ${directSession}`);
      return { sessionId: directSession, reason: 'launch_binding' };
    }
    const resultPath = stringField(binding, 'agent_start_result_file') ?? stringField(binding, 'result_file');
    if (resultPath && readyBinding) {
      const result = await readJsonRecord(resultPath);
      const resultSession = sessionIdFromRecord(result);
      if (resultSession) {
        if (!options.dryRun) progress(`agent-web-ui: launch result resolved NARS session ${resultSession}`);
        return { sessionId: resultSession, reason: 'launch_binding_result_file' };
      }
      if (stringField(result, 'status') === 'failed') lastReason = 'agent_start_failed';
    }
    if (isCurrentLaunchBindingFailure(binding, { startedAt, observedCurrentLaunchStart })) lastReason = stringField(binding, 'reason') ?? 'launch_binding_failed';
    if (timeoutMs <= 0 || Date.now() - startedAt >= timeoutMs || lastReason !== 'launch_binding_unresolved') break;
    if (!options.dryRun && Date.now() >= nextProgressAt) {
      progress('agent-web-ui: still waiting for launch binding result');
      nextProgressAt = Date.now() + 5000;
    }
    await delay(1000);
  } while (Date.now() - startedAt < timeoutMs);
  throw new AttachSessionDiscoveryError(`launch_binding_unresolved: ${lastReason}: ${bindingPath}`, 'launch_binding_unresolved');
}

function isCurrentLaunchBindingStart(binding: Record<string, unknown> | null, startedAt: number): boolean {
  if (stringField(binding, 'status') !== 'waiting_for_agent_start') return false;
  return bindingUpdatedAtMs(binding) >= startedAt - 10000;
}

function isAttachableLaunchBinding(binding: Record<string, unknown> | null, args: { startedAt: number; observedCurrentLaunchStart: boolean }): boolean {
  if (!binding) return false;
  if (stringField(binding, 'status') !== 'ready') return false;
  if (args.observedCurrentLaunchStart) return true;
  return bindingUpdatedAtMs(binding) >= args.startedAt - 10000;
}

function isCurrentLaunchBindingFailure(binding: Record<string, unknown> | null, args: { startedAt: number; observedCurrentLaunchStart: boolean }): boolean {
  if (!binding) return false;
  if (stringField(binding, 'status') !== 'failed') return false;
  if (args.observedCurrentLaunchStart) return true;
  return bindingUpdatedAtMs(binding) >= args.startedAt - 10000;
}

function bindingUpdatedAtMs(binding: Record<string, unknown> | null): number {
  const updatedAt = stringField(binding, 'updated_at');
  if (!updatedAt) return 0;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readJsonRecord(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function sessionIdFromRecord(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const narsLaunch = objectField(record, 'nars_launch');
  const requiredEnvironment = objectField(record, 'required_environment');
  return stringField(record, 'nars_session_id')
    ?? stringField(record, 'runtime_session_id')
    ?? stringField(record, 'session_id')
    ?? stringField(narsLaunch, 'nars_session_id')
    ?? stringField(narsLaunch, 'session_id')
    ?? stringField(requiredEnvironment, 'NARADA_NARS_SESSION_ID')
    ?? stringField(requiredEnvironment, 'NARADA_RUNTIME_SESSION_ID')
    ?? stringField(requiredEnvironment, 'NARADA_CARRIER_SESSION_ID');
}

interface ResolvedAttachSession {
  sessionId: string;
  reason: string | null;
}

interface AttachSessionCandidate {
  session_id: string | null;
  agent_id: string | null;
  agent_identity_ref: unknown;
  site_id: string | null;
  site_root: string | null;
  display_state: string | null;
  terminal_state: string | null;
  health_status: string | null;
  started_at: string | null;
}

class AttachSessionDiscoveryError extends Error {
  constructor(
    message: string,
    readonly reason: 'nars_session_not_found_for_agent' | 'nars_session_ambiguous_for_agent' | 'session_discovery_failed' | 'launch_binding_unresolved',
    readonly candidates: AttachSessionCandidate[] = [],
  ) {
    super(message);
  }
}

type ProgressReporter = (line: string) => void;

async function resolveAttachSessionId(options: AgentWebUiAttachOptions, context: CommandContext, progress: ProgressReporter): Promise<ResolvedAttachSession> {
  if (options.session) return { sessionId: options.session, reason: null };
  if (options.launchBindingPath) return resolveAttachSessionIdFromLaunchBinding(options, progress);
  const agentId = options.agent?.trim();
  if (!agentId) throw new Error('nars_session_required: pass --session <session-id> or --agent <agent-id>');
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Math.trunc(options.waitForSessionMs ?? 0));
  if (!options.dryRun && timeoutMs > 0) {
    progress(`agent-web-ui: waiting up to ${Math.ceil(timeoutMs / 1000)}s for a healthy NARS session for ${agentId}`);
  }
  let lastError: Error | null = null;
  let nextProgressAt = startedAt + 5000;
  do {
    try {
      const resolved = await discoverAttachSessionIdOnce(options, context, agentId);
      if (!options.dryRun) progress(`agent-web-ui: found NARS session ${resolved.sessionId}`);
      return resolved;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!(lastError instanceof AttachSessionDiscoveryError) || lastError.reason !== 'nars_session_not_found_for_agent' || Date.now() - startedAt >= timeoutMs) break;
      if (!options.dryRun && Date.now() >= nextProgressAt) {
        progress(`agent-web-ui: still waiting for ${agentId} NARS session health`);
        nextProgressAt = Date.now() + 5000;
      }
      await delay(1000);
    }
  } while (Date.now() - startedAt < timeoutMs);
  throw lastError ?? new AttachSessionDiscoveryError(`nars_session_not_found_for_agent: ${agentId}`, 'nars_session_not_found_for_agent');
}

async function discoverAttachSessionIdOnce(options: AgentWebUiAttachOptions, context: CommandContext, agentId: string): Promise<ResolvedAttachSession> {
  const sessionsResult = await narsSessionsCommand({
    site: options.site,
    siteRoot: options.siteRoot,
    health: options.dryRun === true ? false : true,
    healthTimeoutMs: options.healthTimeoutMs,
    limit: 200,
    format: 'json',
    launchRegistryPath: options.launchRegistryPath,
  }, context);
  if (sessionsResult.exitCode !== ExitCode.SUCCESS) {
    throw new AttachSessionDiscoveryError(`session_discovery_failed: ${agentId}`, 'session_discovery_failed');
  }
  const body = sessionsResult.result as { sessions?: Array<Record<string, unknown>> };
  const candidates = body.sessions ?? [];
  const matches = candidates.filter((session) => {
    const candidateAgent = stringField(session, 'agent_id');
    const sessionId = stringField(session, 'session_id') ?? stringField(session, 'carrier_session_id');
    const displayState = stringField(session, 'display_state');
    const terminalState = stringField(session, 'terminal_state');
    return agentIdMatchesSession(agentId, session)
      && Boolean(sessionId)
      && isDiscoverableAttachSessionState(displayState, { requireActive: options.dryRun !== true && !(Number(options.waitForSessionMs ?? 0) > 0) })
      && (!terminalState || terminalState === 'running');
  });
  if (matches.length === 0) {
    throw new AttachSessionDiscoveryError(
      `nars_session_not_found_for_agent: ${agentId}`,
      'nars_session_not_found_for_agent',
      candidates.map(toAttachSessionCandidate),
    );
  }
  const ambiguityGroups = distinctAttachIdentityGroups(matches);
  if (ambiguityGroups.size > 1) {
    throw new AttachSessionDiscoveryError(
      `nars_session_ambiguous_for_agent: ${agentId}: ${Array.from(ambiguityGroups).join(', ')}`,
      'nars_session_ambiguous_for_agent',
      matches.map(toAttachSessionCandidate),
    );
  }
  const selected = matches.sort(compareSessionsNewestFirst)[0];
  const sessionId = stringField(selected, 'session_id') ?? stringField(selected, 'carrier_session_id');
  if (!sessionId) throw new AttachSessionDiscoveryError(`nars_session_not_found_for_agent: ${agentId}`, 'nars_session_not_found_for_agent', candidates.map(toAttachSessionCandidate));
  return { sessionId, reason: 'discovered_by_agent' };
}

function agentIdMatchesSession(requestedAgentId: string, session: Record<string, unknown>): boolean {
  const identityRef = objectField(session, 'agent_identity_ref');
  if (identityRef && agentIdentityRefMatchesRequest(identityRef, requestedAgentId)) return true;
  const candidateAgent = stringField(session, 'agent_id');
  if (!candidateAgent) return false;
  if (candidateAgent === requestedAgentId) return true;
  const requestedRole = roleSegment(requestedAgentId);
  const candidateRole = roleSegment(candidateAgent);
  if (!requestedRole || requestedRole !== candidateRole) return false;
  const requestedSite = siteSegment(requestedAgentId);
  const candidateSite = stringField(session, 'site_id') ?? siteSegment(candidateAgent);
  if (requestedSite && candidateSite) return normalizeSiteToken(requestedSite) === normalizeSiteToken(candidateSite);
  return !requestedAgentId.includes('.');
}

function distinctAttachIdentityGroups(sessions: Record<string, unknown>[]): Set<string> {
  return new Set(sessions.map((session) => agentIdentityGroupKey(
    objectField(session, 'agent_identity_ref'),
    stringField(session, 'agent_id'),
    stringField(session, 'site_id'),
  )));
}

function toAttachSessionCandidate(session: Record<string, unknown>): AttachSessionCandidate {
  return {
    session_id: stringField(session, 'session_id') ?? stringField(session, 'carrier_session_id'),
    agent_id: stringField(session, 'agent_id'),
    agent_identity_ref: objectField(session, 'agent_identity_ref'),
    site_id: stringField(session, 'site_id'),
    site_root: stringField(session, 'site_root'),
    display_state: stringField(session, 'display_state'),
    terminal_state: stringField(session, 'terminal_state'),
    health_status: stringField(session, 'health_status'),
    started_at: stringField(session, 'started_at'),
  };
}

function isDiscoverableAttachSessionState(displayState: string | null, options: { requireActive: boolean }): boolean {
  if (options.requireActive) return displayState === 'active';
  return displayState === 'active' || displayState === 'starting_or_degraded';
}

function compareSessionsNewestFirst(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return sessionTimestampMs(right) - sessionTimestampMs(left);
}

function sessionTimestampMs(session: Record<string, unknown>): number {
  for (const field of ['last_seen_at', 'started_at', 'projection_generated_at']) {
    const value = stringField(session, field);
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AttachabilityResult {
  status: 'attachable' | 'not_attachable';
  reason: string | null;
  health_status: string | null;
}

interface AuthorityTransitionSnapshot {
  authority_runtime_host: string | null;
  authority_epoch: number | null;
  authority_runtime_id: string | null;
  authority_transition_state: string | null;
  source_write_admission: string | null;
  superseded_by_session_id: string | null;
  authority_locator_ref: string | null;
  target_authority_locator: Record<string, unknown> | null;
  stale_source: boolean;
  input_policy: 'enabled' | 'disabled_source_sealed';
  reattach: {
    target_session_id: string | null;
    target_locator_ref: string | null;
    target_authority_locator: Record<string, unknown> | null;
  } | null;
}

async function assessAttachability(
  session: Record<string, unknown> | null | undefined,
  options: { healthEndpoint: string | null; timeoutMs: number },
): Promise<AttachabilityResult> {
  const authority = authorityTransitionSnapshot(session);
  if (authority.stale_source) return { status: 'not_attachable', reason: 'source_authority_superseded', health_status: stringField(session, 'health_status') };
  const terminalState = stringField(session, 'terminal_state');
  if (terminalState && terminalState !== 'running') return { status: 'not_attachable', reason: `terminal_state_${terminalState}`, health_status: stringField(session, 'health_status') };
  const displayState = stringField(session, 'display_state');
  if (displayState === 'closed') return { status: 'not_attachable', reason: 'display_state_closed', health_status: stringField(session, 'health_status') };
  if (!options.healthEndpoint) return { status: 'not_attachable', reason: 'missing_health_endpoint', health_status: null };
  const healthStatus = await probeHealthEndpoint(options.healthEndpoint, options.timeoutMs);
  if (healthStatus !== 'healthy') return { status: 'not_attachable', reason: `health_${healthStatus}`, health_status: healthStatus };
  return { status: 'attachable', reason: null, health_status: healthStatus };
}

async function probeHealthEndpoint(endpoint: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return 'unhealthy';
    return 'healthy';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

function buildFailure(args: {
  sessionId: string;
  attach: { site_root?: string | null; site_root_source?: string | null; site_id?: string | null; session?: Record<string, unknown> | null };
  eventEndpoint: string;
  healthEndpoint: string | null;
  host: string;
  port: number;
  attachability: AttachabilityResult;
}) {
  return {
    schema: 'narada.agent_web_ui.attach_refusal.v1',
    status: 'refused',
    reason: args.attachability.reason ?? 'not_attachable',
    session_id: args.sessionId,
    site_root: args.attach.site_root ?? null,
    site_root_source: args.attach.site_root_source ?? null,
    site_id: args.attach.site_id ?? null,
    event_endpoint: args.eventEndpoint,
    health_endpoint: args.healthEndpoint,
    health_status: args.attachability.health_status,
    host: args.host,
    port: args.port,
    override: '--inspect-stale-session',
    authority_transition: authorityTransitionSnapshot(args.attach.session),
  };
}

function buildDiscoveryFailure(args: {
  agentId: string | null;
  siteRoot: string | null | undefined;
  siteId: string | null | undefined;
  waitMs: number;
  reason?: string;
  candidates?: AttachSessionCandidate[];
}) {
  return {
    schema: 'narada.agent_web_ui.attach_refusal.v1',
    status: 'refused',
    reason: args.reason ?? 'nars_session_not_found_for_agent',
    agent_id: args.agentId,
    site_root: args.siteRoot ?? null,
    site_id: args.siteId ?? null,
    wait_ms: args.waitMs,
    candidates: args.candidates ?? [],
    required_next_step: 'Start the NARS runtime host for this agent, or pass --session <id> for an existing healthy session.',
  };
}

function formatFailure(failure: ReturnType<typeof buildFailure>): string {
  return [
    `agent-web-ui attach refused: ${failure.reason}`,
    `  Session ${failure.session_id}`,
    `  Site    ${failure.site_id ?? failure.site_root ?? 'unknown'}`,
    `  Health  ${failure.health_status ?? 'not checked'}`,
    `  Authority ${formatAuthorityTransition(failure.authority_transition)}`,
    `  Events  ${failure.event_endpoint}`,
    `  Override ${failure.override}`,
  ].join('\n');
}

function formatDiscoveryFailure(failure: ReturnType<typeof buildDiscoveryFailure>): string {
  return [
    `agent-web-ui attach refused: ${failure.reason}`,
    `  Agent   ${failure.agent_id ?? 'unknown'}`,
    `  Site    ${failure.site_id ?? failure.site_root ?? 'unknown'}`,
    `  Wait    ${Math.ceil((failure.wait_ms ?? 0) / 1000)}s`,
    ...formatCandidateLines(failure.candidates),
    `  Next    ${failure.required_next_step}`,
  ].join('\n');
}

function formatCandidateLines(candidates: AttachSessionCandidate[]): string[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  return [
    '  Candidates:',
    '    session_id | identity | health | started_at | next_command',
    ...candidates.slice(0, 8).map((candidate) => {
      const sessionId = candidate.session_id ?? 'unknown';
      const identity = agentIdentityDisplay(candidate.agent_identity_ref, candidate.agent_id) ?? 'unknown';
      const health = candidate.health_status ?? candidate.display_state ?? candidate.terminal_state ?? 'unknown';
      const startedAt = candidate.started_at ?? 'unknown';
      const nextCommand = candidateNextCommand(candidate);
      return `    ${sessionId} | ${identity} | ${health} | ${startedAt} | ${nextCommand}`;
    }),
  ];
}

function candidateNextCommand(candidate: AttachSessionCandidate): string {
  if (!candidate.session_id) return 'agent-web-ui attach --session <unknown>';
  const command = [`agent-web-ui attach`, `--session ${candidate.session_id}`];
  const health = candidate.health_status ?? candidate.display_state ?? candidate.terminal_state ?? null;
  if (health && health !== 'healthy' && health !== 'active' && health !== 'starting_or_degraded') {
    command.push('--inspect-stale-session');
  }
  return command.join(' ');
}

export interface AgentWebUiAttachPlan {
  schema: 'narada.agent_web_ui.attach_plan.v1';
  status: 'planned' | 'started' | 'attached';
  session_id: string;
  site_root: string | null;
  site_root_source: string | null;
  site_id: string | null;
  event_endpoint: string;
  health_endpoint: string | null;
  host: string;
  port: number;
  url: string | null;
  ingress_mode: 'operator-router' | 'diagnostic';
  router_url: string | null;
  public_path: string | null;
  public_event_endpoint: string | null;
  public_health_endpoint: string | null;
  backend_url: string | null;
  route_ids: string[];
  command: string;
  authority_transition: AuthorityTransitionSnapshot;
  onboarding_mode: 'user-site' | null;
  operator_projection_open_request?: Record<string, unknown>;
}

export async function agentWebUiAttachCommand(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  deps: {
    startAgentWebUiServer?: (options: { host: string; port: number; eventEndpoint: string; healthEndpoint: string | null; sessionId: string; siteRoot: string | null; siteId: string | null; agentId: string | null; authorityTransition?: AuthorityTransitionSnapshot; onboarding?: boolean; cloudflareApiBaseUrl: string | null; publicBasePath?: string | null; publicEventEndpoint?: string | null; publicHealthEndpoint?: string | null; publicArtifactBasePath?: string | null; publicArtifactTransport?: string | null }) => Promise<{ url: string; server?: unknown }>;
    ensureOperatorRouter?: (options?: EnsureOperatorRouterOptions) => Promise<EnsureOperatorRouterResult>;
    registerOperatorRoute?: typeof registerOperatorRoute;
    openUrl?: (url: string) => Promise<void> | void;
    progress?: ProgressReporter;
  } = {},
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const progress = createProgressReporter(options, deps.progress);
  let resolvedSession: ResolvedAttachSession;
  try {
    resolvedSession = await resolveAttachSessionId(options, context, progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof AttachSessionDiscoveryError)) throw error;
    const failure = buildDiscoveryFailure({
      agentId: options.agent?.trim() || null,
      siteRoot: options.siteRoot,
      siteId: options.site,
      waitMs: Math.max(0, Math.trunc(options.waitForSessionMs ?? 0)),
      reason: error.reason,
      candidates: error.candidates,
    });
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatDiscoveryFailure(failure), options.format ?? 'auto'),
    };
  }
  const sessionId = resolvedSession.sessionId;
  if (!options.dryRun) progress(`agent-web-ui: resolving attach endpoints for ${sessionId}`);
  const resolved = await resolveAttachEndpointsWithWait({ sessionId, options, context, progress });
  if (resolved.exitCode !== ExitCode.SUCCESS) return resolved;
  const attach = resolved.result as {
    command?: string;
    site_root?: string | null;
    site_root_source?: string | null;
    site_id?: string | null;
    session?: Record<string, unknown> | null;
  };
  const eventEndpoint = stringField(attach.session, 'event_endpoint');
  if (!eventEndpoint) throw new Error(`agent_web_ui_attach_missing_event_endpoint: ${sessionId}`);
  const healthEndpoint = stringField(attach.session, 'health_endpoint');
  const host = options.host ?? '127.0.0.1';
  const port = Number.isFinite(options.port) ? Number(options.port) : DEFAULT_OPERATOR_ROUTER_PORT;
  const useOperatorRouter = port !== 0;
  const publicPath = operatorRouterSessionPath(sessionId);
  const predictedRouterUrl = useOperatorRouter ? operatorRouterUrl(host, port) : null;
  const predictedPublicUrl = predictedRouterUrl ? `${predictedRouterUrl}${publicPath}/` : null;
  const predictedPublicEventEndpoint = predictedRouterUrl ? operatorRouterWebsocketUrl(predictedRouterUrl, `${publicPath}/events`) : null;
  const predictedPublicHealthEndpoint = predictedRouterUrl ? `${predictedRouterUrl}${publicPath}/api/health` : null;
  const siteRoot = attach.site_root ?? options.siteRoot ?? null;
  const siteId = attach.site_id ?? stringField(attach.session, 'site_id') ?? options.site ?? null;
  const publicArtifactPath = useOperatorRouter && siteRoot ? `/artifacts/${encodeURIComponent(sessionId)}` : null;
  if (options.dryRun) {
    const plan = buildPlan({
      status: 'planned',
      sessionId,
      attach,
      eventEndpoint,
      healthEndpoint,
      host,
      port,
      url: predictedPublicUrl,
      session: attach.session,
      onboarding: options.onboarding === true,
      ingressMode: useOperatorRouter ? 'operator-router' : 'diagnostic',
      routerUrl: predictedRouterUrl,
      publicPath: useOperatorRouter ? publicPath : null,
      publicEventEndpoint: predictedPublicEventEndpoint,
      publicHealthEndpoint: predictedPublicHealthEndpoint,
      backendUrl: null,
      routeIds: [],
    });
    plan.operator_projection_open_request = await buildAgentWebUiOpenRequest({
      targetRef: null,
      mode: 'plan',
      suppressReason: options.open === false ? 'operator_policy:no_open' : null,
    });
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(plan, formatPlan(plan), options.format ?? 'auto'),
    };
  }
  const attachability = await waitForAttachability(attach.session, {
    healthEndpoint,
    healthTimeoutMs: options.healthTimeoutMs ?? 500,
    waitMs: options.waitForSessionMs ?? 0,
    progress,
  });
  if (!allowsStaleSessionInspection(options) && attachability.status !== 'attachable') {
    const failure = buildFailure({ sessionId, attach, eventEndpoint, healthEndpoint, host, port, attachability });
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatFailure(failure), options.format ?? 'auto'),
    };
  }
  progress(`agent-web-ui: starting local web UI for ${sessionId}${useOperatorRouter ? ' through Operator Router' : ''}`);
  const router = useOperatorRouter
    ? await (deps.ensureOperatorRouter ?? ensureOperatorRouter)({ host, port })
    : null;
  const publicEventEndpoint = router ? operatorRouterWebsocketUrl(router.url, `${publicPath}/events`) : null;
  const publicHealthEndpoint = router ? `${router.url}${publicPath}/api/health` : null;
  const sessionKey = operatorRouterSessionKey(sessionId);
  const httpRouteId = `agent-web-ui-${sessionKey}`;
  const websocketRouteId = `${httpRouteId}-events`;
  const artifactRouteId = `nars-artifact-${sessionKey}`;
  const requiredRouteIds = [httpRouteId, websocketRouteId, ...(publicArtifactPath ? [artifactRouteId] : [])];
  const expectedRouteIdentities = [
    {
      route_id: httpRouteId,
      route_class: 'agent-web-ui' as const,
      public_path: publicPath,
      route_mode: 'prefix' as const,
      site_id: siteId,
      session_id: sessionId,
    },
    {
      route_id: websocketRouteId,
      route_class: 'agent-web-ui' as const,
      public_path: `${publicPath}/events`,
      route_mode: 'exact' as const,
      site_id: siteId,
      session_id: sessionId,
    },
    ...(publicArtifactPath ? [{
      route_id: artifactRouteId,
      route_class: 'nars-artifact' as const,
      backend_kind: 'nars-artifact' as const,
      public_path: publicArtifactPath,
      route_mode: 'prefix' as const,
      site_id: siteId,
      session_id: sessionId,
    }] : []),
  ];
  if (router) {
    const existingRoutes = await readOperatorRouterRoutes({ url: router.url });
    const routePosture = inspectOperatorRouterRouteSet(existingRoutes.routes, requiredRouteIds, expectedRouteIdentities);
    if (routePosture.posture === 'healthy') {
      const plan = buildPlan({
        status: 'attached',
        sessionId,
        attach,
        eventEndpoint,
        healthEndpoint,
        host,
        port,
        url: `${router.url}${publicPath}/`,
        session: attach.session,
        onboarding: options.onboarding === true,
        ingressMode: 'operator-router',
        routerUrl: router.url,
        publicPath,
        publicEventEndpoint,
        publicHealthEndpoint,
        backendUrl: null,
        routeIds: requiredRouteIds,
      });
      const shouldOpen = options.open !== false;
      if (shouldOpen && plan.url) {
        progress(`agent-web-ui: opening browser ${plan.url}`);
        plan.operator_projection_open_request = await buildAgentWebUiOpenRequest({ targetRef: plan.url, mode: 'execute', openUrl: deps.openUrl });
      } else if (plan.url) {
        plan.operator_projection_open_request = await buildAgentWebUiOpenRequest({ targetRef: plan.url, mode: 'execute', suppressReason: 'operator_policy:no_open' });
      }
      const renderedResult = formattedResult(plan, formatPlan(plan), options.format ?? 'auto');
      return { exitCode: ExitCode.SUCCESS, result: renderedResult };
    }
    if (routePosture.posture === 'identity_conflict') {
      throw new Error(`operator_router_projection_identity_conflict:${routePosture.identity_mismatch_route_ids.join(',')}`);
    }
    if (routePosture.posture === 'incomplete_live') {
      throw new Error(`operator_router_projection_incomplete:${routePosture.healthy_route_ids.join(',')}`);
    }
  }
  const startAgentWebUiServer = deps.startAgentWebUiServer ?? (await import('@narada2/agent-web-ui/server')).startAgentWebUiServer;
  const started = await startAgentWebUiServer({
    host,
    port: router ? 0 : port,
    eventEndpoint,
    healthEndpoint,
    sessionId,
    siteRoot,
    siteId,
    agentId: options.agent?.trim() || stringField(attach.session, 'agent_id'),
    authorityTransition: authorityTransitionSnapshot(attach.session),
    onboarding: options.onboarding === true,
    publicBasePath: router ? publicPath : null,
    publicEventEndpoint,
    publicHealthEndpoint: router ? `${publicPath}/api/health` : null,
    publicArtifactBasePath: publicArtifactPath,
    publicArtifactTransport: publicArtifactPath ? 'operator-router' : null,
    cloudflareApiBaseUrl: options.cloudflareApiBaseUrl?.trim()
      || process.env.NARADA_CLOUDFLARE_NARS_PROJECTION_URL
      || process.env.CLOUDFLARE_NARS_PROJECTION_URL
      || null,
  });
  const routeIds: string[] = [];
  let routeSet: Awaited<ReturnType<typeof registerOperatorRouteSet>> | null = null;
  if (router) {
    const admin = operatorRouterAdmin(router);
    const ownerId = `agent-web-ui:${sessionKey}:${process.pid}`;
    const instanceNonce = randomUUID().replace(/-/g, '');
    const reconstruction = { kind: 'nars-session' as const, site_root: siteRoot, site_id: siteId, session_id: sessionId };
    const startedBackendUrl = started.url.replace(/\/+$/, '');
    const startedHealthUrl = new URL('/api/health', started.url).toString();
    const routeInputs = [
      {
        route_id: httpRouteId,
        route_class: 'agent-web-ui' as const,
        public_path: publicPath,
        route_mode: 'prefix' as const,
        target_url: startedBackendUrl,
        health_url: startedHealthUrl,
        owner_id: ownerId,
        site_id: siteId,
        session_id: sessionId,
        process_evidence: { instance_nonce: instanceNonce, pid: process.pid, started_at: new Date().toISOString() },
        protocols: ['http'] as const,
        methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
        lease_ms: 60 * 60 * 1000,
        reconstruction,
      },
      {
        route_id: websocketRouteId,
        route_class: 'agent-web-ui' as const,
        public_path: `${publicPath}/events`,
        route_mode: 'exact' as const,
        target_url: startedBackendUrl,
        websocket_target_url: eventEndpoint,
        health_url: startedHealthUrl,
        owner_id: ownerId,
        site_id: siteId,
        session_id: sessionId,
        process_evidence: { instance_nonce: instanceNonce, pid: process.pid, started_at: new Date().toISOString() },
        protocols: ['websocket'] as const,
        methods: ['GET'],
        lease_ms: 60 * 60 * 1000,
        reconstruction,
      },
      ...(publicArtifactPath ? [{
        route_id: artifactRouteId,
        route_class: 'nars-artifact' as const,
        backend_kind: 'nars-artifact' as const,
        public_path: publicArtifactPath,
        route_mode: 'prefix' as const,
        target_url: null,
        health_url: healthEndpoint,
        owner_id: ownerId,
        site_id: siteId,
        session_id: sessionId,
        process_evidence: { instance_nonce: instanceNonce, pid: process.pid, started_at: new Date().toISOString() },
        protocols: ['http'] as const,
        methods: ['GET', 'HEAD'],
        max_body_bytes: 0,
        lease_ms: 60 * 60 * 1000,
        reconstruction,
      }] : []),
    ];
    try {
      const reconstructed = await reconstructOperatorRouteSet({
        admin,
        routes: routeInputs,
        renew_interval_ms: 30_000,
        register_fn: deps.registerOperatorRoute,
      });
      routeSet = reconstructed.route_set;
      routeIds.push(...routeSet.route_ids);
    } catch (error) {
      await closeStartedServer(started.server);
      throw error;
    }
  }
  const plan = buildPlan({
    status: 'started',
    sessionId,
    attach,
    eventEndpoint,
    healthEndpoint,
    host,
    port,
    url: router ? `${router.url}${publicPath}/` : started.url,
    session: attach.session,
    onboarding: options.onboarding === true,
    ingressMode: router ? 'operator-router' : 'diagnostic',
    routerUrl: router?.url ?? null,
    publicPath: router ? publicPath : null,
    publicEventEndpoint,
    backendUrl: started.url,
    routeIds,
  });
  const shouldOpen = options.open !== false;
  const browserUrl = plan.url;
  let operatorProjectionOpenRequest: Record<string, unknown> | undefined;
  if (shouldOpen && browserUrl) {
    progress(`agent-web-ui: opening browser ${browserUrl}`);
    operatorProjectionOpenRequest = await buildAgentWebUiOpenRequest({
      targetRef: browserUrl,
      mode: 'execute',
      openUrl: deps.openUrl,
    });
    if (operatorProjectionOpenRequest.status !== 'opened') {
      progress(`agent-web-ui: browser open failed; use ${browserUrl}`);
    }
  } else if (browserUrl) {
    operatorProjectionOpenRequest = await buildAgentWebUiOpenRequest({
      targetRef: browserUrl,
      mode: 'execute',
      suppressReason: 'operator_policy:no_open',
    });
  }
  plan.operator_projection_open_request = operatorProjectionOpenRequest;
  let cleanedUp = false;
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    await routeSet?.stop();
    await closeStartedServer(started.server);
  };
  const renderedResult = formattedResult(plan, formatPlan(plan), options.format ?? 'auto');
  if (renderedResult && typeof renderedResult === 'object') {
    Object.defineProperty(renderedResult, '_cleanup', { value: cleanup, enumerable: false });
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: renderedResult,
  };
}

async function resolveAttachEndpointsWithWait(args: {
  sessionId: string;
  options: AgentWebUiAttachOptions;
  context: CommandContext;
  progress: ProgressReporter;
}): Promise<{ exitCode: ExitCode; result: unknown }> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Math.trunc(args.options.waitForSessionMs ?? 0));
  let nextProgressAt = startedAt + 5000;
  let last = await resolveAttachEndpointsOnce(args.sessionId, args.options, args.context);
  while (last.exitCode !== ExitCode.SUCCESS && timeoutMs > 0 && Date.now() - startedAt < timeoutMs) {
    if (!args.options.dryRun && Date.now() >= nextProgressAt) {
      args.progress(`agent-web-ui: still waiting for NARS attach endpoints for ${args.sessionId}`);
      nextProgressAt = Date.now() + 5000;
    }
    await delay(1000);
    last = await resolveAttachEndpointsOnce(args.sessionId, args.options, args.context);
  }
  return last;
}

async function resolveAttachEndpointsOnce(sessionId: string, options: AgentWebUiAttachOptions, context: CommandContext): Promise<{ exitCode: ExitCode; result: unknown }> {
  return narsAttachCommandCommand({
    session: sessionId,
    site: options.site,
    siteRoot: options.siteRoot,
    surface: 'agent-web-ui',
    format: 'json',
    launchRegistryPath: options.launchRegistryPath,
  }, context);
}

async function buildAgentWebUiOpenRequest(args: {
  targetRef: string | null;
  mode: 'plan' | 'execute';
  suppressReason?: string | null;
  openUrl?: (url: string) => Promise<void> | void;
}): Promise<Record<string, unknown>> {
  const outcome = await executeOperatorProjectionOpenRequest({
    projection_kind: 'browser_url',
    target_ref: args.targetRef,
    purpose: 'agent_web_ui_attach',
    caller: { package: '@narada2/cli', command: 'agent-web-ui attach', module: 'commands/agent-web-ui' },
    mode: args.mode,
    policy: {
      allow_visible_host_effect: args.suppressReason ? false : true,
      suppress_reason: args.suppressReason ?? null,
    },
  }, args.openUrl ? { openUrl: args.openUrl, env: {} } : undefined) as unknown as Record<string, unknown>;
  if (args.targetRef === null) {
    outcome.target_ref_resolution = 'agent-web-ui attach resolves local URL after server start';
  }
  return outcome;
}

async function waitForAttachability(
  session: Record<string, unknown> | null | undefined,
  options: { healthEndpoint: string | null; healthTimeoutMs: number; waitMs: number; progress: ProgressReporter },
): Promise<AttachabilityResult> {
  const startedAt = Date.now();
  const waitMs = Math.max(0, Math.trunc(options.waitMs));
  let last = await assessAttachability(session, { healthEndpoint: options.healthEndpoint, timeoutMs: options.healthTimeoutMs });
  let nextProgressAt = startedAt + 5000;
  while (last.status !== 'attachable' && last.reason === 'health_unavailable' && Date.now() - startedAt < waitMs) {
    if (Date.now() >= nextProgressAt) {
      options.progress('agent-web-ui: waiting for selected NARS session health endpoint');
      nextProgressAt = Date.now() + 5000;
    }
    await delay(1000);
    last = await assessAttachability(session, { healthEndpoint: options.healthEndpoint, timeoutMs: options.healthTimeoutMs });
  }
  return last;
}

function createProgressReporter(options: AgentWebUiAttachOptions, injected?: ProgressReporter): ProgressReporter {
  if (options.dryRun || options.format === 'json') return () => {};
  return injected ?? ((line: string) => process.stderr.write(`${line}\n`));
}

function buildPlan(args: {
  status: 'planned' | 'started' | 'attached';
  sessionId: string;
  attach: { command?: string; site_root?: string | null; site_root_source?: string | null; site_id?: string | null };
  eventEndpoint: string;
  healthEndpoint: string | null;
  host: string;
  port: number;
  url: string | null;
  session?: Record<string, unknown> | null;
  onboarding?: boolean;
  ingressMode: 'operator-router' | 'diagnostic';
  routerUrl: string | null;
  publicPath: string | null;
  publicEventEndpoint: string | null;
  publicHealthEndpoint: string | null;
  backendUrl: string | null;
  routeIds: string[];
}): AgentWebUiAttachPlan {
  return {
    schema: 'narada.agent_web_ui.attach_plan.v1',
    status: args.status,
    session_id: args.sessionId,
    site_root: args.attach.site_root ?? null,
    site_root_source: args.attach.site_root_source ?? null,
    site_id: args.attach.site_id ?? null,
    event_endpoint: args.eventEndpoint,
    health_endpoint: args.healthEndpoint,
    host: args.host,
    port: args.port,
    url: args.url,
    ingress_mode: args.ingressMode,
    router_url: args.routerUrl,
    public_path: args.publicPath,
    public_event_endpoint: args.publicEventEndpoint,
    public_health_endpoint: args.publicHealthEndpoint,
    backend_url: args.backendUrl,
    route_ids: [...args.routeIds],
    command: args.attach.command ?? `narada-agent-web-ui --event-endpoint ${args.eventEndpoint}${args.healthEndpoint ? ` --health-endpoint ${args.healthEndpoint}` : ''}`,
    authority_transition: authorityTransitionSnapshot(args.session),
    onboarding_mode: args.onboarding ? 'user-site' : null,
  };
}

function formatPlan(plan: AgentWebUiAttachPlan): string {
  if (plan.status !== 'planned') {
    const lines = [
      `agent-web-ui: ${plan.url}`,
      `  Session ${plan.session_id}`,
      `  Site    ${plan.site_id ?? plan.site_root ?? 'unknown'}`,
      `  Events  ${plan.public_event_endpoint ?? plan.event_endpoint}`,
      `  Health  ${plan.public_health_endpoint ?? (plan.health_endpoint ? `${plan.health_endpoint} via local /api/health` : 'not configured')}`,
      `  Ingress ${plan.ingress_mode}${plan.router_url ? ` ${plan.router_url}` : ''}`,
      `  Authority ${formatAuthorityTransition(plan.authority_transition)}`,
      '  Input   session.submit/session.cancel/session.close; Cloudflare adapters translate as needed',
    ];
    if (plan.onboarding_mode) lines.splice(1, 0, '  Mode    User Site onboarding');
    return lines.join('\n');
  }
  return [
    'agent-web-ui attach plan',
    `  Session ${plan.session_id}`,
    `  Site    ${plan.site_id ?? plan.site_root ?? 'unknown'}`,
    `  Authority ${formatAuthorityTransition(plan.authority_transition)}`,
    `  Command ${plan.command}`,
  ].join('\n');
}

function authorityTransitionSnapshot(session: Record<string, unknown> | null | undefined): AuthorityTransitionSnapshot {
  const record = objectField(session, 'record');
  const sourceWriteAdmission = stringField(session, 'source_write_admission') ?? stringField(record, 'source_write_admission');
  const transitionState = stringField(session, 'authority_transition_state') ?? stringField(record, 'authority_transition_state');
  const supersededBySessionId = stringField(session, 'superseded_by_session_id') ?? stringField(record, 'superseded_by_session_id');
  const authorityTransition = objectField(record, 'authority_transition');
  const targetLocator = objectField(record, 'target_authority_locator') ?? objectField(authorityTransition, 'target_authority_locator');
  const staleSource = sourceWriteAdmission === 'sealed' || sourceWriteAdmission === 'retired' || transitionState === 'target_active' || Boolean(supersededBySessionId);
  return {
    authority_runtime_host: stringField(session, 'authority_runtime_host') ?? stringField(record, 'authority_runtime_host'),
    authority_epoch: integerField(session, 'authority_epoch') ?? integerField(record, 'authority_epoch'),
    authority_runtime_id: stringField(session, 'authority_runtime_id') ?? stringField(record, 'authority_runtime_id'),
    authority_transition_state: transitionState,
    source_write_admission: sourceWriteAdmission,
    superseded_by_session_id: supersededBySessionId,
    authority_locator_ref: stringField(session, 'authority_locator_ref') ?? stringField(record, 'authority_locator_ref'),
    target_authority_locator: targetLocator,
    stale_source: staleSource,
    input_policy: staleSource ? 'disabled_source_sealed' : 'enabled',
    reattach: staleSource ? {
      target_session_id: supersededBySessionId,
      target_locator_ref: stringField(session, 'authority_locator_ref') ?? stringField(record, 'authority_locator_ref'),
      target_authority_locator: targetLocator,
    } : null,
  };
}

function formatAuthorityTransition(authority: AuthorityTransitionSnapshot): string {
  const host = authority.authority_runtime_host ?? 'unknown';
  const epoch = authority.authority_epoch ? ` e${authority.authority_epoch}` : '';
  const transition = authority.authority_transition_state ? ` ${authority.authority_transition_state}` : '';
  const target = authority.reattach?.target_session_id ? ` -> ${authority.reattach.target_session_id}` : '';
  return `${host}${epoch}${transition}${target}`;
}

function integerField(record: Record<string, unknown> | null | undefined, field: string): number | null {
  const value = record?.[field];
  return Number.isInteger(value) ? value as number : null;
}

function objectField(record: Record<string, unknown> | null | undefined, field: string): Record<string, unknown> | null {
  const value = record?.[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null | undefined, field: string): string | null {
  const value = record?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
