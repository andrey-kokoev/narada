import { readFile } from 'node:fs/promises';
import { discoverNarsSessions, type NarsSessionObservation } from '@narada-core/nars-session-core/session-index';
import type {
  WorkspaceLaunchAgentPlan,
  WorkspaceLaunchAttachmentEvidence,
  WorkspaceLaunchAuthorityDecisionEvidence,
  WorkspaceLaunchTerminalFailure,
} from './workspace-launch-types.js';

// Runtime dependency and MCP startup is part of the attachment boundary: the
// runtime can already be launched and serving its health/event listeners while
// it is still finishing the work that writes its durable session index. Keep
// the launcher alive long enough for that normal startup path to complete;
// the exact launch binding and healthy-session checks below still prevent
// attaching to an unrelated session.
export const WORKSPACE_LAUNCH_ATTACHMENT_TIMEOUT_MS = 120_000;
export const WORKSPACE_LAUNCH_ATTACHMENT_POLL_MS = 100;

export class WorkspaceLaunchAttachmentError extends Error {
  readonly evidence: WorkspaceLaunchAttachmentEvidence;

  constructor(evidence: WorkspaceLaunchAttachmentEvidence) {
    super(`workspace_launch_attachment_not_ready: ${evidence.sessions.map((session) => session.reason ?? 'session_not_ready').join('; ')}`);
    this.name = 'WorkspaceLaunchAttachmentError';
    this.evidence = evidence;
  }
}

async function inspectLaunchFailure(plan: WorkspaceLaunchAgentPlan): Promise<{
  failure: WorkspaceLaunchTerminalFailure;
  terminal: boolean;
} | null> {
  const bindingPath = plan.operator_projection_launch_binding?.path;
  if (!bindingPath) return null;
  let binding: Record<string, unknown>;
  try {
    binding = JSON.parse(await readFile(bindingPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  const reason = typeof binding.reason === 'string' && binding.reason.trim()
    ? binding.reason.trim()
    : 'agent_start_failed';
  const resultPath = typeof binding.agent_start_result_file === 'string'
    ? binding.agent_start_result_file
    : null;
  let result: Record<string, unknown> | null = null;
  try {
    if (resultPath) result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>;
  } catch {
    result = null;
  }

  const runtimeStderr = result ? await readRuntimeStderr(result) : null;
  if (runtimeStderr) {
    return {
      failure: terminalFailure({
        reasonCode: 'runtime_start_failed',
        message: runtimeStderr,
        result,
        resultPath,
      }),
      terminal: true,
    };
  }

  if (binding.status === 'waiting_for_agent_start') {
    return {
      failure: terminalFailure({
        reasonCode: 'agent_start_handoff_pending',
        message: reason,
        result,
        resultPath,
      }),
      terminal: false,
    };
  }
  if (binding.status !== 'failed') return null;
  if (!resultPath || !result) {
    return {
      failure: terminalFailure({
        reasonCode: 'launch_binding_failed',
        message: reason,
        result,
        resultPath,
      }),
      terminal: true,
    };
  }
  const resultReason = typeof result.reason_code === 'string' && result.reason_code.trim()
    ? result.reason_code.trim()
    : typeof result.reason === 'string' && result.reason.trim()
      ? result.reason.trim()
      : typeof result.error === 'string' && result.error.trim()
        ? result.error.trim()
        : reason;
  return {
    failure: terminalFailure({
      reasonCode: resultReason,
      message: typeof result.reason === 'string' && result.reason.trim() ? result.reason.trim() : resultReason,
      result,
      resultPath,
    }),
    terminal: true,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, limit = 2_000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseAuthorityDecisionEvidence(value: unknown): WorkspaceLaunchAuthorityDecisionEvidence | null {
  const input = record(value);
  const owner = record(input?.existing_owner);
  const observations = record(input?.observations);
  const process = record(observations?.process);
  const lease = record(observations?.lease);
  const heartbeat = record(observations?.heartbeat);
  const health = record(observations?.health);
  const reclamation = record(input?.reclamation);
  if (input?.schema !== 'narada.nars.session_authority_decision_evidence.v1'
    || !owner || !process || !lease || !heartbeat || !health || !reclamation) return null;
  const processStatus = process.status;
  const leaseStatus = lease.status;
  const evaluatedAt = boundedString(input.evaluated_at, 100);
  const governingRule = boundedString(input.governing_rule, 200);
  const healthReason = boundedString(health.reason, 200);
  const outcome = boundedString(input.outcome, 100);
  if (!['alive', 'absent', 'not_observed'].includes(String(processStatus))
    || !['fresh', 'expired', 'unknown'].includes(String(leaseStatus))
    || health.status !== 'not_consulted'
    || !evaluatedAt
    || !governingRule
    || !healthReason
    || !outcome
    || typeof reclamation.evaluated !== 'boolean'
    || typeof reclamation.eligible !== 'boolean'
    || !Array.isArray(reclamation.blockers)
    || !reclamation.blockers.every((entry) => typeof entry === 'string')) return null;
  return {
    schema: 'narada.nars.session_authority_decision_evidence.v1',
    evaluated_at: evaluatedAt,
    governing_rule: governingRule,
    existing_owner: {
      session_id: boundedString(owner.session_id, 200),
      launch_session_id: boundedString(owner.launch_session_id, 200),
      authority_epoch: nullableNumber(owner.authority_epoch),
      state: boundedString(owner.state, 100),
      runtime_kind: boundedString(owner.runtime_kind, 200),
      operator_surface_kind: boundedString(owner.operator_surface_kind, 200),
      pid: nullableNumber(owner.pid),
      started_at: boundedString(owner.started_at, 100),
      activated_at: boundedString(owner.activated_at, 100),
      updated_at: boundedString(owner.updated_at, 100),
    },
    observations: {
      process: {
        pid: nullableNumber(process.pid),
        status: processStatus as 'alive' | 'absent' | 'not_observed',
      },
      lease: {
        status: leaseStatus as 'fresh' | 'expired' | 'unknown',
        expires_at: boundedString(lease.expires_at, 100),
        remaining_ms: nullableNumber(lease.remaining_ms),
      },
      heartbeat: {
        last_at: boundedString(heartbeat.last_at, 100),
        age_ms: nullableNumber(heartbeat.age_ms),
      },
      health: {
        status: 'not_consulted',
        reason: healthReason,
      },
    },
    reclamation: {
      evaluated: reclamation.evaluated === true,
      eligible: reclamation.eligible === true,
      blockers: reclamation.blockers.slice(0, 10).map((entry) => entry.slice(0, 100)),
    },
    outcome,
  };
}

function terminalFailure({
  reasonCode,
  message,
  result,
  resultPath,
}: {
  reasonCode: string;
  message: string;
  result: Record<string, unknown> | null;
  resultPath: string | null;
}): WorkspaceLaunchTerminalFailure {
  const principal = record(result?.principal);
  const attach = record(result?.attach);
  const decisionEvidence = parseAuthorityDecisionEvidence(result?.decision_evidence);
  const authorityRefusal = decisionEvidence || result?.schema === 'narada.nars.session_authority_refusal.v1'
    ? {
      principal_key: boundedString(principal?.principal_key, 300),
      session_id: boundedString(result?.session_id, 200),
      authority_epoch: nullableNumber(result?.authority_epoch),
      state: boundedString(result?.state, 100),
      decision_evidence: decisionEvidence,
      attach_command: boundedString(attach?.command),
      web_ui_command: boundedString(attach?.web_ui_command),
    }
    : null;
  return {
    schema: 'narada.workspace_launch.terminal_failure.v1',
    source: 'agent_start',
    source_schema: boundedString(result?.schema, 200),
    reason_code: boundedString(reasonCode, 200) ?? 'agent_start_failed',
    message: boundedString(message) ?? 'Agent Start failed.',
    required_next_step: boundedString(result?.required_next_step),
    source_result_ref: boundedString(resultPath, 500),
    authority_refusal: authorityRefusal,
  };
}

export function normalizeWorkspaceLaunchTerminalFailure(value: unknown): WorkspaceLaunchTerminalFailure | null {
  const input = record(value);
  if (input?.schema !== 'narada.workspace_launch.terminal_failure.v1'
    || input.source !== 'agent_start') return null;
  const reasonCode = boundedString(input.reason_code, 200);
  const message = boundedString(input.message);
  if (!reasonCode || !message) return null;
  const authority = record(input.authority_refusal);
  const decisionEvidence = parseAuthorityDecisionEvidence(authority?.decision_evidence);
  return {
    schema: 'narada.workspace_launch.terminal_failure.v1',
    source: 'agent_start',
    source_schema: boundedString(input.source_schema, 200),
    reason_code: reasonCode,
    message,
    required_next_step: boundedString(input.required_next_step),
    source_result_ref: boundedString(input.source_result_ref, 500),
    authority_refusal: authority
      ? {
        principal_key: boundedString(authority.principal_key, 300),
        session_id: boundedString(authority.session_id, 200),
        authority_epoch: nullableNumber(authority.authority_epoch),
        state: boundedString(authority.state, 100),
        decision_evidence: decisionEvidence,
        attach_command: boundedString(authority.attach_command),
        web_ui_command: boundedString(authority.web_ui_command),
      }
      : null,
  };
}

function terminalFailureReason(failure: WorkspaceLaunchTerminalFailure): string {
  return ['launch_binding_failed', 'runtime_start_failed', 'agent_start_handoff_pending'].includes(failure.reason_code)
    ? `${failure.reason_code}:${failure.message}`
    : `agent_start_failed:${failure.reason_code}`;
}

async function readRuntimeStderr(result: Record<string, unknown>): Promise<string | null> {
  const paths: string[] = [];
  const addPath = (value: unknown) => {
    if (typeof value === 'string' && value.trim() && !paths.includes(value.trim())) paths.push(value.trim());
  };
  const addOutputFiles = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    addPath((value as Record<string, unknown>).stderr_path);
  };
  const addContractOutputFiles = (value: unknown) => {
    addOutputFiles(value);
    if (value && typeof value === 'object') {
      addOutputFiles((value as Record<string, unknown>).hidden_runtime_output_files);
    }
  };
  addOutputFiles(result.hidden_runtime_output_files);
  const contracts = result.launcher_contracts;
  if (contracts && typeof contracts === 'object') {
    addContractOutputFiles((contracts as Record<string, unknown>).hidden_runtime_output_files);
    addContractOutputFiles((contracts as Record<string, unknown>).launch_selection_session);
    addContractOutputFiles((contracts as Record<string, unknown>).operator_terminal_projection_plan);
  }
  for (const path of paths) {
    try {
      const text = (await readFile(path, 'utf8')).trim();
      if (text) return text.length > 2_000 ? text.slice(text.length - 2_000) : text;
    } catch {
      // The output file may not exist yet while the detached handoff is still running.
    }
  }
  return null;
}

function candidatePlanAgentId(plan: WorkspaceLaunchAgentPlan): string | null {
  const canonical = plan.agent_identity_ref?.canonical_agent_id;
  return typeof canonical === 'string' && canonical.trim() ? canonical.trim() : plan.agent ?? null;
}

function candidateAgentId(session: NarsSessionObservation): string | null {
  const record = session.record as Record<string, unknown> | undefined;
  const identity = session.agent_identity_ref ?? record?.agent_identity_ref;
  if (identity && typeof identity === 'object' && 'canonical_agent_id' in identity
    && typeof identity.canonical_agent_id === 'string' && identity.canonical_agent_id.trim()) {
    return identity.canonical_agent_id.trim();
  }
  return session.agent_id ?? (typeof record?.agent_id === 'string' ? record.agent_id : null);
}

function candidateSiteId(session: NarsSessionObservation): string | null {
  const record = session.record as Record<string, unknown> | undefined;
  return session.site_id ?? (typeof record?.site_id === 'string' ? record.site_id : null);
}

export interface WorkspaceLaunchHealthProbeResult {
  status: 'healthy' | 'unavailable';
  session_id: string | null;
  agent_id?: string | null;
  site_id?: string | null;
}

export interface WorkspaceLaunchAttachmentDependencies {
  discover?: typeof discoverNarsSessions;
  probeHealth?: (endpoint: string, timeoutMs?: number) => Promise<WorkspaceLaunchHealthProbeResult>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export async function awaitWorkspaceLaunchSessionAttachments(
  plans: WorkspaceLaunchAgentPlan[],
  options: WorkspaceLaunchAttachmentDependencies & {
    timeoutMs?: number;
    pollMs?: number;
  } = {},
): Promise<WorkspaceLaunchAttachmentEvidence> {
  const discover = options.discover ?? discoverNarsSessions;
  const probeHealth = options.probeHealth ?? probeWorkspaceLaunchHealth;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? WORKSPACE_LAUNCH_ATTACHMENT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? WORKSPACE_LAUNCH_ATTACHMENT_POLL_MS;
  const deadline = now() + timeoutMs;
  const attempts = new Map<string, number>();
  const latest = new Map<string, WorkspaceLaunchAttachmentEvidence['sessions'][number]>();

  if (plans.length === 0) throw new Error('workspace_launch_attachment_plans_empty');

  for (const plan of plans) {
    if (!plan.launch_session_id) throw new Error(`workspace_launch_attachment_binding_missing: ${plan.agent}`);
    if (attempts.has(plan.launch_session_id)) throw new Error(`workspace_launch_attachment_binding_duplicate: ${plan.launch_session_id}`);
    attempts.set(plan.launch_session_id, 0);
    latest.set(plan.launch_session_id, {
      launch_session_id: plan.launch_session_id,
      session_id: null,
      health_session_id: null,
      health_identity_match: false,
      site_root: plan.site_root,
      event_endpoint: null,
      health_endpoint: null,
      health_status: 'unavailable',
      attempts: 0,
      reason: 'session_not_indexed',
    });
  }

  while (now() <= deadline) {
    let attachedCount = 0;
    for (const plan of plans) {
      if (now() > deadline) break;
      const launchSessionId = plan.launch_session_id;
      if (!launchSessionId) continue;
      const attempt = (attempts.get(launchSessionId) ?? 0) + 1;
      attempts.set(launchSessionId, attempt);
      let candidate: NarsSessionObservation | null = null;
      let discoveryError: string | null = null;
      try {
        const discovery = discover({ siteRoot: plan.site_root });
        candidate = discovery.sessions.find((session) => (
          sessionLaunchSessionId(session) === launchSessionId
          && samePath(session.site_root ?? session.record?.site_root, plan.site_root)
        )) ?? null;
      } catch (error) {
        discoveryError = 'session_index_unavailable';
      }

      if (!candidate) {
        const launchFailure = await inspectLaunchFailure(plan);
        const sessionEvidence: WorkspaceLaunchAttachmentEvidence['sessions'][number] = {
          launch_session_id: launchSessionId,
          session_id: null,
          health_session_id: null,
          health_identity_match: false,
          site_root: plan.site_root,
          event_endpoint: null,
          health_endpoint: null,
          health_status: 'unavailable',
          attempts: attempt,
          reason: launchFailure
            ? terminalFailureReason(launchFailure.failure)
            : discoveryError ?? 'session_not_indexed',
          ...(launchFailure ? { terminal_failure: launchFailure.failure } : {}),
        };
        latest.set(launchSessionId, sessionEvidence);
        if (launchFailure?.terminal) {
          throw new WorkspaceLaunchAttachmentError({
            schema: 'narada.workspace_launch.attachment.v1',
            status: 'handoff_pending',
            exact_session: false,
            launch_session_ids: plans.flatMap((candidatePlan) =>
              candidatePlan.launch_session_id ? [candidatePlan.launch_session_id] : []),
            sessions: [...latest.values()],
            required_next_step: launchFailure.failure.required_next_step
              ?? 'Inspect the failed agent-start artifact and correct the terminal launch refusal before retrying.',
          });
        }
        continue;
      }

      const sessionId = sessionIdFromObservation(candidate);
      const expectedAgentId = candidatePlanAgentId(plan);
      const expectedSiteId = typeof plan.site === 'string' && plan.site.trim() ? plan.site.trim() : null;
      const observedAgentId = candidateAgentId(candidate);
      const observedSiteId = candidateSiteId(candidate);
      const eventEndpoint = candidate.event_endpoint ?? candidate.record?.event_endpoint ?? null;
      const healthEndpoint = candidate.health_endpoint ?? candidate.record?.health_endpoint ?? null;
      let health: WorkspaceLaunchHealthProbeResult = { status: 'unavailable', session_id: null, agent_id: null, site_id: null };
      if (healthEndpoint && now() <= deadline) {
        try {
          health = await probeHealth(healthEndpoint, Math.max(1, Math.min(2_000, deadline - now())));
        } catch {
          health = { status: 'unavailable', session_id: null, agent_id: null, site_id: null };
        }
      }
      const healthIdentityMatch = Boolean(sessionId && health.session_id === sessionId);
      const canonicalIdentityMatch = (!expectedAgentId || !expectedSiteId)
        ? true
        : Boolean(
          observedAgentId === expectedAgentId
          && observedSiteId === expectedSiteId
          && (!health.agent_id || health.agent_id === expectedAgentId)
          && (!health.site_id || health.site_id === expectedSiteId),
        );
      const attached = Boolean(sessionId && health.status === 'healthy' && healthIdentityMatch && canonicalIdentityMatch);
      latest.set(launchSessionId, {
        launch_session_id: launchSessionId,
        session_id: sessionId,
        health_session_id: health.session_id,
        health_identity_match: healthIdentityMatch,
        expected_agent_id: expectedAgentId,
        observed_agent_id: observedAgentId,
        expected_site_id: expectedSiteId,
        observed_site_id: observedSiteId,
        health_agent_id: health.agent_id ?? null,
        health_site_id: health.site_id ?? null,
        canonical_identity_match: canonicalIdentityMatch,
        site_root: candidate.site_root ?? candidate.record?.site_root ?? plan.site_root,
        event_endpoint: eventEndpoint,
        health_endpoint: healthEndpoint,
        health_status: health.status,
        attempts: attempt,
        ...(attached ? {} : {
          reason: !sessionId
            ? 'session_id_missing'
            : !healthEndpoint
              ? 'health_endpoint_missing'
              : health.status !== 'healthy'
                ? 'session_health_unavailable'
                : !canonicalIdentityMatch
                  ? 'session_identity_mismatch'
                  : 'session_health_session_mismatch',
        }),
      });
      if (attached) attachedCount += 1;
    }

    if (attachedCount === plans.length) {
      return {
        schema: 'narada.workspace_launch.attachment.v1',
        status: 'attached',
        exact_session: true,
        launch_session_ids: plans.flatMap((plan) => plan.launch_session_id ? [plan.launch_session_id] : []),
        sessions: [...latest.values()],
        required_next_step: null,
      };
    }
    if (now() >= deadline) break;
    await sleep(Math.max(0, pollMs));
  }

  const evidence: WorkspaceLaunchAttachmentEvidence = {
    schema: 'narada.workspace_launch.attachment.v1',
    status: 'handoff_pending',
    exact_session: false,
    launch_session_ids: plans.flatMap((plan) => plan.launch_session_id ? [plan.launch_session_id] : []),
    sessions: [...latest.values()],
    required_next_step: 'Inspect the launch artifact, confirm the exact launch session is starting, then retry attachment.',
  };
  throw new WorkspaceLaunchAttachmentError(evidence);
}

async function probeWorkspaceLaunchHealth(endpoint: string, timeoutMs = 2_000): Promise<WorkspaceLaunchHealthProbeResult> {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
    if (!response.ok) return { status: 'unavailable', session_id: null };
    const body = await response.json() as { status?: unknown; session_id?: unknown; agent_id?: unknown; site_id?: unknown };
    return {
      status: body.status === 'healthy' ? 'healthy' : 'unavailable',
      session_id: typeof body.session_id === 'string' ? body.session_id : null,
      agent_id: typeof body.agent_id === 'string' ? body.agent_id : null,
      site_id: typeof body.site_id === 'string' ? body.site_id : null,
    };
  } catch {
    return { status: 'unavailable', session_id: null };
  }
}

function sessionLaunchSessionId(session: NarsSessionObservation): string | null {
  return session.launch_session_id
    ?? session.record?.launch_session_id
    ?? session.process_ownership?.launch_session_id
    ?? session.record?.process_ownership?.launch_session_id
    ?? null;
}

function sessionIdFromObservation(session: NarsSessionObservation): string | null {
  return session.session_id ?? session.runtime_session_id ?? session.nars_session_id ?? session.carrier_session_id ?? null;
}

function samePath(left: string | null | undefined, right: string): boolean {
  if (!left) return false;
  return left.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
    === right.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
}
