import { buildAgentIdentityRefV2, normalizeAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { normalizeIntelligenceKernelKind } from '@narada2/nars-intelligence-kernel-contract';

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function frozenIntelligenceContext(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('intelligence must be an object');
  return Object.freeze({
    ...value,
    sites: value.sites ? Object.freeze({
      targetSite: value.sites.targetSite ? Object.freeze({ ...value.sites.targetSite }) : null,
      userSite: value.sites.userSite ? Object.freeze({ ...value.sites.userSite }) : null,
      hostSite: value.sites.hostSite ? Object.freeze({ ...value.sites.hostSite }) : null,
    }) : null,
    access: value.access ? Object.freeze({ ...value.access }) : null,
    principalBinding: value.principalBinding
      ? Object.freeze({
        ...value.principalBinding,
        actor: value.principalBinding.actor ? Object.freeze({ ...value.principalBinding.actor }) : null,
        memberships: Object.freeze([...(value.principalBinding.memberships ?? [])].map((membership) => Object.freeze({ ...membership }))),
        evidence_refs: Object.freeze([...(value.principalBinding.evidence_refs ?? [])]),
      })
      : null,
    topologyObservations: Object.freeze([...(value.topologyObservations ?? [])]),
    topologyObservationSource: value.topologyObservationSource
      ? Object.freeze({ ...value.topologyObservationSource })
      : null,
    requestedOptions: Object.freeze({ ...(value.requestedOptions ?? {}) }),
  });
}

/** Build launch/session context. Intelligence carries only canonical context and request constraints. */
export function createNarsRuntimeContext({
  identity,
  agentIdentityRef: inputAgentIdentityRef = null,
  session,
  siteRoot,
  siteId = null,
  sessionPath = null,
  eventsPath = null,
  intelligence = null,
  intelligenceKernelKind = null,
  invocationSettings = {},
  ...rest
} = {}) {
  if (!identity) throw new TypeError('identity is required');
  if (!session) throw new TypeError('session is required');
  if (!siteRoot) throw new TypeError('siteRoot is required');
  const resolvedPaths = resolveNaradaSitePaths({ siteRoot, sessionId: session });
  const paths = sessionPath && eventsPath
    ? { controlPath: resolvedPaths.narsControlPath, sessionPath, eventsPath }
    : {
      controlPath: resolvedPaths.narsControlPath,
      sessionPath: resolvedPaths.narsSessionPath,
      eventsPath: resolvedPaths.narsEventsPath,
    };
  const resolved = resolveAgentIdentityRef(identity, { site_id: siteId, role: process.env.NARADA_AGENT_ROLE ?? null });
  const agentIdentityRef = inputAgentIdentityRef && typeof inputAgentIdentityRef === 'object'
    ? normalizeAgentIdentityRefV2(inputAgentIdentityRef, { site_id: siteId, agent_id: identity })
    : resolved.status === 'resolved' ? resolved.value : null;
  const invocationScope = invocationSettings.invocationScope ?? invocationSettings.invocation_scope ?? {
    schema: 'narada.ai_process_invocation_scope.v1',
    kind: 'narada_runtime_session',
    site_id: siteId,
    site_root: siteRoot,
    runtime_session_id: session,
    agent_identity_ref: agentIdentityRef,
    launch_session_id: optionalString(rest.launchSessionId),
  };
  const maxToolRounds = normalizeMaxToolRounds(invocationSettings.maxToolRounds ?? process.env.NARADA_MAX_TOOL_ROUNDS);
  const resolvedIntelligenceKernelKind = normalizeIntelligenceKernelKind(
    intelligenceKernelKind
      ?? intelligence?.intelligence_kernel_kind
      ?? intelligence?.kernel_kind
      ?? intelligence?.kernelKind
      ?? process.env.NARADA_INTELLIGENCE_KERNEL,
  );
  const normalizedIntelligence = intelligence == null
    ? null
    : {
      ...intelligence,
      intelligence_kernel_kind: resolvedIntelligenceKernelKind,
      kernel_kind: resolvedIntelligenceKernelKind,
    };
  return Object.freeze({
    ...rest,
    identity,
    agentIdentityRef: agentIdentityRef ?? buildAgentIdentityRefV2({
      identity_scope: siteId ? { kind: 'narada_site', site_id: siteId } : { kind: 'unscoped' },
      local_agent_id: identity,
      role: process.env.NARADA_AGENT_ROLE ?? identity,
      legacy_agent_id: identity,
    }),
    session,
    siteRoot,
    siteId,
    controlPath: paths.controlPath,
    sessionPath: paths.sessionPath,
    eventsPath: paths.eventsPath,
    intelligence: frozenIntelligenceContext(normalizedIntelligence),
    intelligenceKernelKind: resolvedIntelligenceKernelKind,
    intelligence_kernel_kind: resolvedIntelligenceKernelKind,
    maxToolRounds,
    launchSessionId: optionalString(rest.launchSessionId),
    processOwnership: optionalString(rest.processOwnership),
    processRole: optionalString(rest.processRole),
    createdByPid: rest.createdByPid ?? null,
    invocationSettings: Object.freeze({
      goal: invocationSettings.goal ?? null,
      invocationScope,
    }),
  });
}

function normalizeMaxToolRounds(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return 8;
  return Math.min(64, Math.max(1, Math.trunc(numeric)));
}
