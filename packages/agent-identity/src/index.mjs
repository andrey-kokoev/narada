export const AGENT_IDENTITY_REF_SCHEMA = 'narada.agent_identity_ref.v1';

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
