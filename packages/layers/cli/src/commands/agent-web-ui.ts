import type { CommandContext } from '../lib/command-wrapper.js';
import { openBrowserUrl } from '@narada2/process-launch-posture';
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
  healthTimeoutMs?: number;
  waitForSessionMs?: number;
  format?: CliFormat;
  launchRegistryPath?: string;
  open?: boolean;
}

interface ResolvedAttachSession {
  sessionId: string;
  reason: string | null;
}

type ProgressReporter = (line: string) => void;

async function resolveAttachSessionId(options: AgentWebUiAttachOptions, context: CommandContext, progress: ProgressReporter): Promise<ResolvedAttachSession> {
  if (options.session) return { sessionId: options.session, reason: null };
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
      if (!lastError.message.startsWith('nars_session_not_found_for_agent:') || Date.now() - startedAt >= timeoutMs) break;
      if (!options.dryRun && Date.now() >= nextProgressAt) {
        progress(`agent-web-ui: still waiting for ${agentId} NARS session health`);
        nextProgressAt = Date.now() + 5000;
      }
      await delay(1000);
    }
  } while (Date.now() - startedAt < timeoutMs);
  throw lastError ?? new Error(`nars_session_not_found_for_agent: ${agentId}`);
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
  if (sessionsResult.exitCode !== ExitCode.SUCCESS) return { sessionId: '', reason: 'session_discovery_failed' };
  const body = sessionsResult.result as { sessions?: Array<Record<string, unknown>> };
  const matches = (body.sessions ?? []).filter((session) => {
    const candidateAgent = stringField(session, 'agent_id');
    const sessionId = stringField(session, 'session_id') ?? stringField(session, 'carrier_session_id');
    const displayState = stringField(session, 'display_state');
    const terminalState = stringField(session, 'terminal_state');
    return candidateAgent === agentId
      && Boolean(sessionId)
      && isDiscoverableAttachSessionState(displayState, { requireActive: options.dryRun !== true })
      && (!terminalState || terminalState === 'running');
  });
  if (matches.length === 0) throw new Error(`nars_session_not_found_for_agent: ${agentId}`);
  const selected = matches.sort(compareSessionsNewestFirst)[0];
  const sessionId = stringField(selected, 'session_id') ?? stringField(selected, 'carrier_session_id');
  if (!sessionId) throw new Error(`nars_session_not_found_for_agent: ${agentId}`);
  return { sessionId, reason: 'discovered_by_agent' };
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

async function assessAttachability(
  session: Record<string, unknown> | null | undefined,
  options: { healthEndpoint: string | null; timeoutMs: number },
): Promise<AttachabilityResult> {
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
  attach: { site_root?: string | null; site_root_source?: string | null; site_id?: string | null };
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
    override: '--allow-stale-session',
  };
}

function buildDiscoveryFailure(args: {
  agentId: string | null;
  siteRoot: string | null | undefined;
  siteId: string | null | undefined;
  waitMs: number;
}) {
  return {
    schema: 'narada.agent_web_ui.attach_refusal.v1',
    status: 'refused',
    reason: 'nars_session_not_found_for_agent',
    agent_id: args.agentId,
    site_root: args.siteRoot ?? null,
    site_id: args.siteId ?? null,
    wait_ms: args.waitMs,
    required_next_step: 'Start the NARS runtime host for this agent, or pass --session <id> for an existing healthy session.',
  };
}

function formatFailure(failure: ReturnType<typeof buildFailure>): string {
  return [
    `agent-web-ui attach refused: ${failure.reason}`,
    `  Session ${failure.session_id}`,
    `  Site    ${failure.site_id ?? failure.site_root ?? 'unknown'}`,
    `  Health  ${failure.health_status ?? 'not checked'}`,
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
    `  Next    ${failure.required_next_step}`,
  ].join('\n');
}

export interface AgentWebUiAttachPlan {
  schema: 'narada.agent_web_ui.attach_plan.v1';
  status: 'planned' | 'started';
  session_id: string;
  site_root: string | null;
  site_root_source: string | null;
  site_id: string | null;
  event_endpoint: string;
  health_endpoint: string | null;
  host: string;
  port: number;
  url: string | null;
  command: string;
}

export async function agentWebUiAttachCommand(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  deps: {
    startAgentWebUiServer?: (options: { host: string; port: number; eventEndpoint: string; healthEndpoint: string | null }) => Promise<{ url: string; server?: { close?: () => void } }>;
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
    if (!message.startsWith('nars_session_not_found_for_agent:')) throw error;
    const failure = buildDiscoveryFailure({
      agentId: options.agent?.trim() || null,
      siteRoot: options.siteRoot,
      siteId: options.site,
      waitMs: Math.max(0, Math.trunc(options.waitForSessionMs ?? 0)),
    });
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatDiscoveryFailure(failure), options.format ?? 'auto'),
    };
  }
  const sessionId = resolvedSession.sessionId;
  if (!options.dryRun) progress(`agent-web-ui: resolving attach endpoints for ${sessionId}`);
  const resolved = await narsAttachCommandCommand({
    session: sessionId,
    site: options.site,
    siteRoot: options.siteRoot,
    surface: 'agent-web-ui',
    format: 'json',
    launchRegistryPath: options.launchRegistryPath,
  }, context);
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
  const port = Number.isFinite(options.port) ? Number(options.port) : 0;
  if (options.dryRun) {
    const plan = buildPlan({
      status: 'planned',
      sessionId,
      attach,
      eventEndpoint,
      healthEndpoint,
      host,
      port,
      url: null,
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
  if (!options.allowStaleSession && attachability.status !== 'attachable') {
    const failure = buildFailure({ sessionId, attach, eventEndpoint, healthEndpoint, host, port, attachability });
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: formattedResult(failure, formatFailure(failure), options.format ?? 'auto'),
    };
  }
  progress(`agent-web-ui: starting local web UI for ${sessionId}`);
  const startAgentWebUiServer = deps.startAgentWebUiServer ?? (await import('@narada2/agent-web-ui/server')).startAgentWebUiServer;
  const started = await startAgentWebUiServer({ host, port, eventEndpoint, healthEndpoint });
  const plan = buildPlan({
    status: 'started',
    sessionId,
    attach,
    eventEndpoint,
    healthEndpoint,
    host,
    port,
    url: started.url,
  });
  const shouldOpen = options.open !== false;
  if (shouldOpen && started.url) {
    progress(`agent-web-ui: opening browser ${started.url}`);
    try {
      await (deps.openUrl ?? openBrowserUrl)(started.url);
    } catch (error) {
      progress(`agent-web-ui: browser open failed; use ${started.url}`);
    }
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(plan, formatPlan(plan), options.format ?? 'auto'),
  };
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
  status: 'planned' | 'started';
  sessionId: string;
  attach: { command?: string; site_root?: string | null; site_root_source?: string | null; site_id?: string | null };
  eventEndpoint: string;
  healthEndpoint: string | null;
  host: string;
  port: number;
  url: string | null;
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
    command: args.attach.command ?? `narada-agent-web-ui --event-endpoint ${args.eventEndpoint}${args.healthEndpoint ? ` --health-endpoint ${args.healthEndpoint}` : ''}`,
  };
}

function formatPlan(plan: AgentWebUiAttachPlan): string {
  if (plan.status === 'started') {
    return [
      `agent-web-ui: ${plan.url}`,
      `  Session ${plan.session_id}`,
      `  Site    ${plan.site_id ?? plan.site_root ?? 'unknown'}`,
      `  Events  ${plan.event_endpoint}`,
      `  Health  ${plan.health_endpoint ?? 'not configured'} via local /api/health`,
      '  Input   conversation.send + slash commands',
    ].join('\n');
  }
  return [
    'agent-web-ui attach plan',
    `  Session ${plan.session_id}`,
    `  Site    ${plan.site_id ?? plan.site_root ?? 'unknown'}`,
    `  Command ${plan.command}`,
  ].join('\n');
}

function stringField(record: Record<string, unknown> | null | undefined, field: string): string | null {
  const value = record?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
