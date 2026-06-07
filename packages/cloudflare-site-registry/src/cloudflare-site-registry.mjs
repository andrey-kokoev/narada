export const CLOUDFLARE_SITE_REGISTRY_SCHEMA = 'narada.cloudflare_site_registry.v1';
export const CLOUDFLARE_SITE_REGISTRY_ADAPTER_KIND = 'cloudflare-d1-site-registry';

const SITE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,127}$/;
const SITE_ROLES = new Set(['owner', 'maintainer', 'operator', 'viewer']);
const BINDING_ROLES = new Set(['owner', 'maintainer', 'operator']);

export function createCloudflareSiteRegistryAdapter(env = {}, { now = () => new Date().toISOString() } = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return null;
  const registry = createD1CloudflareSiteRegistry(db, { now });
  return {
    posture: 'configured',
    adapter_kind: CLOUDFLARE_SITE_REGISTRY_ADAPTER_KIND,
    schema: CLOUDFLARE_SITE_REGISTRY_SCHEMA,
    registry,
    async handle(request) {
      return registry.handle(request);
    },
    async validateCarrierSiteBinding(context) {
      return registry.validateCarrierSiteBinding(context);
    },
  };
}

export function createD1CloudflareSiteRegistry(db, { now = () => new Date().toISOString() } = {}) {
  let initialized = false;
  async function ensureSchema() {
    if (initialized) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_sites (
      site_id TEXT PRIMARY KEY,
      site_ref TEXT,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL
    )`).run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS cloudflare_sites_site_ref_idx ON cloudflare_sites(site_ref) WHERE site_ref IS NOT NULL').run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_memberships (
      site_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, principal_id)
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_memberships_principal_idx ON cloudflare_site_memberships(principal_id, status)').run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_settings (
      site_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_principal_id TEXT NOT NULL,
      PRIMARY KEY (site_id, setting_key)
    )`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_carrier_sessions (
      carrier_session_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      bound_by_principal_id TEXT NOT NULL,
      binding_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_carrier_sessions_site_idx ON cloudflare_site_carrier_sessions(site_id, created_at)').run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_authority_events (
      event_id TEXT PRIMARY KEY,
      event_kind TEXT NOT NULL,
      site_id TEXT,
      carrier_session_id TEXT,
      principal_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      evidence_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_authority_events_site_idx ON cloudflare_site_authority_events(site_id, recorded_at)').run();
    initialized = true;
  }

  async function handle(request = {}) {
    const operation = String(request.operation ?? '').trim();
    const params = request.params ?? {};
    const principal = normalizePrincipal(request.principal);
    if (operation === 'site.create') return createSite({ ...params, principal });
    if (operation === 'site.read') return readSite({ ...params, principal });
    if (operation === 'site.list') return listSites({ ...params, principal });
    if (operation === 'site.settings.put') return putSiteSetting({ ...params, principal });
    if (operation === 'site.carrier_session.bind') return validateCarrierSiteBinding({ ...params, principal });
    return { ok: false, code: 'unsupported_site_registry_operation', operation };
  }

  async function createSite({ site_id, site_ref = null, display_name = null, principal, request_id = null } = {}) {
    await ensureSchema();
    const normalizedPrincipal = normalizePrincipal(principal);
    const siteId = normalizeSiteId(site_id);
    if (!siteId) return denied('site_create_rejected', { site_id, principal: normalizedPrincipal, reason: 'invalid_site_id', request_id });
    const displayName = String(display_name ?? siteId).trim();
    if (!displayName) return denied('site_create_rejected', { site_id: siteId, principal: normalizedPrincipal, reason: 'invalid_display_name', request_id });
    const existing = await findSite(siteId);
    if (existing) return { ok: true, action: 'already_exists', site: publicSite(existing), membership: await findMembership(siteId, normalizedPrincipal.principal_id) };
    const timestamp = now();
    await db.prepare(`INSERT INTO cloudflare_sites (
      site_id, site_ref, display_name, status, created_at, updated_at, created_by_principal_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      siteId,
      normalizeOptionalString(site_ref),
      displayName,
      'active',
      timestamp,
      timestamp,
      normalizedPrincipal.principal_id,
    ).run();
    await db.prepare(`INSERT INTO cloudflare_site_memberships (
      site_id, principal_id, role, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`).bind(
      siteId,
      normalizedPrincipal.principal_id,
      'owner',
      'active',
      timestamp,
      timestamp,
    ).run();
    const site = await findSite(siteId);
    const membership = await findMembership(siteId, normalizedPrincipal.principal_id);
    await recordAuthorityEvent({
      event_kind: 'site_created',
      site_id: siteId,
      principal_id: normalizedPrincipal.principal_id,
      action: 'admit',
      reason: 'site_created',
      evidence: { request_id, site_id: siteId, role: 'owner' },
    });
    return { ok: true, action: 'created', site: publicSite(site), membership: publicMembership(membership) };
  }

  async function readSite({ site_id, principal } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    if (!siteId) return { ok: false, code: 'invalid_site_id' };
    const site = await findSite(siteId);
    if (!site) return { ok: false, code: 'site_not_found', site_id: siteId };
    const membership = await findMembership(siteId, normalizePrincipal(principal).principal_id);
    if (!membership || membership.status !== 'active') return { ok: false, code: 'site_authority_denied', site_id: siteId };
    return { ok: true, site: publicSite(site), membership: publicMembership(membership), settings: await listSettings(siteId) };
  }

  async function listSites({ principal } = {}) {
    await ensureSchema();
    const principalId = normalizePrincipal(principal).principal_id;
    const result = await db.prepare(`SELECT s.* FROM cloudflare_sites s
      JOIN cloudflare_site_memberships m ON m.site_id = s.site_id
      WHERE m.principal_id = ? AND m.status = 'active' AND s.status = 'active'
      ORDER BY s.created_at ASC`).bind(principalId).all();
    return { ok: true, sites: (result.results ?? []).map(publicSite) };
  }

  async function putSiteSetting({ site_id, setting_key, value, principal } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    const principalId = normalizePrincipal(principal).principal_id;
    const membership = siteId ? await findMembership(siteId, principalId) : null;
    if (!membership || !BINDING_ROLES.has(membership.role) || membership.status !== 'active') {
      return { ok: false, code: 'site_authority_denied', site_id: siteId ?? null };
    }
    const key = String(setting_key ?? '').trim();
    if (!key) return { ok: false, code: 'invalid_setting_key' };
    const timestamp = now();
    await db.prepare(`INSERT INTO cloudflare_site_settings (
      site_id, setting_key, value_json, updated_at, updated_by_principal_id
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(site_id, setting_key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at,
      updated_by_principal_id = excluded.updated_by_principal_id`).bind(
      siteId,
      key,
      JSON.stringify(value ?? null),
      timestamp,
      principalId,
    ).run();
    await recordAuthorityEvent({
      event_kind: 'site_setting_updated',
      site_id: siteId,
      principal_id: principalId,
      action: 'admit',
      reason: 'site_setting_updated',
      evidence: { setting_key: key },
    });
    return { ok: true, site_id: siteId, setting_key: key };
  }

  async function validateCarrierSiteBinding({ site_id, site_ref = null, carrier_session_id, agent_id, principal, request_id = null } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    const principalId = normalizePrincipal(principal).principal_id;
    const carrierSessionId = String(carrier_session_id ?? '').trim();
    const agentId = String(agent_id ?? '').trim();
    if (!siteId) return denied('carrier_site_binding_rejected', { site_id, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'invalid_site_id', request_id });
    if (!carrierSessionId) return denied('carrier_site_binding_rejected', { site_id: siteId, principal_id: principalId, reason: 'missing_carrier_session_id', request_id });
    if (!agentId) return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'missing_agent_id', request_id });
    const site = await findSite(siteId);
    if (!site || site.status !== 'active') return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'site_not_found', request_id });
    if (site_ref && site.site_ref && String(site.site_ref) !== String(site_ref)) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'site_ref_mismatch', request_id });
    }
    const membership = await findMembership(siteId, principalId);
    if (!membership || membership.status !== 'active' || !BINDING_ROLES.has(membership.role)) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'site_authority_denied', request_id });
    }
    const existing = await findCarrierSessionBinding(carrierSessionId);
    if (existing && existing.site_id !== siteId) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'carrier_session_site_mismatch', request_id });
    }
    const timestamp = now();
    if (!existing) {
      await db.prepare(`INSERT INTO cloudflare_site_carrier_sessions (
        carrier_session_id, site_id, agent_id, bound_by_principal_id, binding_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        carrierSessionId,
        siteId,
        agentId,
        principalId,
        'active',
        timestamp,
        timestamp,
      ).run();
    }
    await recordAuthorityEvent({
      event_kind: 'carrier_site_binding_admitted',
      site_id: siteId,
      carrier_session_id: carrierSessionId,
      principal_id: principalId,
      action: 'admit',
      reason: existing ? 'carrier_site_binding_reused' : 'carrier_site_binding_created',
      evidence: { request_id, site_id: siteId, carrier_session_id: carrierSessionId, agent_id: agentId, role: membership.role },
    });
    return {
      ok: true,
      action: existing ? 'already_bound' : 'bound',
      site: publicSite(site),
      membership: publicMembership(membership),
      binding: await findCarrierSessionBinding(carrierSessionId),
      evidence: {
        schema: CLOUDFLARE_SITE_REGISTRY_SCHEMA,
        action: 'admit',
        reason: existing ? 'carrier_site_binding_reused' : 'carrier_site_binding_created',
        site_id: siteId,
        carrier_session_id: carrierSessionId,
        principal_id: principalId,
      },
    };
  }

  async function denied(eventKind, { site_id = null, carrier_session_id = null, principal = null, principal_id = null, reason, request_id = null } = {}) {
    const normalizedPrincipalId = principal_id ?? normalizePrincipal(principal).principal_id;
    await recordAuthorityEvent({
      event_kind: eventKind,
      site_id: normalizeSiteId(site_id),
      carrier_session_id: carrier_session_id || null,
      principal_id: normalizedPrincipalId,
      action: 'deny',
      reason,
      evidence: { request_id, reason },
    });
    return { ok: false, code: reason, action: 'deny', reason };
  }

  async function findSite(siteId) {
    return db.prepare('SELECT * FROM cloudflare_sites WHERE site_id = ?').bind(siteId).first();
  }

  async function findMembership(siteId, principalId) {
    return db.prepare('SELECT * FROM cloudflare_site_memberships WHERE site_id = ? AND principal_id = ?').bind(siteId, principalId).first();
  }

  async function findCarrierSessionBinding(carrierSessionId) {
    return db.prepare('SELECT * FROM cloudflare_site_carrier_sessions WHERE carrier_session_id = ?').bind(carrierSessionId).first();
  }

  async function listSettings(siteId) {
    const result = await db.prepare('SELECT setting_key, value_json FROM cloudflare_site_settings WHERE site_id = ? ORDER BY setting_key ASC').bind(siteId).all();
    return Object.fromEntries((result.results ?? []).map((row) => [row.setting_key, parseJson(row.value_json)]));
  }

  async function recordAuthorityEvent({ event_kind, site_id = null, carrier_session_id = null, principal_id, action, reason = null, evidence = {} }) {
    const timestamp = now();
    const eventId = `${event_kind}:${site_id ?? 'none'}:${carrier_session_id ?? 'none'}:${principal_id}:${timestamp}:${Math.random().toString(36).slice(2)}`;
    await db.prepare(`INSERT INTO cloudflare_site_authority_events (
      event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      eventId,
      event_kind,
      site_id,
      carrier_session_id,
      principal_id,
      action,
      reason,
      JSON.stringify(evidence),
      timestamp,
    ).run();
  }

  return {
    schema: CLOUDFLARE_SITE_REGISTRY_SCHEMA,
    adapter_kind: CLOUDFLARE_SITE_REGISTRY_ADAPTER_KIND,
    ensureSchema,
    handle,
    createSite,
    readSite,
    listSites,
    putSiteSetting,
    validateCarrierSiteBinding,
  };
}

export function normalizeSiteId(value) {
  const siteId = String(value ?? '').trim();
  return SITE_ID_PATTERN.test(siteId) ? siteId : null;
}

export function normalizePrincipal(principal = {}) {
  const principalId = String(principal?.principal_id ?? principal?.user_id ?? 'anonymous').trim() || 'anonymous';
  return { ...principal, principal_id: principalId };
}

function normalizeOptionalString(value) {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  return normalized || null;
}

function publicSite(site) {
  if (!site) return null;
  return {
    site_id: String(site.site_id),
    site_ref: site.site_ref ?? null,
    display_name: String(site.display_name),
    status: String(site.status),
    created_at: String(site.created_at),
    updated_at: String(site.updated_at),
    created_by_principal_id: String(site.created_by_principal_id),
  };
}

function publicMembership(membership) {
  if (!membership) return null;
  return {
    site_id: String(membership.site_id),
    principal_id: String(membership.principal_id),
    role: SITE_ROLES.has(membership.role) ? membership.role : String(membership.role),
    status: String(membership.status),
    created_at: String(membership.created_at),
    updated_at: String(membership.updated_at),
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
