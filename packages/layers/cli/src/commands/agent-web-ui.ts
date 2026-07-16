import type { CommandContext } from '../lib/command-wrapper.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { executeOperatorProjectionOpenRequest } from '@narada2/process-launch-posture';
import { agentIdentityDisplay } from '@narada2/agent-identity';
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
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { asJsonRecord, objectField, stringField, type JsonRecord } from '../lib/launcher-contracts.js';
import {
  assessAttachability,
  AttachSessionDiscoveryError,
  authorityTransitionSnapshot,
  delay,
  isTransientAttachDiscoveryDetail,
  diagnoseAttachSession,
  resolveAttachSessionId,
} from './agent-web-ui-session.js';
import type {
  AgentWebUiAttachDependencies,
  AgentWebUiAttachOptions,
  AgentWebUiAttachPlan,
  AttachabilityResult,
  AttachSessionCandidate,
  AuthorityTransitionSnapshot,
  ProgressReporter,
  ResolvedAttachSession,
} from './agent-web-ui-types.js';
import {
  createAgentWebUiAttachmentLifecycle,
  transitionAgentWebUiAttachment,
  type AgentWebUiAttachmentLifecycle,
} from './agent-web-ui-attachment-state.js';
import { narsAttachCommandCommand } from './nars.js';
import { ensureLaunchArtifact, naradaProperRoot } from '../lib/launch-artifact.js';

function allowsStaleSessionInspection(options: AgentWebUiAttachOptions): boolean {
  return options.inspectStaleSession === true || options.allowStaleSession === true;
}

async function writeAgentWebUiReadiness(path: string | undefined, plan: AgentWebUiAttachPlan): Promise<void> {
  if (!path) return;
  if (!plan.url) throw new Error('agent_web_ui_readiness_url_missing');
  const readiness = {
    schema: 'narada.agent_web_ui.readiness.v1',
    status: 'ready',
    session_id: plan.session_id,
    site_id: plan.site_id,
    url: plan.url,
    event_endpoint: plan.public_event_endpoint ?? plan.event_endpoint,
    health_endpoint: plan.public_health_endpoint ?? plan.health_endpoint,
    written_at: new Date().toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
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


function buildFailure(args: {
  sessionId: string;
  attach: { site_root?: string | null; site_root_source?: string | null; site_id?: string | null; session?: JsonRecord | null };
  eventEndpoint: string;
  healthEndpoint: string | null;
  host: string;
  port: number;
  attachability: AttachabilityResult;
  attachmentLifecycle: AgentWebUiAttachmentLifecycle;
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
    attachment_lifecycle: args.attachmentLifecycle,
  };
}

function buildDiscoveryFailure(args: {
  agentId: string | null;
  siteRoot: string | null | undefined;
  siteId: string | null | undefined;
  waitMs: number;
  reason?: string;
  candidates?: AttachSessionCandidate[];
  detail?: string | null;
  retryable?: boolean;
  attachmentLifecycle: AgentWebUiAttachmentLifecycle;
}) {
  const reason = args.reason ?? 'nars_session_not_found_for_agent';
  return {
    schema: 'narada.agent_web_ui.attach_refusal.v1',
    status: 'refused',
    reason,
    agent_id: args.agentId,
    site_root: args.siteRoot ?? null,
    site_id: args.siteId ?? null,
    wait_ms: args.waitMs,
    candidates: args.candidates ?? [],
    phase: 'session_discovery',
    detail: args.detail ?? null,
    retryable: args.retryable ?? false,
    attachment_lifecycle: args.attachmentLifecycle,
    required_next_step: reason === 'launch_binding_failed'
      ? 'Inspect the launch binding/result diagnostic, fix the reported preflight failure, and start a fresh launch.'
      : reason === 'session_discovery_failed'
        ? 'Retry while the NARS runtime is starting; if it persists, inspect the session-index/runtime error detail.'
        : 'Start the NARS runtime host for this agent, or pass --session <id> for an existing healthy session.',
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

function withAttachmentLifecycle(result: unknown, attachmentLifecycle: AgentWebUiAttachmentLifecycle): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  return { ...(result as Record<string, unknown>), attachment_lifecycle: attachmentLifecycle };
}

function formatDiscoveryFailure(failure: ReturnType<typeof buildDiscoveryFailure>): string {
  const lines = [
    `agent-web-ui attach refused: ${failure.reason}`,
    `  Agent   ${failure.agent_id ?? 'unknown'}`,
    `  Site    ${failure.site_id ?? failure.site_root ?? 'unknown'}`,
    `  Phase   ${failure.phase}`,
    `  Wait    ${Math.ceil((failure.wait_ms ?? 0) / 1000)}s`,
    ...formatCandidateLines(failure.candidates),
    `  Next    ${failure.required_next_step}`,
  ];
  if (failure.detail) lines.splice(4, 0, `  Detail  ${failure.detail}`);
  return lines.join('\n');
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


export async function agentWebUiAttachCommand(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  deps: AgentWebUiAttachDependencies = {},
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (options.diagnose) return diagnoseAttachSession(options, context, { discoverSessions: deps.discoverSessions });
  const progress = createProgressReporter(options, deps.progress);
  let attachmentLifecycle = createAgentWebUiAttachmentLifecycle();
  const transitionAttachment = (nextState: Parameters<typeof transitionAgentWebUiAttachment>[1]): void => {
    attachmentLifecycle = transitionAgentWebUiAttachment(attachmentLifecycle, nextState);
  };
  transitionAttachment('discovering');
  if (!options.session?.trim() && (options.waitForSessionMs ?? 0) > 0) transitionAttachment('waiting_for_session');
  let resolvedSession: ResolvedAttachSession;
  try {
    resolvedSession = await resolveAttachSessionId(
      options,
      context,
      progress,
      { discoverSessions: deps.discoverSessions },
    );
  } catch (error) {
    if (!(error instanceof AttachSessionDiscoveryError)) throw error;
    transitionAttachment(error.retryable && attachmentLifecycle.state === 'waiting_for_session' ? 'expired' : 'refused');
    const failure = buildDiscoveryFailure({
      agentId: options.agent?.trim() || null,
      siteRoot: options.siteRoot,
      siteId: options.site,
      waitMs: Math.max(0, Math.trunc(options.waitForSessionMs ?? 0)),
      reason: error.reason,
      candidates: error.candidates,
      detail: error.detail,
      retryable: error.retryable,
      attachmentLifecycle,
    });
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatDiscoveryFailure(failure), options.format ?? 'auto'),
    };
  }
  const sessionId = resolvedSession.sessionId;
  transitionAttachment('resolving_endpoints');
  if (!options.dryRun) progress(`agent-web-ui: resolving attach endpoints for ${sessionId}`);
  const resolved = await resolveAttachEndpointsWithWait({
    sessionId,
    options,
    context,
    progress,
    resolveAttachEndpoints: deps.resolveAttachEndpoints,
  });
  if (resolved.exitCode !== ExitCode.SUCCESS) {
    transitionAttachment(resolved.retryable ? 'expired' : 'refused');
    return {
      ...resolved,
      result: withAttachmentLifecycle(resolved.result, attachmentLifecycle),
    };
  }
  const attach = resolved.result as {
    command?: string;
    site_root?: string | null;
    site_root_source?: string | null;
    site_id?: string | null;
    session?: JsonRecord | null;
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
      attachmentLifecycle,
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
  transitionAttachment('probing_health');
  const attachability = await waitForAttachability(attach.session, {
    healthEndpoint,
    healthTimeoutMs: options.healthTimeoutMs ?? 500,
    waitMs: options.waitForSessionMs ?? 0,
    progress,
  });
  if (!allowsStaleSessionInspection(options) && attachability.status !== 'attachable') {
    transitionAttachment(attachability.reason === 'health_unavailable' ? 'expired' : 'refused');
    const failure = buildFailure({ sessionId, attach, eventEndpoint, healthEndpoint, host, port, attachability, attachmentLifecycle });
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatFailure(failure), options.format ?? 'auto'),
    };
  }
  transitionAttachment('registering_projection');
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
      transitionAttachment('attached');
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
        attachmentLifecycle,
      });
      await writeAgentWebUiReadiness(options.readyFile, plan);
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
  const agentWebUiArtifact = deps.startAgentWebUiServer
    ? null
    : ensureLaunchArtifact(naradaProperRoot(), 'agent-web-ui');
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
    artifactRoot: agentWebUiArtifact?.artifact_root ?? null,
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
  transitionAttachment('attached');
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
    publicHealthEndpoint,
    backendUrl: started.url,
    routeIds,
    attachmentLifecycle,
  });
  try {
    await writeAgentWebUiReadiness(options.readyFile, plan);
  } catch (error) {
    await routeSet?.stop();
    await closeStartedServer(started.server);
    throw error;
  }
  const shouldOpen = options.open !== false;
  const browserUrl = plan.url;
  let operatorProjectionOpenRequest: JsonRecord | undefined;
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
    if (attachmentLifecycle.state === 'attached') {
      attachmentLifecycle = transitionAgentWebUiAttachment(attachmentLifecycle, 'detached');
      plan.attachment_lifecycle = attachmentLifecycle;
    }
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

type AttachEndpointAttempt = {
  exitCode: ExitCode;
  result: unknown;
  retryable: boolean;
};

async function resolveAttachEndpointsWithWait(args: {
  sessionId: string;
  options: AgentWebUiAttachOptions;
  context: CommandContext;
  progress: ProgressReporter;
  resolveAttachEndpoints?: AgentWebUiAttachDependencies['resolveAttachEndpoints'];
}): Promise<AttachEndpointAttempt> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Math.trunc(args.options.waitForSessionMs ?? 0));
  let nextProgressAt = startedAt + 5000;
  let last = await resolveAttachEndpointsOnce(
    args.sessionId,
    args.options,
    args.context,
    args.resolveAttachEndpoints,
  );
  while (last.exitCode !== ExitCode.SUCCESS
    && last.retryable
    && timeoutMs > 0
    && Date.now() - startedAt < timeoutMs) {
    if (!args.options.dryRun && Date.now() >= nextProgressAt) {
      args.progress(`agent-web-ui: still waiting for NARS attach endpoints for ${args.sessionId}`);
      nextProgressAt = Date.now() + 5000;
    }
    await delay(1000);
    last = await resolveAttachEndpointsOnce(
      args.sessionId,
      args.options,
      args.context,
      args.resolveAttachEndpoints,
    );
  }
  return last;
}

async function resolveAttachEndpointsOnce(
  sessionId: string,
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  resolveAttachEndpoints: AgentWebUiAttachDependencies['resolveAttachEndpoints'] = narsAttachCommandCommand,
): Promise<AttachEndpointAttempt> {
  const commandOptions = {
    session: sessionId,
    site: options.site,
    siteRoot: options.siteRoot,
    surface: 'agent-web-ui' as const,
    format: 'json' as const,
    launchRegistryPath: options.launchRegistryPath,
  };
  try {
    const result = await resolveAttachEndpoints(commandOptions, context);
    const body = asJsonRecord(result.result);
    const reason = stringField(body, 'reason');
    const detail = stringField(body, 'error')
      ?? stringField(body, '_formatted')
      ?? reason;
    return {
      ...result,
      retryable: result.exitCode !== ExitCode.SUCCESS
        && (reason === 'session_not_found' || (detail ? isTransientAttachDiscoveryDetail(detail) : false)),
    };
  } catch (error) {
    const detail = compactAttachEndpointError(error);
    const retryable = isTransientAttachDiscoveryDetail(detail);
    const failure = {
      schema: 'narada.agent_web_ui.attach_refusal.v1',
      status: 'refused',
      reason: 'session_discovery_failed',
      phase: 'attach_endpoint_resolution',
      session_id: sessionId,
      site_root: options.siteRoot ?? null,
      site_id: options.site ?? null,
      wait_ms: Math.max(0, Math.trunc(options.waitForSessionMs ?? 0)),
      detail,
      retryable,
      required_next_step: retryable
        ? 'Retry while the NARS runtime is starting; if it persists, inspect NARS session discovery.'
        : 'Inspect the NARS session index and runtime error detail before retrying.',
    };
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatEndpointFailure(failure), options.format ?? 'auto'),
      retryable,
    };
  }
}

function compactAttachEndpointError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'unknown attach endpoint error';
}

function formatEndpointFailure(failure: {
  reason: string;
  phase: string;
  session_id: string;
  detail: string;
  retryable: boolean;
  required_next_step: string;
}): string {
  return [
    `agent-web-ui attach refused: ${failure.reason}`,
    `  Session ${failure.session_id}`,
    `  Phase   ${failure.phase}`,
    `  Detail  ${failure.detail}`,
    `  Retry   ${failure.retryable ? 'yes' : 'no'}`,
    `  Next    ${failure.required_next_step}`,
  ].join('\n');
}

async function buildAgentWebUiOpenRequest(args: {
  targetRef: string | null;
  mode: 'plan' | 'execute';
  suppressReason?: string | null;
  openUrl?: (url: string) => Promise<void> | void;
}): Promise<JsonRecord> {
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
  }, args.openUrl ? { openUrl: args.openUrl, env: {} } : undefined) as unknown as JsonRecord;
  if (args.targetRef === null) {
    outcome.target_ref_resolution = 'agent-web-ui attach resolves local URL after server start';
  }
  return outcome;
}

async function waitForAttachability(
  session: JsonRecord | null | undefined,
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
  session?: JsonRecord | null;
  onboarding?: boolean;
  ingressMode: 'operator-router' | 'diagnostic';
  routerUrl: string | null;
  publicPath: string | null;
  publicEventEndpoint: string | null;
  publicHealthEndpoint: string | null;
  backendUrl: string | null;
  routeIds: string[];
  attachmentLifecycle: AgentWebUiAttachmentLifecycle;
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
    attachment_lifecycle: args.attachmentLifecycle,
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


function formatAuthorityTransition(authority: AuthorityTransitionSnapshot): string {
  const host = authority.authority_runtime_host ?? 'unknown';
  const epoch = authority.authority_epoch ? ` e${authority.authority_epoch}` : '';
  const transition = authority.authority_transition_state ? ` ${authority.authority_transition_state}` : '';
  const target = authority.reattach?.target_session_id ? ` -> ${authority.reattach.target_session_id}` : '';
  return `${host}${epoch}${transition}${target}`;
}

