export const CLOUDFLARE_SITE_REGISTRY_SCHEMA = 'narada.cloudflare_site_registry.v1';
export const CLOUDFLARE_SITE_REGISTRY_ADAPTER_KIND = 'cloudflare-d1-site-registry';

const SITE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,127}$/;
const SITE_ROLES = new Set(['owner', 'maintainer', 'operator', 'viewer']);
const BINDING_ROLES = new Set(['owner', 'maintainer', 'operator']);
const OPERATION_STATUSES = new Set(['active', 'inactive', 'archived']);

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

function publicOperation(operation) {
  if (!operation) return null;
  return {
    operation_id: String(operation.operation_id),
    site_id: String(operation.site_id),
    display_name: String(operation.display_name),
    operation_kind: String(operation.operation_kind),
    status: String(operation.status),
    created_by_principal_id: String(operation.created_by_principal_id),
    created_at: String(operation.created_at),
    updated_at: String(operation.updated_at),
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
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_operations (
      operation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      operation_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_operations_site_idx ON cloudflare_site_operations(site_id, status)').run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_carrier_sessions (
      carrier_session_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      agent_id TEXT NOT NULL,
      bound_by_principal_id TEXT NOT NULL,
      binding_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`).run();
    await addColumnIfMissing('cloudflare_site_carrier_sessions', 'operation_id TEXT');
    await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_carrier_sessions_site_idx ON cloudflare_site_carrier_sessions(site_id, created_at)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_carrier_sessions_operation_idx ON cloudflare_site_carrier_sessions(operation_id, created_at)').run();
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

  async function putOperationStatus({ operation_id, site_id, status, principal, request_id = null } = {}) {
    await ensureSchema();
    const operationId = normalizeOperationId(operation_id);
    const requestedSiteId = normalizeSiteId(site_id);
    const normalizedStatus = String(status ?? '').trim();
    const principalId = normalizePrincipal(principal).principal_id;
    if (!operationId) return { ok: false, code: 'invalid_operation_id' };
    if (!OPERATION_STATUSES.has(normalizedStatus)) return { ok: false, code: 'invalid_operation_status', site_id: requestedSiteId || null, operation_id: operationId, status: normalizedStatus || null };
    const existing = await findOperation(operationId);
    if (!existing) return { ok: false, code: 'operation_not_found', operation_id: operationId };
    if (requestedSiteId && existing.site_id !== requestedSiteId) return { ok: false, code: 'operation_site_mismatch', site_id: requestedSiteId, operation_id: operationId };
    const actorMembership = await findMembership(existing.site_id, principalId);
    if (!actorMembership || actorMembership.status !== 'active' || !['owner', 'maintainer'].includes(actorMembership.role)) {
      return denied('site_operation_status_update_rejected', {
        site_id: existing.site_id,
        operation_id: operationId,
        principal_id: principalId,
        reason: 'site_authority_denied',
        request_id,
      });
    }
    const timestamp = now();
    await db.prepare(`
      UPDATE cloudflare_site_operations
      SET status = ?, updated_at = ?
      WHERE operation_id = ?
    `).bind(normalizedStatus, timestamp, operationId).run();
    const operation = await findOperation(operationId);
    await recordAuthorityEvent({
      event_kind: 'site_operation_status_updated',
      site_id: existing.site_id,
      principal_id: principalId,
      action: 'admit',
      reason: 'site_operation_status_updated',
      evidence: {
        request_id,
        operation_id: operationId,
        previous_status: existing.status,
        status: normalizedStatus,
        actor_role: actorMembership.role,
      },
    });
    return {
      ok: true,
      action: 'status_updated',
      schema: 'narada.cloudflare_operation_status_update.v1',
      site_id: existing.site_id,
      operation_id: operationId,
      previous_status: existing.status,
      status: normalizedStatus,
      operation: publicOperation(operation),
      actor_membership: publicMembership(actorMembership),
    };
  }

  async function listOperationCarrierSessionBindings(operationId, limit = 100) {
    const result = await db.prepare(`SELECT * FROM cloudflare_site_carrier_sessions
      WHERE operation_id = ?
      ORDER BY created_at DESC
      LIMIT ?`).bind(operationId, boundedReadLimit(limit)).all();
    return (result.results ?? []).map(publicCarrierSessionBinding);
  }

  async function listOperationAuthorityEvents(siteId, operationId, limit = 100) {
    const result = await db.prepare(`SELECT * FROM cloudflare_site_authority_events
      WHERE site_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?`).bind(siteId, boundedReadLimit(limit)).all();
    return (result.results ?? [])
      .map(publicAuthorityEvent)
      .filter((event) => event?.evidence?.operation_id === operationId || event?.carrier_session_id != null);
  }

  async function createOperation({ operation_id, site_id, display_name = null, operation_kind = 'control', status = 'active', principal, request_id = null } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    const operationId = normalizeOperationId(operation_id);
    const principalId = normalizePrincipal(principal).principal_id;
    const displayName = String(display_name ?? operationId ?? '').trim();
    const normalizedKind = String(operation_kind ?? '').trim();
    const normalizedStatus = String(status ?? 'active').trim();
    if (!siteId) return { ok: false, code: 'invalid_site_id' };
    if (!operationId) return { ok: false, code: 'invalid_operation_id', site_id: siteId };
    if (!displayName) return { ok: false, code: 'invalid_operation_display_name', site_id: siteId, operation_id: operationId };
    if (!normalizedKind) return { ok: false, code: 'invalid_operation_kind', site_id: siteId, operation_id: operationId };
    if (!OPERATION_STATUSES.has(normalizedStatus)) return { ok: false, code: 'invalid_operation_status', site_id: siteId, operation_id: operationId, status: normalizedStatus || null };
    const site = await findSite(siteId);
    if (!site || site.status !== 'active') return { ok: false, code: 'site_not_found', site_id: siteId };
    const actorMembership = await findMembership(siteId, principalId);
    if (!actorMembership || actorMembership.status !== 'active' || !['owner', 'maintainer'].includes(actorMembership.role)) {
      return denied('site_operation_create_rejected', {
        site_id: siteId,
        principal_id: principalId,
        reason: 'site_authority_denied',
        request_id,
      });
    }
    const existing = await findOperation(operationId);
    const timestamp = now();
    if (existing && existing.site_id !== siteId) return { ok: false, code: 'operation_site_mismatch', site_id: siteId, operation_id: operationId };
    await db.prepare(`INSERT INTO cloudflare_site_operations (
      operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id) DO UPDATE SET
      display_name = excluded.display_name,
      operation_kind = excluded.operation_kind,
      status = excluded.status,
      updated_at = excluded.updated_at`).bind(
      operationId,
      siteId,
      displayName,
      normalizedKind,
      normalizedStatus,
      existing?.created_by_principal_id ?? principalId,
      existing?.created_at ?? timestamp,
      timestamp,
    ).run();
    const operation = await findOperation(operationId);
    await recordAuthorityEvent({
      event_kind: 'site_operation_updated',
      site_id: siteId,
      principal_id: principalId,
      action: 'admit',
      reason: existing ? 'site_operation_updated' : 'site_operation_created',
      evidence: { request_id, operation_id: operationId, operation_kind: normalizedKind, status: normalizedStatus, actor_role: actorMembership.role },
    });
    return {
      ok: true,
      action: existing ? 'updated' : 'created',
      site: publicSite(site),
      operation: publicOperation(operation),
      actor_membership: publicMembership(actorMembership),
    };
  }

  async function readOperation({ operation_id, site_id, principal, include_sessions = true, include_authority_events = true, limit = 100 } = {}) {
    await ensureSchema();
    const operationId = normalizeOperationId(operation_id);
    const requestedSiteId = normalizeSiteId(site_id);
    const principalId = normalizePrincipal(principal).principal_id;
    if (!operationId) return { ok: false, code: 'invalid_operation_id' };
    const operation = await findOperation(operationId);
    if (!operation) return { ok: false, code: 'operation_not_found', operation_id: operationId };
    if (requestedSiteId && operation.site_id !== requestedSiteId) return { ok: false, code: 'operation_site_mismatch', site_id: requestedSiteId, operation_id: operationId };
    const membership = await findMembership(operation.site_id, principalId);
    if (!membership || membership.status !== 'active') return { ok: false, code: 'site_authority_denied', site_id: operation.site_id, operation_id: operationId };
    const boundedLimit = boundedReadLimit(limit);
    return {
      ok: true,
      operation: publicOperation(operation),
      membership: publicMembership(membership),
      sessions: include_sessions ? await listOperationCarrierSessionBindings(operationId, boundedLimit) : [],
      authority_events: include_authority_events ? await listOperationAuthorityEvents(operation.site_id, operationId, boundedLimit) : [],
    };
  }

  async function listOperations({ site_id, principal, limit = 100 } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    const principalId = normalizePrincipal(principal).principal_id;
    if (!siteId) return { ok: false, code: 'invalid_site_id' };
    const membership = await findMembership(siteId, principalId);
    if (!membership || membership.status !== 'active') return { ok: false, code: 'site_authority_denied', site_id: siteId };
    return { ok: true, site_id: siteId, membership: publicMembership(membership), operations: await listSiteOperations(siteId, limit) };
  }

  async function handle(request = {}) {
    const operation = String(request.operation ?? '').trim();
    const params = request.params ?? {};
    const principal = normalizePrincipal(request.principal);
    if (operation === 'site.create') return createSite({ ...params, principal });
    if (operation === 'site.read') return readSite({ ...params, principal });
    if (operation === 'site.list') return listSites({ ...params, principal });
    if (operation === 'site.settings.put') return putSiteSetting({ ...params, principal });
    if (operation === 'site.membership.put') return putSiteMembership({ ...params, principal });
    if (operation === 'site.carrier_session.bind') return validateCarrierSiteBinding({ ...params, principal });
    if (operation === 'operation.create') return createOperation({ ...params, principal });
    if (operation === 'operation.status.put') return putOperationStatus({ ...params, principal });
    if (operation === 'operation.read') return readOperation({ ...params, principal });
    if (operation === 'operation.list') return listOperations({ ...params, principal });
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

  async function readSite({ site_id, principal, include_sessions = true, include_authority_events = true, include_memberships = true, limit = 100 } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    if (!siteId) return { ok: false, code: 'invalid_site_id' };
    const site = await findSite(siteId);
    if (!site) return { ok: false, code: 'site_not_found', site_id: siteId };
    const membership = await findMembership(siteId, normalizePrincipal(principal).principal_id);
    if (!membership || membership.status !== 'active') return { ok: false, code: 'site_authority_denied', site_id: siteId };
    const boundedLimit = boundedReadLimit(limit);
    return {
      ok: true,
      site: publicSite(site),
      membership: publicMembership(membership),
      memberships: include_memberships && BINDING_ROLES.has(membership.role) ? await listMemberships(siteId, boundedLimit) : [],
      settings: await listSettings(siteId),
      operations: await listSiteOperations(siteId, boundedLimit),
      sessions: include_sessions ? await listCarrierSessionBindings(siteId, boundedLimit) : [],
      authority_events: include_authority_events ? await listAuthorityEvents(siteId, boundedLimit) : [],
    };
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

  async function putSiteMembership({ site_id, member_principal_id, role, status = 'active', principal, request_id = null } = {}) {
    await ensureSchema();
    const siteId = normalizeSiteId(site_id);
    const actorPrincipalId = normalizePrincipal(principal).principal_id;
    const memberPrincipalId = String(member_principal_id ?? '').trim();
    const normalizedRole = String(role ?? '').trim();
    const normalizedStatus = String(status ?? 'active').trim();
    if (!siteId) return { ok: false, code: 'invalid_site_id' };
    if (!memberPrincipalId) return { ok: false, code: 'invalid_member_principal_id', site_id: siteId };
    if (!SITE_ROLES.has(normalizedRole)) return { ok: false, code: 'invalid_site_role', site_id: siteId, role: normalizedRole || null };
    if (!['active', 'inactive'].includes(normalizedStatus)) return { ok: false, code: 'invalid_membership_status', site_id: siteId, status: normalizedStatus || null };
    const site = await findSite(siteId);
    if (!site || site.status !== 'active') return { ok: false, code: 'site_not_found', site_id: siteId };
    const actorMembership = await findMembership(siteId, actorPrincipalId);
    if (!actorMembership || actorMembership.status !== 'active' || !['owner', 'maintainer'].includes(actorMembership.role)) {
      return denied('site_membership_update_rejected', {
        site_id: siteId,
        principal_id: actorPrincipalId,
        reason: 'site_authority_denied',
        request_id,
      });
    }
    const existing = await findMembership(siteId, memberPrincipalId);
    const timestamp = now();
    await db.prepare(`INSERT INTO cloudflare_site_memberships (
      site_id, principal_id, role, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, principal_id) DO UPDATE SET
      role = excluded.role,
      status = excluded.status,
      updated_at = excluded.updated_at`).bind(
      siteId,
      memberPrincipalId,
      normalizedRole,
      normalizedStatus,
      existing?.created_at ?? timestamp,
      timestamp,
    ).run();
    const membership = await findMembership(siteId, memberPrincipalId);
    await recordAuthorityEvent({
      event_kind: 'site_membership_updated',
      site_id: siteId,
      principal_id: actorPrincipalId,
      action: 'admit',
      reason: existing ? 'site_membership_updated' : 'site_membership_created',
      evidence: {
        request_id,
        member_principal_id: memberPrincipalId,
        role: normalizedRole,
        status: normalizedStatus,
        actor_role: actorMembership.role,
      },
    });
    return {
      ok: true,
      action: existing ? 'updated' : 'created',
      site: publicSite(site),
      membership: publicMembership(membership),
      actor_membership: publicMembership(actorMembership),
    };
  }

  async function validateCarrierSiteBinding({ site_id, site_ref = null, operation_id = null, carrier_session_id, agent_id, principal, request_id = null } = {}) {
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
    const rawOperationId = String(operation_id ?? '').trim();
    const operationId = rawOperationId ? normalizeOperationId(rawOperationId) : null;
    if (rawOperationId && !operationId) return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'invalid_operation_id', request_id });
    const operation = operationId ? await findOperation(operationId) : null;
    if (operationId && (!operation || operation.site_id !== siteId || operation.status !== 'active')) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: operation ? 'operation_site_mismatch' : 'operation_not_found', request_id });
    }
    const membership = await findMembership(siteId, principalId);
    if (!membership || membership.status !== 'active' || !BINDING_ROLES.has(membership.role)) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'site_authority_denied', request_id });
    }
    const existing = await findCarrierSessionBinding(carrierSessionId);
    if (existing && existing.site_id !== siteId) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'carrier_session_site_mismatch', request_id });
    }
    if (existing && operationId && existing.operation_id && existing.operation_id !== operationId) {
      return denied('carrier_site_binding_rejected', { site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, reason: 'carrier_session_operation_mismatch', request_id });
    }
    const timestamp = now();
    if (!existing) {
      await db.prepare(`INSERT INTO cloudflare_site_carrier_sessions (
        carrier_session_id, site_id, operation_id, agent_id, bound_by_principal_id, binding_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        carrierSessionId,
        siteId,
        operationId,
        agentId,
        principalId,
        'active',
        timestamp,
        timestamp,
      ).run();
    } else if (operationId && !existing.operation_id) {
      await db.prepare('UPDATE cloudflare_site_carrier_sessions SET operation_id = ?, updated_at = ? WHERE carrier_session_id = ?').bind(operationId, timestamp, carrierSessionId).run();
    }
    await recordAuthorityEvent({
      event_kind: 'carrier_site_binding_admitted',
      site_id: siteId,
      carrier_session_id: carrierSessionId,
      principal_id: principalId,
      action: 'admit',
      reason: existing ? 'carrier_site_binding_reused' : 'carrier_site_binding_created',
      evidence: { request_id, site_id: siteId, operation_id: operationId, carrier_session_id: carrierSessionId, agent_id: agentId, role: membership.role },
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
        operation_id: operationId,
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

  async function findOperation(operationId) {
    return db.prepare('SELECT * FROM cloudflare_site_operations WHERE operation_id = ?').bind(operationId).first();
  }

  async function addColumnIfMissing(tableName, columnDefinition) {
    try {
      await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`).run();
    } catch (error) {
      if (!/duplicate column|already exists/i.test(String(error?.message ?? error))) throw error;
    }
  }

  async function listSiteOperations(siteId, limit = 100) {
    const result = await db.prepare(`SELECT * FROM cloudflare_site_operations
      WHERE site_id = ?
      ORDER BY created_at ASC
      LIMIT ?`).bind(siteId, boundedReadLimit(limit)).all();
    return (result.results ?? []).map(publicOperation);
  }

  async function listCarrierSessionBindings(siteId, limit = 100) {
    const result = await db.prepare(`SELECT * FROM cloudflare_site_carrier_sessions
      WHERE site_id = ?
      ORDER BY created_at DESC
      LIMIT ?`).bind(siteId, boundedReadLimit(limit)).all();
    return (result.results ?? []).map(publicCarrierSessionBinding);
  }

  async function listMemberships(siteId, limit = 100) {
    const result = await db.prepare(`SELECT * FROM cloudflare_site_memberships
      WHERE site_id = ?
      ORDER BY created_at ASC
      LIMIT ?`).bind(siteId, boundedReadLimit(limit)).all();
    return (result.results ?? []).map(publicMembership);
  }

  async function listAuthorityEvents(siteId, limit = 100) {
    const result = await db.prepare(`SELECT * FROM cloudflare_site_authority_events
      WHERE site_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?`).bind(siteId, boundedReadLimit(limit)).all();
    return (result.results ?? []).map(publicAuthorityEvent);
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
    putSiteMembership,
    createOperation,
    readOperation,
    listOperations,
    validateCarrierSiteBinding,
    listSiteOperations,
    listCarrierSessionBindings,
    listOperationCarrierSessionBindings,
    listAuthorityEvents,
    listMemberships,
  };
}

export function normalizeSiteId(value) {
  const siteId = String(value ?? '').trim();
  return SITE_ID_PATTERN.test(siteId) ? siteId : null;
}

export function normalizeOperationId(value) {
  const operationId = String(value ?? '').trim();
  return SITE_ID_PATTERN.test(operationId) ? operationId : null;
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

function publicCarrierSessionBinding(binding) {
  if (!binding) return null;
  return {
    carrier_session_id: String(binding.carrier_session_id),
    site_id: String(binding.site_id),
    operation_id: binding.operation_id ?? null,
    agent_id: String(binding.agent_id),
    bound_by_principal_id: String(binding.bound_by_principal_id),
    binding_status: String(binding.binding_status),
    created_at: String(binding.created_at),
    updated_at: String(binding.updated_at),
  };
}

function publicAuthorityEvent(event) {
  if (!event) return null;
  return {
    event_id: String(event.event_id),
    event_kind: String(event.event_kind),
    site_id: event.site_id ?? null,
    carrier_session_id: event.carrier_session_id ?? null,
    principal_id: String(event.principal_id),
    action: String(event.action),
    reason: event.reason ?? null,
    evidence: parseJson(event.evidence_json),
    recorded_at: String(event.recorded_at),
  };
}

function boundedReadLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 100;
  return Math.max(0, Math.min(parsed, 500));
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
