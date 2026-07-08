export const AGENT_IDENTITY_REF_SCHEMA = 'narada.agent_identity_ref.v1';
export const AGENT_IDENTITY_REF_V2_SCHEMA = 'narada.agent_identity_ref.v2';

export function buildAgentIdentityRef(identityValue, roleValue = null, explicitSiteId = null) {
  const sourceAgentId = normalizeRequiredString(identityValue, 'identity');
  const parts = sourceAgentId.split('.').filter(Boolean);
  const localAgentId = parts.length > 1 ? parts.at(-1) : sourceAgentId;
  const sourceSiteId = parts.length > 1 ? parts.slice(0, -1).join('.') : null;
  const explicitSiteIdNormalized = normalizeOptionalString(explicitSiteId);
  const siteId = explicitSiteIdNormalized && sourceSiteId && normalizeSiteToken(explicitSiteIdNormalized) === normalizeSiteToken(sourceSiteId)
    ? sourceSiteId
    : explicitSiteIdNormalized ?? sourceSiteId;
  const role = normalizeOptionalString(roleValue) ?? localAgentId;
  const canonicalAgentId = siteId ? `${siteId}.${localAgentId}` : sourceAgentId;
  return {
    schema: AGENT_IDENTITY_REF_SCHEMA,
    site_id: siteId,
    local_agent_id: localAgentId,
    role,
    canonical_agent_id: canonicalAgentId,
    display: canonicalAgentId,
    source_agent_id: sourceAgentId,
    scope: siteId ? 'site_scoped' : 'unscoped',
  };
}

export function buildAgentIdentityRefV2(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('agent_identity_ref_v2_input_required');
  const scope = normalizeIdentityScope(input.identity_scope ?? (input.site_id ? { kind: 'narada_site', site_id: input.site_id } : null));
  const localAgentId = normalizeRequiredString(input.local_agent_id, 'local_agent_id');
  const role = normalizeOptionalString(input.role) ?? localAgentId;
  const canonicalAgentId = normalizeOptionalString(input.canonical_agent_id)
    ?? (scope.kind === 'narada_site' ? `${scope.site_id}.${localAgentId}` : localAgentId);
  const legacyAgentId = normalizeOptionalString(input.legacy_agent_id ?? input.source_agent_id);
  return {
    schema: AGENT_IDENTITY_REF_V2_SCHEMA,
    identity_scope: scope,
    local_agent_id: localAgentId,
    role,
    canonical_agent_id: canonicalAgentId,
    display: normalizeOptionalString(input.display) ?? canonicalAgentId,
    ...(legacyAgentId ? { legacy_agent_id: legacyAgentId } : {}),
  };
}

export function resolveAgentIdentityRef(input, context = {}) {
  const targetVersion = normalizeOptionalString(context.target_version ?? context.targetVersion) ?? AGENT_IDENTITY_REF_V2_SCHEMA;
  if (targetVersion !== AGENT_IDENTITY_REF_V2_SCHEMA && targetVersion !== 'v2') {
    return refusedIdentityResolution('unsupported_target_version', `Unsupported target identity version: ${targetVersion}`);
  }

  const contextSiteId = normalizeOptionalString(context.site_id ?? context.siteId);
  const contextRole = normalizeOptionalString(context.role);
  const contextAgentId = normalizeOptionalString(context.agent_id ?? context.agentId);
  const source = extractIdentityInput(input, contextAgentId);
  if (source.status !== 'ok') return source;

  const value = source.value;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.schema === AGENT_IDENTITY_REF_V2_SCHEMA) {
    try {
      return resolvedIdentityResolution(buildAgentIdentityRefV2(value), [{ kind: 'copied_current_shape', field: 'agent_identity_ref' }]);
    } catch (error) {
      return refusedIdentityResolution('invalid_current_shape', error?.message ?? 'Invalid current identity shape');
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const siteId = normalizeOptionalString(value.site_id) ?? contextSiteId;
    const localAgentId = normalizeOptionalString(value.local_agent_id) ?? roleSegment(value.source_agent_id ?? value.canonical_agent_id ?? value.agent_id);
    if (!localAgentId) return refusedIdentityResolution('local_agent_id_required', 'Cannot resolve agent identity without local_agent_id or legacy agent_id.');
    if (!siteId) return refusedIdentityResolution('identity_scope_required', `Cannot resolve ${localAgentId} without site_id or identity_scope context.`);
    return resolvedIdentityResolution(buildAgentIdentityRefV2({
      identity_scope: { kind: 'narada_site', site_id: siteId },
      local_agent_id: localAgentId,
      role: normalizeOptionalString(value.role) ?? contextRole ?? localAgentId,
      canonical_agent_id: normalizeOptionalString(value.canonical_agent_id) ?? `${siteId}.${localAgentId}`,
      display: normalizeOptionalString(value.display),
      legacy_agent_id: normalizeOptionalString(value.source_agent_id ?? value.agent_id),
    }), provenanceForObject(value, siteId === contextSiteId));
  }

  const legacyAgentId = normalizeOptionalString(value);
  if (!legacyAgentId) return refusedIdentityResolution('identity_input_required', 'Cannot resolve an empty agent identity input.');
  const legacySiteId = siteSegment(legacyAgentId);
  const localAgentId = roleSegment(legacyAgentId);
  if (!localAgentId) return refusedIdentityResolution('local_agent_id_required', `Cannot resolve local id from ${legacyAgentId}.`);
  const siteId = legacySiteId ?? contextSiteId;
  if (!siteId) return refusedIdentityResolution('identity_scope_required', `Cannot resolve ${legacyAgentId} without site_id context.`);
  return resolvedIdentityResolution(buildAgentIdentityRefV2({
    identity_scope: { kind: 'narada_site', site_id: siteId },
    local_agent_id: localAgentId,
    role: contextRole ?? localAgentId,
    legacy_agent_id: legacyAgentId,
  }), [
    { kind: 'legacy_scalar_consumed', field: 'agent_id', value: legacyAgentId },
    ...(legacySiteId ? [{ kind: 'inferred_from_legacy_scalar', field: 'identity_scope.site_id', value: legacySiteId }] : [{ kind: 'context_consumed', field: 'site_id', value: siteId }]),
  ]);
}

export function agentIdentityDisplay(identityRef, fallback = null) {
  if (identityRef && typeof identityRef === 'object') {
    return normalizeOptionalString(identityRef.display)
      ?? normalizeOptionalString(identityRef.canonical_agent_id)
      ?? normalizeOptionalString(identityRef.source_agent_id)
      ?? normalizeOptionalString(identityRef.local_agent_id)
      ?? normalizeOptionalString(fallback);
  }
  return normalizeOptionalString(fallback);
}

export function normalizeAgentIdentityRef(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.schema === AGENT_IDENTITY_REF_V2_SCHEMA) {
    try {
      const scope = normalizeIdentityScope(value.identity_scope ?? (value.site_id ? { kind: 'narada_site', site_id: value.site_id } : { kind: 'unscoped' }));
      const siteId = scope.kind === 'narada_site' ? scope.site_id : null;
      const sourceAgentId = normalizeOptionalString(value.legacy_agent_id)
        ?? normalizeOptionalString(value.canonical_agent_id)
        ?? normalizeOptionalString(value.local_agent_id);
      if (!sourceAgentId) return null;
      return buildAgentIdentityRef(sourceAgentId, normalizeOptionalString(value.role), siteId);
    } catch {
      return null;
    }
  }
  const sourceAgentId = normalizeOptionalString(value.source_agent_id)
    ?? normalizeOptionalString(value.local_agent_id)
    ?? normalizeOptionalString(value.canonical_agent_id);
  if (!sourceAgentId) return null;
  return buildAgentIdentityRef(
    sourceAgentId,
    normalizeOptionalString(value.role),
    normalizeOptionalString(value.site_id),
  );
}

export function normalizeAgentIdentityRefV2(value, context = {}) {
  const resolved = resolveAgentIdentityRef(value, context);
  return resolved.status === 'resolved' ? resolved.value : null;
}

export function agentIdentityRefMatchesRequest(identityRef, requestedAgentId) {
  const requested = normalizeOptionalString(requestedAgentId);
  if (!requested) return false;
  const ref = normalizeAgentIdentityRef(identityRef);
  if (!ref) return false;
  if (requested === ref.canonical_agent_id || requested === ref.source_agent_id || requested === ref.local_agent_id) return true;
  const requestedRole = roleSegment(requested);
  if (!requestedRole || requestedRole !== ref.local_agent_id) return false;
  const requestedSite = siteSegment(requested);
  if (requestedSite && ref.site_id) return normalizeSiteToken(requestedSite) === normalizeSiteToken(ref.site_id);
  return !requested.includes('.');
}

export function agentIdentityGroupKey(identityRef, fallbackAgentId = null, fallbackSiteId = null) {
  const ref = normalizeAgentIdentityRef(identityRef)
    ?? (fallbackAgentId ? buildAgentIdentityRef(fallbackAgentId, null, fallbackSiteId) : null);
  if (!ref) return 'unknown/unknown';
  return `${normalizeSiteToken(ref.site_id ?? '')}/${ref.canonical_agent_id ?? ref.source_agent_id ?? ref.local_agent_id ?? 'unknown'}`;
}

export function renderOperatorValue(value, options = {}) {
  const mode = options.mode === 'block' ? 'block' : 'inline';
  const limit = normalizePositiveInteger(options.limit, 500);
  const depth = normalizePositiveInteger(options.depth, 0);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Error) return value.message || value.name || String(value);
  if (Array.isArray(value)) {
    const rendered = value.map((entry) => renderOperatorValue(entry, { ...options, depth: depth + 1 })).filter(Boolean);
    return mode === 'block' ? rendered.join('\n') : rendered.join(', ');
  }
  if (typeof value === 'object') {
    const summary = renderOperatorObjectSummary(value, options);
    if (summary) return summary;
    return renderOperatorJson(value, mode, limit);
  }
  return String(value);
}

export function renderOperatorObjectSummary(value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const limit = normalizePositiveInteger(options.limit, 500);
  const entries = [];
  const seen = new Set();
  const priorityKeys = ['status', 'reason_code', 'reason', 'code', 'message', 'error'];

  const pushEntry = (key, rawValue) => {
    if (rawValue === null || rawValue === undefined || seen.has(key)) return;
    seen.add(key);
    if (Array.isArray(rawValue)) {
      entries.push(`${key}=[${rawValue.length}]`);
      return;
    }
    if (typeof rawValue === 'object') {
      const nested = renderOperatorObjectSummary(rawValue, { ...options, limit: Math.max(120, Math.floor(limit / 2)) });
      entries.push(nested ? `${key}=${nested}` : `${key}=${renderOperatorJson(rawValue, 'inline', Math.max(120, Math.floor(limit / 2)))}`);
      return;
    }
    entries.push(`${key}=${renderOperatorValue(rawValue, { ...options, mode: 'inline', limit })}`);
  };

  for (const key of priorityKeys) {
    if (Object.hasOwn(value, key)) pushEntry(key, value[key]);
  }
  for (const [key, rawValue] of Object.entries(value)) {
    if (seen.has(key)) continue;
    pushEntry(key, rawValue);
  }

  return entries.join(', ');
}

export function roleSegment(agentId) {
  const value = normalizeOptionalString(agentId);
  if (!value) return null;
  const parts = value.split('.').filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : value;
}

export function siteSegment(agentId) {
  const value = normalizeOptionalString(agentId);
  if (!value || !value.includes('.')) return null;
  return value.split('.')[0] ?? null;
}

export function normalizeSiteToken(value) {
  const lower = String(value ?? '').trim().toLowerCase();
  if (lower.startsWith('narada-')) return lower.slice('narada-'.length);
  if (lower.startsWith('narada.')) return lower.slice('narada.'.length);
  return lower;
}

function normalizeIdentityScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('identity_scope_required');
  const kind = normalizeRequiredString(value.kind, 'identity_scope.kind');
  if (kind === 'narada_site') {
    return { kind, site_id: normalizeRequiredString(value.site_id, 'identity_scope.site_id') };
  }
  if (kind === 'unscoped') return { kind };
  throw new TypeError(`unsupported_identity_scope_kind:${kind}`);
}

function extractIdentityInput(input, fallbackAgentId) {
  if (input !== null && input !== undefined) return { status: 'ok', value: input };
  if (fallbackAgentId) return { status: 'ok', value: fallbackAgentId };
  return refusedIdentityResolution('identity_input_required', 'Cannot resolve missing agent identity input.');
}

function provenanceForObject(value, usedContextSite) {
  const provenance = [{ kind: 'legacy_object_consumed', field: value.schema === AGENT_IDENTITY_REF_SCHEMA ? 'agent_identity_ref.v1' : 'agent_identity_ref' }];
  if (usedContextSite) provenance.push({ kind: 'context_consumed', field: 'site_id' });
  if (value.source_agent_id || value.agent_id) provenance.push({ kind: 'legacy_scalar_consumed', field: value.source_agent_id ? 'source_agent_id' : 'agent_id', value: value.source_agent_id ?? value.agent_id });
  return provenance;
}

function resolvedIdentityResolution(value, provenance) {
  return { status: 'resolved', value, provenance };
}

function refusedIdentityResolution(code, message) {
  return { status: 'refused', code, message };
}

function normalizeRequiredString(value, field) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new TypeError(`${field}_required`);
  return normalized;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function renderOperatorJson(value, mode, limit) {
  try {
    const rendered = JSON.stringify(value, null, mode === 'block' ? 2 : 0);
    if (!rendered) return Object.prototype.toString.call(value);
    if (rendered.length <= limit) return rendered;
    return `${rendered.slice(0, Math.max(0, limit - 3))}...`;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}
