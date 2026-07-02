import { resolveNaradaSitePaths } from '@narada2/site-paths';

/**
 * Build canonical carrier runtime paths from siteRoot and session.
 * @param {string} siteRoot
 * @param {string} session
 * @returns {{ naradaDir: string, sessionDir: string, sessionPath: string, eventsPath: string }}
 */
export function buildCarrierRuntimePaths(siteRoot, session) {
  const paths = resolveNaradaSitePaths({
    siteRoot: siteRoot ?? process.env.NARADA_SITE_ROOT ?? process.cwd(),
    sessionId: session,
  });
  return {
    naradaDir: paths.siteAuthorityRoot,
    sessionDir: paths.narsSessionDir,
    sessionPath: paths.narsSessionPath,
    eventsPath: paths.narsEventsPath,
  };
}

/**
 * Create a carrier runtime context object explicitly, without relying on
 * module-level globals. This is the seam used by NARS standalone extraction
 * to move runtime functions out of agent-cli.
 *
 * @param {object} options
 * @param {string} options.identity
 * @param {string} options.session
 * @param {string} [options.siteRoot]
 * @param {string} [options.siteId]
 * @param {string} [options.naradaDir]
 * @param {string} [options.sessionPath]
 * @param {string} [options.eventsPath]
 * @param {string} [options.intelligenceProvider]
 * @param {object} [options.narsDelegatedAuthorityHandoff]
 * @param {object} [options.providerSettings]
 * @param {object} [options.displaySettings]
 * @param {boolean} [options.operationHeartbeatDirectiveEnabled]
 * @param {number} [options.operationHeartbeatDirectiveIntervalMs]
 * @param {number} [options.operationHeartbeatDirectiveInitialDelayMs]
 * @param {string|null} [options.healthUrl]
 * @param {string|null} [options.eventStreamUrl]
 * @param {string} [options.operatorSurfaceKind]
 * @param {string} [options.authorityRuntimeHost]
 * @returns {CarrierRuntimeContext}
 */
export function createCarrierRuntimeContext({
  identity,
  session,
  siteRoot,
  siteId,
  naradaDir,
  sessionPath,
  eventsPath,
  intelligenceProvider = 'codex-subscription',
  narsDelegatedAuthorityHandoff = null,
  providerSettings = {},
  displaySettings = {},
  operationHeartbeatDirectiveEnabled = false,
  operationHeartbeatDirectiveIntervalMs = 60000,
  operationHeartbeatDirectiveInitialDelayMs = 60000,
  healthUrl = null,
  eventStreamUrl = null,
  operatorSurfaceKind = process.env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli',
  authorityRuntimeHost = process.env.NARADA_AUTHORITY_RUNTIME_HOST ?? 'local',
} = {}) {
  if (!identity) throw new TypeError('identity is required');
  if (!session) throw new TypeError('session is required');

  const paths = sessionPath && eventsPath
    ? { naradaDir: naradaDir ?? null, sessionDir: null, sessionPath, eventsPath }
    : buildCarrierRuntimePaths(siteRoot, session);

  return Object.freeze({
    identity,
    session,
    siteRoot: siteRoot ?? process.env.NARADA_SITE_ROOT ?? process.cwd(),
    siteId: siteId ?? process.env.NARADA_SITE_ID ?? null,
    naradaDir: naradaDir ?? paths.naradaDir,
    sessionPath: paths.sessionPath,
    eventsPath: paths.eventsPath,
    intelligenceProvider,
    operatorSurfaceKind,
    authorityRuntimeHost,
    providerSettings: Object.freeze({
      model: providerSettings.model ?? process.env.CODEX_MODEL ?? process.env.NARADA_CODEX_MODEL ?? null,
      thinking: providerSettings.thinking ?? process.env.NARADA_AI_THINKING ?? 'medium',
      stream: providerSettings.stream ?? true,
      goal: providerSettings.goal ?? null,
    }),
    displaySettings: Object.freeze({
      toolOutputs: displaySettings.toolOutputs ?? true,
      observerMuted: displaySettings.observerMuted ?? false,
    }),
    narsDelegatedAuthorityHandoff,
    operationHeartbeatDirectiveEnabled,
    operationHeartbeatDirectiveIntervalMs,
    operationHeartbeatDirectiveInitialDelayMs,
    healthUrl,
    eventStreamUrl,
  });
}

