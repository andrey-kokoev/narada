import {
  hostKey,
  refusal,
  runtimeTargetKey,
  validateHostKey,
  validateRuntimeTarget,
  type HostFleetRefusal,
  type HostFleetOverview,
  type HostKey,
  type HostRecord,
  type HostRuntimeSession,
  type RuntimeTarget,
} from './contract.js';

export interface RuntimeTargetSelector extends HostKey {
  site_id: string;
  agent_id: string;
  runtime_session_id?: string;
}

export type RuntimeTargetResolution =
  | { status: 'resolved'; target: RuntimeTarget; candidate: HostRuntimeSession }
  | { status: 'refused'; refusal: HostFleetRefusal };

export function resolveRuntimeTarget(
  candidates: readonly HostRuntimeSession[],
  selector: RuntimeTargetSelector,
): RuntimeTargetResolution {
  const host = validateHostKey(selector);
  const matching = candidates.filter((candidate) => {
    const target = validateRuntimeTarget(candidate.target);
    return target.host_id === host.host_id
      && target.host_instance_id === host.host_instance_id
      && target.site_id === selector.site_id
      && target.agent_id === selector.agent_id
      && (selector.runtime_session_id === undefined || target.runtime_session_id === selector.runtime_session_id);
  });
  if (matching.length === 0) {
    return {
      status: 'refused',
      refusal: refusal({ reason: 'runtime_target_not_found', host }),
    };
  }
  if (matching.length > 1) {
    const targets = matching.map((candidate) => validateRuntimeTarget(candidate.target));
    return {
      status: 'refused',
      refusal: refusal({ reason: 'runtime_target_ambiguous', host, candidates: targets }),
    };
  }
  const candidate = matching[0]!;
  return { status: 'resolved', target: validateRuntimeTarget(candidate.target), candidate };
}

export function projectHostFleetOverview(hosts: readonly HostRecord[], generatedAt = new Date().toISOString()): HostFleetOverview {
  return {
    schema: 'narada.host_fleet.overview.v1',
    generated_at: generatedAt,
    hosts: [...hosts].map((host) => ({ ...host })),
  };
}

export function hostScopedTargetLabel(target: RuntimeTarget): string {
  const normalized = validateRuntimeTarget(target);
  return `${normalized.host_id}@${normalized.host_instance_id} / ${normalized.site_id} / ${normalized.agent_id} / ${normalized.runtime_session_id}`;
}

export function candidateHostKeys(candidates: readonly HostRuntimeSession[]): string[] {
  return [...new Set(candidates.map((candidate) => hostKey(validateHostKey(candidate.target))))];
}

export function targetIdentity(target: RuntimeTarget): string {
  return runtimeTargetKey(target);
}
