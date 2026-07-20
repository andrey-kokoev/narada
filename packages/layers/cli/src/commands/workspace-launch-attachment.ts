import { discoverNarsSessions, type NarsSessionObservation } from '@narada2/nars-session-core/session-index';
import type { WorkspaceLaunchAgentPlan, WorkspaceLaunchAttachmentEvidence } from './workspace-launch-types.js';

export const WORKSPACE_LAUNCH_ATTACHMENT_TIMEOUT_MS = 30_000;
export const WORKSPACE_LAUNCH_ATTACHMENT_POLL_MS = 100;

export class WorkspaceLaunchAttachmentError extends Error {
  readonly evidence: WorkspaceLaunchAttachmentEvidence;

  constructor(evidence: WorkspaceLaunchAttachmentEvidence) {
    super(`workspace_launch_attachment_not_ready: ${evidence.sessions.map((session) => session.reason ?? 'session_not_ready').join('; ')}`);
    this.name = 'WorkspaceLaunchAttachmentError';
    this.evidence = evidence;
  }
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
        latest.set(launchSessionId, {
          launch_session_id: launchSessionId,
          session_id: null,
          health_session_id: null,
          health_identity_match: false,
          site_root: plan.site_root,
          event_endpoint: null,
          health_endpoint: null,
          health_status: 'unavailable',
          attempts: attempt,
          reason: discoveryError ?? 'session_not_indexed',
        });
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
