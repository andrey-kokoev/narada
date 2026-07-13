import { readFile } from 'node:fs/promises';
import { agentIdentityGroupKey, agentIdentityRefMatchesRequest, normalizeSiteToken, roleSegment, siteSegment } from '@narada2/agent-identity';
import type { CommandContext } from '../lib/command-wrapper.js';
import {
  objectField,
  asJsonRecord,
  integerField,
  sessionIdFromContract,
  stringField,
  type JsonRecord,
} from '../lib/launcher-contracts.js';
import { ExitCode } from '../lib/exit-codes.js';
import { narsSessionsCommand } from './nars.js';
import type {
  AgentWebUiAttachOptions,
  AttachabilityResult,
  AttachSessionCandidate,
  AttachSessionDiscoveryReason,
  AuthorityTransitionSnapshot,
  ProgressReporter,
  ResolvedAttachSession,
} from './agent-web-ui-types.js';

export class AttachSessionDiscoveryError extends Error {
  constructor(
    message: string,
    readonly reason: AttachSessionDiscoveryReason,
    readonly candidates: AttachSessionCandidate[] = [],
  ) {
    super(message);
    this.name = 'AttachSessionDiscoveryError';
  }
}

export async function resolveAttachSessionId(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  progress: ProgressReporter,
): Promise<ResolvedAttachSession> {
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
      if (!(lastError instanceof AttachSessionDiscoveryError)
        || lastError.reason !== 'nars_session_not_found_for_agent'
        || Date.now() - startedAt >= timeoutMs) break;
      if (!options.dryRun && Date.now() >= nextProgressAt) {
        progress(`agent-web-ui: still waiting for ${agentId} NARS session health`);
        nextProgressAt = Date.now() + 5000;
      }
      await delay(1000);
    }
  } while (Date.now() - startedAt < timeoutMs);
  throw lastError ?? new AttachSessionDiscoveryError(
    `nars_session_not_found_for_agent: ${agentId}`,
    'nars_session_not_found_for_agent',
  );
}

async function resolveAttachSessionIdFromLaunchBinding(
  options: AgentWebUiAttachOptions,
  progress: ProgressReporter,
): Promise<ResolvedAttachSession> {
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
    const directSession = sessionIdFromContract(binding);
    if (directSession && readyBinding) {
      if (!options.dryRun) progress(`agent-web-ui: launch binding resolved NARS session ${directSession}`);
      return { sessionId: directSession, reason: 'launch_binding' };
    }
    const resultPath = stringField(binding, 'agent_start_result_file') ?? stringField(binding, 'result_file');
    if (resultPath && readyBinding) {
      const result = await readJsonRecord(resultPath);
      const resultSession = sessionIdFromContract(result);
      if (resultSession) {
        if (!options.dryRun) progress(`agent-web-ui: launch result resolved NARS session ${resultSession}`);
        return { sessionId: resultSession, reason: 'launch_binding_result_file' };
      }
      if (stringField(result, 'status') === 'failed') lastReason = 'agent_start_failed';
    }
    if (isCurrentLaunchBindingFailure(binding, { startedAt, observedCurrentLaunchStart })) {
      lastReason = stringField(binding, 'reason') ?? 'launch_binding_failed';
    }
    if (timeoutMs <= 0 || Date.now() - startedAt >= timeoutMs || lastReason !== 'launch_binding_unresolved') break;
    if (!options.dryRun && Date.now() >= nextProgressAt) {
      progress('agent-web-ui: still waiting for launch binding result');
      nextProgressAt = Date.now() + 5000;
    }
    await delay(1000);
  } while (Date.now() - startedAt < timeoutMs);
  throw new AttachSessionDiscoveryError(
    `launch_binding_unresolved: ${lastReason}: ${bindingPath}`,
    'launch_binding_unresolved',
  );
}

function isCurrentLaunchBindingStart(binding: JsonRecord | null, startedAt: number): boolean {
  if (stringField(binding, 'status') !== 'waiting_for_agent_start') return false;
  return bindingUpdatedAtMs(binding) >= startedAt - 10000;
}

function isAttachableLaunchBinding(
  binding: JsonRecord | null,
  args: { startedAt: number; observedCurrentLaunchStart: boolean },
): boolean {
  if (!binding) return false;
  if (stringField(binding, 'status') !== 'ready') return false;
  if (args.observedCurrentLaunchStart) return true;
  return bindingUpdatedAtMs(binding) >= args.startedAt - 10000;
}

function isCurrentLaunchBindingFailure(
  binding: JsonRecord | null,
  args: { startedAt: number; observedCurrentLaunchStart: boolean },
): boolean {
  if (!binding) return false;
  if (stringField(binding, 'status') !== 'failed') return false;
  if (args.observedCurrentLaunchStart) return true;
  return bindingUpdatedAtMs(binding) >= args.startedAt - 10000;
}

function bindingUpdatedAtMs(binding: JsonRecord | null): number {
  const updatedAt = stringField(binding, 'updated_at');
  if (!updatedAt) return 0;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function discoverAttachSessionIdOnce(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  agentId: string,
): Promise<ResolvedAttachSession> {
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
  const body = sessionsResult.result as { sessions?: JsonRecord[] };
  const candidates = body.sessions ?? [];
  const matches = candidates.filter((session) => {
    const sessionId = stringField(session, 'session_id') ?? stringField(session, 'carrier_session_id');
    const displayState = stringField(session, 'display_state');
    const terminalState = stringField(session, 'terminal_state');
    return agentIdMatchesSession(agentId, session)
      && Boolean(sessionId)
      && isDiscoverableAttachSessionState(displayState, {
        requireActive: options.dryRun !== true && !(Number(options.waitForSessionMs ?? 0) > 0),
      })
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
  if (!sessionId) {
    throw new AttachSessionDiscoveryError(
      `nars_session_not_found_for_agent: ${agentId}`,
      'nars_session_not_found_for_agent',
      candidates.map(toAttachSessionCandidate),
    );
  }
  return { sessionId, reason: 'discovered_by_agent' };
}

function agentIdMatchesSession(requestedAgentId: string, session: JsonRecord): boolean {
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

function distinctAttachIdentityGroups(sessions: JsonRecord[]): Set<string> {
  return new Set(sessions.map((session) => agentIdentityGroupKey(
    objectField(session, 'agent_identity_ref'),
    stringField(session, 'agent_id'),
    stringField(session, 'site_id'),
  )));
}

function toAttachSessionCandidate(session: JsonRecord): AttachSessionCandidate {
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

function compareSessionsNewestFirst(left: JsonRecord, right: JsonRecord): number {
  return sessionTimestampMs(right) - sessionTimestampMs(left);
}

function sessionTimestampMs(session: JsonRecord): number {
  for (const field of ['last_seen_at', 'started_at', 'projection_generated_at']) {
    const value = stringField(session, field);
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function assessAttachability(
  session: JsonRecord | null | undefined,
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

export function authorityTransitionSnapshot(session: JsonRecord | null | undefined): AuthorityTransitionSnapshot {
  const record = objectField(session, 'record');
  const sourceWriteAdmission = stringField(session, 'source_write_admission') ?? stringField(record, 'source_write_admission');
  const transitionState = stringField(session, 'authority_transition_state') ?? stringField(record, 'authority_transition_state');
  const supersededBySessionId = stringField(session, 'superseded_by_session_id') ?? stringField(record, 'superseded_by_session_id');
  const authorityTransition = objectField(record, 'authority_transition');
  const targetLocator = objectField(record, 'target_authority_locator') ?? objectField(authorityTransition, 'target_authority_locator');
  const staleSource = sourceWriteAdmission === 'sealed'
    || sourceWriteAdmission === 'retired'
    || transitionState === 'target_active'
    || Boolean(supersededBySessionId);
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

async function readJsonRecord(path: string): Promise<JsonRecord | null> {
  try {
    return asJsonRecord(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
