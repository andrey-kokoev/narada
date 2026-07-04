import { resolveNaradaSitePaths } from '@narada2/site-paths';

/**
 * Build canonical carrier runtime paths from siteRoot and session.
 * @param {string} siteRoot
 * @param {string} session
 * @returns {{ naradaDir: string, sessionDir: string, sessionPath: string, eventsPath: string }}
 */
export function buildCarrierRuntimePaths(siteRoot, session) {
  const paths = resolveNaradaSitePaths({
    siteRoot,
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
 * @param {string} options.siteRoot Site root. Required unless `NARADA_SITE_ROOT` is set.
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
 * @param {object|null} [options.siteConfig]
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
  siteConfig = null,
  operatorSurfaceKind = process.env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli',
  authorityRuntimeHost = process.env.NARADA_AUTHORITY_RUNTIME_HOST ?? 'local',
} = {}) {
  if (!identity) throw new TypeError('identity is required');
  if (!session) throw new TypeError('session is required');
  const resolvedSiteRoot = siteRoot ?? process.env.NARADA_SITE_ROOT;
  if (!resolvedSiteRoot) throw new TypeError('siteRoot is required');

  const paths = sessionPath && eventsPath
    ? { naradaDir: naradaDir ?? null, sessionDir: null, sessionPath, eventsPath }
    : buildCarrierRuntimePaths(resolvedSiteRoot, session);
  const resolvedNaradaDir = naradaDir ?? paths.naradaDir;
  const resolvedSiteId = siteId ?? process.env.NARADA_SITE_ID ?? null;
  const resolvedSiteConfig = normalizeSiteConfig(siteConfig ?? parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG), {
    siteId: resolvedSiteId,
    siteRoot: resolvedSiteRoot,
    naradaDir: resolvedNaradaDir,
    workspaceRoot: process.env.NARADA_WORKSPACE_ROOT ?? null,
  });

  return Object.freeze({
    identity,
    session,
    siteRoot: resolvedSiteRoot,
    siteId: resolvedSiteId,
    naradaDir: resolvedNaradaDir,
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
    siteConfig: Object.freeze(resolvedSiteConfig),
  });
}

function parseSiteConfigEnv(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => String(entry)))]
    : [];
}

function normalizeSiteConfig(config, defaults) {
  const record = config && typeof config === 'object' ? config : {};
  return {
    schema: 'narada.nars.site_config.v1',
    site_id: typeof record.site_id === 'string' && record.site_id ? record.site_id : defaults.siteId,
    site_root: typeof record.site_root === 'string' && record.site_root ? record.site_root : defaults.siteRoot,
    narada_root: typeof record.narada_root === 'string' && record.narada_root ? record.narada_root : defaults.naradaDir,
    workspace_root: typeof record.workspace_root === 'string' && record.workspace_root ? record.workspace_root : defaults.workspaceRoot,
    pc_site_root: typeof record.pc_site_root === 'string' && record.pc_site_root ? record.pc_site_root : null,
    mcp_scope: typeof record.mcp_scope === 'string' && record.mcp_scope ? record.mcp_scope : null,
    mcp_loci: normalizeStringArray(record.mcp_loci),
    allowed_roots: normalizeStringArray(record.allowed_roots),
  };
}

