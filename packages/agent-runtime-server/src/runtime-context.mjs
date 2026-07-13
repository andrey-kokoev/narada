import { buildAgentIdentityRefV2, normalizeAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { resolveNaradaSitePaths } from '@narada2/site-paths';

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Build only the launch binding required by the server and session core. */
export function createNarsRuntimeContext({
  identity,
  agentIdentityRef: inputAgentIdentityRef = null,
  session,
  siteRoot,
  siteId = null,
  sessionPath = null,
  eventsPath = null,
  intelligenceProvider = process.env.NARADA_INTELLIGENCE_PROVIDER,
  providerSettings = {},
  ...rest
} = {}) {
  if (!identity) throw new TypeError('identity is required');
  if (!session) throw new TypeError('session is required');
  if (!siteRoot) throw new TypeError('siteRoot is required');
  if (!intelligenceProvider) throw new TypeError('intelligenceProvider is required');
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
  const maxToolRounds = normalizeMaxToolRounds(providerSettings.maxToolRounds ?? process.env.NARADA_MAX_TOOL_ROUNDS);
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
    intelligenceProvider,
    maxToolRounds,
    launchSessionId: optionalString(rest.launchSessionId),
    processOwnership: optionalString(rest.processOwnership),
    processRole: optionalString(rest.processRole),
    createdByPid: rest.createdByPid ?? null,
    providerSettings: Object.freeze({
      model: providerSettings.model ?? process.env.NARADA_AI_MODEL ?? null,
      apiKey: providerSettings.apiKey ?? process.env.NARADA_AI_API_KEY ?? null,
      baseUrl: providerSettings.baseUrl ?? process.env.NARADA_AI_BASE_URL ?? null,
      thinking: providerSettings.thinking ?? process.env.NARADA_AI_THINKING ?? 'medium',
      stream: providerSettings.stream !== false,
      goal: providerSettings.goal ?? null,
      runtimeBinding: providerSettings.runtimeBinding ?? null,
    }),
  });
}

function normalizeMaxToolRounds(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return 8;
  return Math.min(64, Math.max(1, Math.trunc(numeric)));
}
