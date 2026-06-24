import { join, resolve, basename } from 'node:path';

/**
 * Build canonical carrier runtime paths from siteRoot and session.
 * @param {string} siteRoot
 * @param {string} session
 * @returns {{ naradaDir: string, sessionDir: string, sessionPath: string, eventsPath: string }}
 */
export function buildCarrierRuntimePaths(siteRoot, session) {
  const resolvedSiteRoot = resolve(siteRoot ?? process.env.NARADA_SITE_ROOT ?? process.cwd());
  const naradaDir = basename(resolvedSiteRoot) === '.narada' ? resolvedSiteRoot : join(resolvedSiteRoot, '.narada');
  const sessionDir = join(naradaDir, 'crew', 'nars-sessions', session);
  return {
    naradaDir,
    sessionDir,
    sessionPath: join(sessionDir, 'session.jsonl'),
    eventsPath: join(sessionDir, 'events.jsonl'),
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
 * @returns {CarrierRuntimeContext}
 */
export function createCarrierRuntimeContext({
  identity,
  session,
  siteRoot,
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
    naradaDir: naradaDir ?? paths.naradaDir,
    sessionPath: paths.sessionPath,
    eventsPath: paths.eventsPath,
    intelligenceProvider,
    providerSettings: Object.freeze({
      model: providerSettings.model ?? process.env.CODEX_MODEL ?? 'gpt-5',
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

/**
 * Normalize a partial or legacy config object into a full carrier runtime context.
 * Keeps backward compatibility with the flat config shape used by runCarrierServerMode.
 *
 * @param {object} input
 * @returns {CarrierRuntimeContext}
 */
export function normalizeCarrierRuntimeContext(input = {}) {
  if (
    input
    && typeof input === 'object'
    && input.identity
    && input.session
    && !Object.prototype.hasOwnProperty.call(input, 'sessionSettings')
    && !Object.prototype.hasOwnProperty.call(input, 'transcriptDisplaySettings')
  ) {
    return createCarrierRuntimeContext(input);
  }
  // Legacy flat config support
  const {
    identity,
    session,
    siteRoot,
    sessionPath,
    eventsPath,
    intelligenceProvider,
    narsDelegatedAuthorityHandoff,
    transcriptDisplaySettings,
    sessionSettings,
    operationHeartbeatDirectiveEnabled,
    operationHeartbeatDirectiveIntervalMs,
    operationHeartbeatDirectiveInitialDelayMs,
    healthUrl,
    eventStreamUrl,
  } = input;
  return createCarrierRuntimeContext({
    identity,
    session,
    siteRoot,
    sessionPath,
    eventsPath,
    intelligenceProvider,
    narsDelegatedAuthorityHandoff,
    providerSettings: sessionSettings,
    displaySettings: transcriptDisplaySettings,
    operationHeartbeatDirectiveEnabled,
    operationHeartbeatDirectiveIntervalMs,
    operationHeartbeatDirectiveInitialDelayMs,
    healthUrl,
    eventStreamUrl,
  });
}
