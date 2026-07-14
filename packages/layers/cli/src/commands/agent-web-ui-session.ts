import { readFile } from 'node:fs/promises';
import { agentIdentityGroupKey, agentIdentityRefMatchesRequest, normalizeSiteToken, roleSegment, siteSegment } from '@narada2/agent-identity';
import { evaluateAgentStartHandoff } from '@narada2/agent-start/launch-result-v0-contract';
import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult } from '../lib/cli-output.js';
import {
  objectField,
  asJsonRecord,
  integerField,
  sessionIdFromContract,
  stringField,
  type JsonRecord,
} from '../lib/launcher-contracts.js';
import { ExitCode } from '../lib/exit-codes.js';
import { parseAgentStartResultArtifact } from '../lib/agent-start-result-reader.js';
import { narsSessionsCommand } from './nars.js';
import type {
  AgentWebUiAttachOptions,
  AttachabilityResult,
  AttachSessionCandidate,
  AttachSessionDiscoveryReason,
  AuthorityTransitionSnapshot,
  NarsSessionsCommand,
  ProgressReporter,
  ResolvedAttachSession,
} from './agent-web-ui-types.js';

export class AttachSessionDiscoveryError extends Error {
  constructor(
    message: string,
    readonly reason: AttachSessionDiscoveryReason,
    readonly candidates: AttachSessionCandidate[] = [],
    readonly detail: string | null = null,
    readonly retryable: boolean = reason === 'nars_session_not_found_for_agent'
      || (detail ? isTransientAttachDiscoveryDetail(detail) : false),
  ) {
    super(message);
    this.name = 'AttachSessionDiscoveryError';
  }
}

export async function diagnoseAttachSession(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  dependencies: { discoverSessions?: NarsSessionsCommand } = {},
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const bindingPath = options.launchBindingPath?.trim();
  if (bindingPath) {
    return diagnoseLaunchBinding(bindingPath, options);
  }
  if (options.session?.trim()) {
    const diagnostic = buildAttachDiagnostic({
      status: 'resolved',
      phase: 'session_selection',
      request: diagnosticRequest(options),
      binding: null,
      result: null,
      correlation: { status: 'not_checked', agent: 'not_checked', site_root: 'not_checked', launch_session_id: 'not_checked' },
      resolution: { session_id: options.session.trim(), source: 'explicit_session', reason: null },
      next_step: 'Run agent-web-ui attach with the same session selector.',
    });
    return { exitCode: ExitCode.SUCCESS, result: formattedResult(diagnostic, formatAttachDiagnostic(diagnostic), options.format ?? 'auto') };
  }
  if (options.agent?.trim()) {
    try {
      const resolved = await resolveAttachSessionId({ ...options, dryRun: true, diagnose: false }, context, () => {}, dependencies);
      const diagnostic = buildAttachDiagnostic({
        status: 'resolved',
        phase: 'session_discovery',
        request: diagnosticRequest(options),
        binding: null,
        result: null,
        correlation: { status: 'not_checked', agent: 'not_checked', site_root: 'not_checked', launch_session_id: 'not_checked' },
        resolution: { session_id: resolved.sessionId, source: resolved.reason ?? 'agent_discovery', reason: null },
        next_step: `Run agent-web-ui attach --agent ${options.agent.trim()}.`,
      });
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(diagnostic, formatAttachDiagnostic(diagnostic), options.format ?? 'auto') };
    } catch (error) {
      const detail = error instanceof AttachSessionDiscoveryError
        ? error.message
        : error instanceof Error ? error.message : String(error);
      const diagnostic = buildAttachDiagnostic({
        status: error instanceof AttachSessionDiscoveryError && error.retryable ? 'waiting' : 'refused',
        phase: 'session_discovery',
        request: diagnosticRequest(options),
        binding: null,
        result: null,
        correlation: { status: 'not_checked', agent: 'not_checked', site_root: 'not_checked', launch_session_id: 'not_checked' },
        resolution: { session_id: null, source: null, reason: detail },
        next_step: 'Start the NARS runtime host or inspect the session discovery detail before retrying.',
      });
      return { exitCode: ExitCode.SUCCESS, result: formattedResult(diagnostic, formatAttachDiagnostic(diagnostic), options.format ?? 'auto') };
    }
  }
  const diagnostic = buildAttachDiagnostic({
    status: 'invalid',
    phase: 'request_validation',
    request: diagnosticRequest(options),
    binding: null,
    result: null,
    correlation: { status: 'not_checked', agent: 'not_checked', site_root: 'not_checked', launch_session_id: 'not_checked' },
    resolution: { session_id: null, source: null, reason: 'attach_selector_missing' },
    next_step: 'Pass --session, --agent, or --launch-binding to diagnose attachment.',
  });
  return { exitCode: ExitCode.INVALID_CONFIG, result: formattedResult(diagnostic, formatAttachDiagnostic(diagnostic), options.format ?? 'auto') };
}

async function diagnoseLaunchBinding(
  bindingPath: string,
  options: AgentWebUiAttachOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const bindingRead = await readJsonArtifact(bindingPath);
  if (bindingRead.status !== 'present' || !bindingRead.record) {
    const diagnostic = buildAttachDiagnostic({
      status: 'invalid',
      phase: 'launch_binding',
      request: diagnosticRequest(options),
      binding: { path: bindingPath, read_status: bindingRead.status, status: null, updated_at: null, agent: null, site_root: null, launch_session_id: null, result_path: null },
      result: null,
      correlation: { status: 'not_checked', agent: 'not_checked', site_root: 'not_checked', launch_session_id: 'not_checked' },
      resolution: { session_id: null, source: null, reason: 'launch_binding_unreadable' },
      next_step: 'Repair or regenerate the launch binding, then retry attachment.',
    });
    return { exitCode: ExitCode.INVALID_CONFIG, result: formattedResult(diagnostic, formatAttachDiagnostic(diagnostic), options.format ?? 'auto') };
  }

  const binding = bindingRead.record;
  const resultPath = stringField(binding, 'agent_start_result_file') ?? stringField(binding, 'result_file');
  const resultRead = resultPath ? await readAgentStartResultArtifact(resultPath) : { status: 'missing' as const, record: null, error: null };
  const result = resultRead.record;
  const resultStatus = stringField(result, 'status')?.trim().toLowerCase() ?? null;
  const resultHandoff = result ? evaluateAgentStartHandoff(result) : null;
  const correlation = result
    ? launchResultBindingCorrelation(binding, result)
    : { status: 'not_checked' as const, agent: 'not_checked' as const, site_root: 'not_checked' as const, launch_session_id: 'not_checked' as const };
  const bindingStatus = stringField(binding, 'status');
  const directSession = sessionIdFromContract(binding);
  const resultSession = resultHandoff?.session_id ?? null;
  const pendingResult = bindingStatus === 'waiting_for_agent_start'
    && resultHandoff?.eligible === true
    && Boolean(resultHandoff.session_id)
    && correlation.status === 'matched';
  const resolvedSession = bindingStatus === 'ready' && directSession
    ? directSession
    : pendingResult ? resultSession : null;
  const status = resolvedSession
    ? 'resolved'
    : resultRead.status === 'missing' && bindingStatus === 'waiting_for_agent_start'
      ? 'waiting'
      : correlation.status === 'mismatched' || resultRead.status === 'invalid' || resultHandoff?.eligible === false
        ? 'refused'
        : 'invalid';
  const diagnostic = buildAttachDiagnostic({
    status,
    phase: 'launch_binding',
    request: diagnosticRequest(options),
    binding: {
      path: bindingPath,
      read_status: bindingRead.status,
      status: bindingStatus,
      updated_at: stringField(binding, 'updated_at'),
      agent: stringField(binding, 'agent'),
      site_root: stringField(binding, 'site_root'),
      launch_session_id: stringField(binding, 'launch_session_id'),
      result_path: resultPath,
    },
    result: {
      path: resultPath,
      read_status: resultRead.status,
      status: resultStatus,
      identity: stringField(result, 'identity') ?? stringField(result, 'agent_id'),
      site_root: stringField(result, 'target_site_root') ?? stringField(result, 'session_site_root') ?? stringField(objectField(result, 'required_environment'), 'NARADA_SITE_ROOT'),
      launch_session_id: stringField(result, 'launch_session_id') ?? stringField(objectField(result, 'required_environment'), 'NARADA_LAUNCH_SESSION_ID'),
      session_id: resultSession,
      error: resultRead.error ?? null,
    },
    correlation,
    resolution: { session_id: resolvedSession, source: resolvedSession ? (pendingResult ? 'launch_result_file' : 'launch_binding') : null, reason: resolvedSession ? null : resultStatus === 'failed' ? 'agent_start_failed' : null },
    next_step: resolvedSession
      ? `Run narada agent-web-ui attach --launch-binding "${bindingPath}".`
      : status === 'waiting'
        ? `Wait for the agent-start result file${resultPath ? `: ${resultPath}` : ''}.`
        : 'Do not attach this result; inspect the binding/result correlation or start a fresh launch.',
  });
  return { exitCode: ExitCode.SUCCESS, result: formattedResult(diagnostic, formatAttachDiagnostic(diagnostic), options.format ?? 'auto') };
}

function diagnosticRequest(options: AgentWebUiAttachOptions): JsonRecord {
  return {
    session_id: options.session?.trim() ?? null,
    agent_id: options.agent?.trim() ?? null,
    site_id: options.site ?? null,
    site_root: options.siteRoot ?? null,
    launch_binding_path: options.launchBindingPath ?? null,
  };
}

function buildAttachDiagnostic(args: {
  status: 'resolved' | 'waiting' | 'refused' | 'invalid';
  phase: string;
  request: JsonRecord;
  binding: JsonRecord | null;
  result: JsonRecord | null;
  correlation: JsonRecord;
  resolution: JsonRecord;
  next_step: string;
}): JsonRecord {
  return {
    schema: 'narada.agent_web_ui.attach_diagnostic.v1',
    status: args.status,
    read_only: true,
    phase: args.phase,
    request: args.request,
    binding: args.binding,
    result: args.result,
    correlation: args.correlation,
    resolution: args.resolution,
    next_step: args.next_step,
  };
}

function formatAttachDiagnostic(diagnostic: JsonRecord): string {
  const binding = objectField(diagnostic, 'binding');
  const result = objectField(diagnostic, 'result');
  const correlation = objectField(diagnostic, 'correlation');
  const resolution = objectField(diagnostic, 'resolution');
  return [
    'agent-web-ui attach diagnostic',
    `  Status      ${stringField(diagnostic, 'status') ?? 'unknown'}`,
    `  Phase       ${stringField(diagnostic, 'phase') ?? 'unknown'}`,
    `  Binding     ${stringField(binding, 'status') ?? stringField(binding, 'read_status') ?? 'not selected'}`,
    `  Result      ${stringField(result, 'status') ?? stringField(result, 'read_status') ?? 'not selected'}`,
    `  Correlation ${stringField(correlation, 'status') ?? 'not checked'} (agent=${stringField(correlation, 'agent') ?? 'unknown'}, site_root=${stringField(correlation, 'site_root') ?? 'unknown'}, launch=${stringField(correlation, 'launch_session_id') ?? 'unknown'})`,
    `  Session     ${stringField(resolution, 'session_id') ?? 'none'}`,
    `  Next        ${stringField(diagnostic, 'next_step') ?? 'inspect the diagnostic result'}`,
  ].join('\n');
}

function launchResultMatchesBinding(binding: JsonRecord | null, result: JsonRecord | null): boolean {
  return launchResultBindingCorrelation(binding, result).status === 'matched';
}

function launchResultBindingCorrelation(binding: JsonRecord | null, result: JsonRecord | null): JsonRecord {
  if (!binding || !result) {
    return { status: 'not_checked', agent: 'not_checked', site_root: 'not_checked', launch_session_id: 'not_checked' };
  }
  const requiredEnvironment = objectField(result, 'required_environment');
  const checks = {
    agent: compareCorrelationField(
      stringField(binding, 'agent'),
      stringField(result, 'identity') ?? stringField(result, 'agent_id'),
    ),
    site_root: compareCorrelationField(
      stringField(binding, 'site_root'),
      stringField(result, 'target_site_root')
        ?? stringField(result, 'session_site_root')
        ?? stringField(requiredEnvironment, 'NARADA_SITE_ROOT'),
      normalizePathToken,
    ),
    launch_session_id: compareCorrelationField(
      stringField(binding, 'launch_session_id'),
      stringField(result, 'launch_session_id') ?? stringField(requiredEnvironment, 'NARADA_LAUNCH_SESSION_ID'),
    ),
  };
  const status = Object.values(checks).includes('mismatch')
    ? 'mismatched'
    : Object.values(checks).includes('missing')
      ? 'incomplete'
      : 'matched';
  return { status, ...checks };
}

function compareCorrelationField(
  expected: string | null,
  actual: string | null,
  normalize: (value: string) => string = (value) => value,
): 'match' | 'mismatch' | 'missing' {
  if (!expected || !actual) return 'missing';
  return normalize(expected) === normalize(actual) ? 'match' : 'mismatch';
}

function normalizePathToken(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

export async function resolveAttachSessionId(
  options: AgentWebUiAttachOptions,
  context: CommandContext,
  progress: ProgressReporter,
  dependencies: { discoverSessions?: NarsSessionsCommand } = {},
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
      const resolved = await discoverAttachSessionIdOnce(options, context, agentId, dependencies.discoverSessions);
      if (!options.dryRun) progress(`agent-web-ui: found NARS session ${resolved.sessionId}`);
      return resolved;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!(lastError instanceof AttachSessionDiscoveryError)
        || !lastError.retryable
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
    // A detached agent-start process can materialize its result after the
    // launcher wrapper has returned `starting`; the result file is the
    // authoritative handoff in that interval.
    if (resultPath) {
      const resultRead = await readAgentStartResultArtifact(resultPath);
      const result = resultRead.record;
      const resultHandoff = result ? evaluateAgentStartHandoff(result) : null;
      const resultSession = resultHandoff?.session_id ?? null;
      const resultHandoffEligible = readyBinding
        || (stringField(binding, 'status') === 'waiting_for_agent_start'
          && resultHandoff?.eligible === true
          && launchResultMatchesBinding(binding, result));
      if (resultSession && resultHandoffEligible) {
        if (!options.dryRun) progress(`agent-web-ui: launch result resolved NARS session ${resultSession}`);
        return { sessionId: resultSession, reason: 'launch_binding_result_file' };
      }
      if (resultRead.status === 'invalid') lastReason = resultRead.error ?? 'agent_start_result_contract_invalid';
      else if (resultHandoff?.status === 'ineligible') lastReason = resultHandoff.reason ?? 'agent_start_result_not_attachable';
    }
    if (isCurrentLaunchBindingFailure(binding, { startedAt, observedCurrentLaunchStart })) {
      const reason = stringField(binding, 'reason') ?? 'launch_binding_failed';
      throw new AttachSessionDiscoveryError(
        `launch_binding_failed: ${reason}: ${bindingPath}`,
        'launch_binding_failed',
        [],
        reason,
        false,
      );
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
  discoverSessions: NarsSessionsCommand = narsSessionsCommand,
): Promise<ResolvedAttachSession> {
  let sessionsResult: Awaited<ReturnType<NarsSessionsCommand>>;
  try {
    sessionsResult = await discoverSessions({
      site: options.site,
      siteRoot: options.siteRoot,
      health: options.dryRun === true ? false : true,
      healthTimeoutMs: options.healthTimeoutMs,
      limit: 200,
      format: 'json',
      launchRegistryPath: options.launchRegistryPath,
    }, context);
  } catch (error) {
    const detail = attachDiscoveryErrorDetail(error);
    throw new AttachSessionDiscoveryError(
      `session_discovery_failed: ${agentId}: ${detail}`,
      'session_discovery_failed',
      [],
      detail,
    );
  }
  if (sessionsResult.exitCode !== ExitCode.SUCCESS) {
    const body = asJsonRecord(sessionsResult.result);
    const detail = stringField(body, 'error')
      ?? stringField(body, 'reason')
      ?? stringField(body, '_formatted')
      ?? 'NARS session discovery returned a non-success result';
    throw new AttachSessionDiscoveryError(
      `session_discovery_failed: ${agentId}: ${detail}`,
      'session_discovery_failed',
      [],
      detail,
    );
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

export function isTransientAttachDiscoveryDetail(detail: string): boolean {
  if (/site_not_found|invalid_site|launch_registry/i.test(detail)) return false;
  return /database is locked|sqlite_(?:busy|locked)|\b(?:ebusy|eagain|econnrefused|enoent)\b|not listening|temporarily unavailable|still starting/i.test(detail);
}

function attachDiscoveryErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'unknown discovery error';
}

async function readJsonRecord(path: string): Promise<JsonRecord | null> {
  return (await readJsonArtifact(path)).record;
}

async function readJsonArtifact(path: string): Promise<{
  status: 'present' | 'missing' | 'invalid';
  record: JsonRecord | null;
  error?: string | null;
}> {
  try {
    const record = asJsonRecord(JSON.parse(await readFile(path, 'utf8')));
    return record ? { status: 'present', record, error: null } : { status: 'invalid', record: null, error: 'json_record_required' };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : null;
    return { status: code === 'ENOENT' ? 'missing' : 'invalid', record: null, error: code === 'ENOENT' ? null : 'json_artifact_invalid' };
  }
}

async function readAgentStartResultArtifact(path: string): Promise<{
  status: 'present' | 'missing' | 'invalid';
  record: JsonRecord | null;
  error: string | null;
}> {
  const read = await readJsonArtifact(path);
  if (read.status !== 'present' || !read.record) {
    return { status: read.status, record: null, error: read.error ?? null };
  }
  try {
    const canonicalRecord = asJsonRecord(parseAgentStartResultArtifact(read.record, path));
    const handoff = evaluateAgentStartHandoff(canonicalRecord);
    if (handoff.status === 'invalid') {
      return { status: 'invalid', record: null, error: handoff.detail ?? handoff.reason };
    }
    return { status: 'present', record: canonicalRecord, error: null };
  } catch (error) {
    return {
      status: 'invalid',
      record: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
