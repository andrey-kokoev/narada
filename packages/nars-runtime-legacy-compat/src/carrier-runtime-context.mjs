import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAgentIdentityRefV2, normalizeAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { resolveProviderRuntimeDefaults } from './provider-runtime-defaults.mjs';

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
 * @param {string} [options.launchSessionId]
 * @param {string} [options.processOwnership]
 * @param {string} [options.processRole]
 * @param {number|string} [options.createdByPid]
 * @returns {CarrierRuntimeContext}
 */
export function createCarrierRuntimeContext({
  identity,
  agentIdentityRef: inputAgentIdentityRef = null,
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
  launchSessionId = process.env.NARADA_LAUNCH_SESSION_ID ?? null,
  processOwnership = process.env.NARADA_PROCESS_OWNERSHIP ?? null,
  processRole = process.env.NARADA_PROCESS_ROLE ?? null,
  createdByPid = process.env.NARADA_CREATED_BY_PID ?? null,
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
  const resolvedIdentityRef = resolveAgentIdentityRef(identity, {
    site_id: resolvedSiteId,
    role: process.env.NARADA_AGENT_ROLE ?? null,
  });
  const agentIdentityRef = inputAgentIdentityRef && typeof inputAgentIdentityRef === 'object' && !Array.isArray(inputAgentIdentityRef)
    ? normalizeAgentIdentityRefV2(inputAgentIdentityRef, {
      site_id: resolvedSiteId,
      role: process.env.NARADA_AGENT_ROLE ?? null,
      agent_id: identity,
    }) ?? buildAgentIdentityRefV2({
      identity_scope: resolvedSiteId ? { kind: 'narada_site', site_id: resolvedSiteId } : { kind: 'unscoped' },
      local_agent_id: identity,
      role: process.env.NARADA_AGENT_ROLE ?? identity,
      legacy_agent_id: identity,
    })
    : resolvedIdentityRef.status === 'resolved'
      ? resolvedIdentityRef.value
      : buildAgentIdentityRefV2({
        identity_scope: resolvedSiteId ? { kind: 'narada_site', site_id: resolvedSiteId } : { kind: 'unscoped' },
        local_agent_id: identity,
        role: process.env.NARADA_AGENT_ROLE ?? identity,
        legacy_agent_id: identity,
      });
  const resolvedSiteConfig = normalizeSiteConfig(siteConfig ?? parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG), {
    siteId: resolvedSiteId,
    siteRoot: resolvedSiteRoot,
    naradaDir: resolvedNaradaDir,
    workspaceRoot: process.env.NARADA_WORKSPACE_ROOT ?? null,
  });
  const providerDefaults = resolveProviderRuntimeDefaults(intelligenceProvider);
  const resolvedLaunchSessionId = normalizeOptionalString(launchSessionId) ?? normalizeOptionalString(process.env.NARADA_LAUNCH_SESSION_ID);
  const resolvedProcessOwnership = normalizeOptionalString(processOwnership) ?? normalizeOptionalString(process.env.NARADA_PROCESS_OWNERSHIP);
  const resolvedProcessRole = normalizeOptionalString(processRole) ?? normalizeOptionalString(process.env.NARADA_PROCESS_ROLE);
  const resolvedCreatedByPid = normalizeOptionalInteger(createdByPid) ?? normalizeOptionalInteger(process.env.NARADA_CREATED_BY_PID);

  return Object.freeze({
    identity,
    agentIdentityRef,
    session,
    siteRoot: resolvedSiteRoot,
    siteId: resolvedSiteId,
    naradaDir: resolvedNaradaDir,
    sessionPath: paths.sessionPath,
    eventsPath: paths.eventsPath,
    intelligenceProvider,
    operatorSurfaceKind,
    authorityRuntimeHost,
    launchSessionId: resolvedLaunchSessionId,
    processOwnership: resolvedProcessOwnership,
    processRole: resolvedProcessRole,
    createdByPid: resolvedCreatedByPid,
    providerSettings: Object.freeze({
      model: providerSettings.model ?? providerDefaults.model,
      availableModels: providerSettings.availableModels ?? providerDefaults.availableModels,
      modelCatalog: providerSettings.modelCatalog ?? providerDefaults.modelCatalog,
      thinking: providerSettings.thinking ?? providerDefaults.thinking,
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

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeOptionalInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
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
  const discoveredAllowedRoots = discoverAllowedRootsFromSite(defaults);
  return {
    schema: 'narada.nars.site_config.v1',
    site_id: typeof record.site_id === 'string' && record.site_id ? record.site_id : defaults.siteId,
    site_root: typeof record.site_root === 'string' && record.site_root ? record.site_root : defaults.siteRoot,
    narada_root: typeof record.narada_root === 'string' && record.narada_root ? record.narada_root : defaults.naradaDir,
    workspace_root: typeof record.workspace_root === 'string' && record.workspace_root ? record.workspace_root : defaults.workspaceRoot,
    pc_site_root: typeof record.pc_site_root === 'string' && record.pc_site_root ? record.pc_site_root : null,
    mcp_scope: typeof record.mcp_scope === 'string' && record.mcp_scope ? record.mcp_scope : null,
    mcp_loci: normalizeStringArray(record.mcp_loci),
    allowed_roots: normalizeStringArray([
      ...normalizeStringArray(record.allowed_roots),
      ...discoveredAllowedRoots,
    ]),
  };
}

function discoverAllowedRootsFromSite({ siteRoot, naradaDir }) {
  return normalizeStringArray([
    ...readSiteAllowedRoots(naradaDir),
    ...readMcpFabricAllowedRoots(join(siteRoot, '.ai', 'mcp')),
    ...(naradaDir && naradaDir !== siteRoot ? readMcpFabricAllowedRoots(join(naradaDir, '.ai', 'mcp')) : []),
  ]);
}

function readSiteAllowedRoots(naradaDir) {
  if (!naradaDir) return [];
  const record = readJsonFile(join(naradaDir, 'allowed-roots.json'));
  if (!record || typeof record !== 'object') return [];
  return normalizeStringArray([
    ...normalizeStringArray(record.allowed_roots),
    ...normalizeStringArray(record.extra_allowed_roots),
  ]);
}

function readMcpFabricAllowedRoots(mcpDir) {
  if (!mcpDir || !existsSync(mcpDir)) return [];
  const roots = [];
  for (const entry of readdirSync(mcpDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const record = readJsonFile(join(mcpDir, entry.name));
    const servers = record?.mcpServers ?? record?.servers ?? {};
    if (!servers || typeof servers !== 'object') continue;
    for (const server of Object.values(servers)) {
      const args = Array.isArray(server?.args) ? server.args : [];
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] !== '--allowed-root' || index + 1 >= args.length) continue;
        roots.push(String(args[index + 1]));
        index += 1;
      }
    }
  }
  return normalizeStringArray(roots);
}

function readJsonFile(path) {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
