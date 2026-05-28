export const CAPABILITY_PROJECTION_SCHEMA = 'https://narada.dev/schemas/narada-native/capability-projection/v0';

export const CAPABILITY_PROJECTION_STATES = Object.freeze([
  'provider',
  'data_read',
  'fixture_only',
  'missing',
  'revoked',
  'stale',
]);

export const CAPABILITY_LOOKUP_NO_MUTATION_FLAGS = Object.freeze({
  provider_transport_invoked: false,
  task_lifecycle_mutation: false,
  inbox_mutation: false,
  outbox_mutation: false,
  command_execution: false,
  publication_mutation: false,
  repository_mutation: false,
  credential_value_access: false,
});

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential_value|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

export const DATA_READ_CAPABILITY_BINDINGS = Object.freeze({
  task_packet: 'task_read_packet',
  work_next_peek: 'work_next_peek',
  inbox_summary: 'inbox_summary_read',
  readiness_snapshot: 'carrier_readiness_read',
  evidence_ref_summary: 'carrier_evidence_ref_read',
  bounded_file_excerpt: 'site_file_excerpt_read',
});

export function buildCapabilityProjection(state, overrides = {}) {
  if (!CAPABILITY_PROJECTION_STATES.includes(state)) {
    throw new Error(`unsupported_capability_projection_state:${state}`);
  }
  const base = projectionBaseFor(state);
  return deepMerge(base, overrides);
}

export function validateCapabilityProjection(projection) {
  const errors = [];
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return ['projection must be an object'];
  for (const field of [
    'schema',
    'projection_state',
    'capability_ref',
    'capability_kind',
    'consent_ref',
    'credential_ref_present',
    'grant_status',
    'grant_freshness',
    'revocation_status',
    'scope_summary',
    'raw_secret_values_recorded',
    'projected_capabilities_are_not_grants',
  ]) {
    if (!(field in projection)) errors.push(`${field} is required`);
  }
  if (projection.schema !== CAPABILITY_PROJECTION_SCHEMA) errors.push('schema must be capability projection v0');
  if (!CAPABILITY_PROJECTION_STATES.includes(projection.projection_state)) {
    errors.push(`unsupported projection_state: ${projection.projection_state}`);
  }
  if (projection.raw_secret_values_recorded !== false) errors.push('raw_secret_values_recorded must be false');
  if (projection.projected_capabilities_are_not_grants !== true) {
    errors.push('projected_capabilities_are_not_grants must be true');
  }
  if (projection.credential_ref_present === true && projection.credential_ref_value) {
    errors.push('credential_ref_value must not be recorded');
  }
  if (!isRecord(projection.grant_freshness)) errors.push('grant_freshness must be an object');
  if (!isRecord(projection.scope_summary)) errors.push('scope_summary must be an object');
  if (isRecord(projection.scope_summary) && projection.scope_summary.raw_scope_value) {
    errors.push('scope_summary must not include raw_scope_value');
  }
  return errors;
}

export async function resolveProviderCapabilityProjection({
  registration,
  capabilityLookup,
  now = new Date().toISOString(),
}) {
  const capabilityRef = registration?.capability_ref ?? null;
  if (!capabilityRef) {
    return refusedProviderProjection({ reason: 'missing_capability_ref', capabilityRef, now });
  }

  const capability = capabilityLookup ? await capabilityLookup(capabilityRef) : null;
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    return refusedProviderProjection({ reason: 'missing_consent_record', capabilityRef, now });
  }

  if (inspectCapabilityMaterialForSecrets(capability).length > 0) {
    return refusedProviderProjection({ reason: 'secret_bearing_capability_material', capabilityRef, now });
  }

  const revocationStatus = capability.revocation_status ?? (capability.revoked === true ? 'revoked' : 'not_revoked');
  if (revocationStatus === 'revoked') {
    return refusedProviderProjection({ reason: 'revoked_capability', capabilityRef, capability, now });
  }

  const grantFreshness = boundedGrantFreshness(capability, now);
  if (grantFreshness.posture === 'stale') {
    return refusedProviderProjection({ reason: 'stale_grant', capabilityRef, capability, now, grantFreshness });
  }

  if (consentRefsFor(capability).length === 0) {
    return refusedProviderProjection({ reason: 'missing_consent_record', capabilityRef, capability, now, grantFreshness });
  }

  const admitted = {
    schema: 'narada.narada_native_carrier.provider_capability_lookup.v0',
    status: 'admitted',
    refusal_reason: null,
    projection: buildProviderProjection({ capabilityRef, capability, now, grantFreshness }),
    mutation_flags: { ...CAPABILITY_LOOKUP_NO_MUTATION_FLAGS },
    provider_transport_invoked: false,
    raw_secret_values_recorded: false,
  };
  Object.defineProperty(admitted, 'capability_material', {
    value: capability,
    enumerable: false,
  });
  return admitted;
}

export async function resolveDataReadCapabilityProjection({
  readFamily,
  capabilityLookup = defaultDataReadCapabilityLookup,
  now = new Date().toISOString(),
}) {
  const capabilityKind = DATA_READ_CAPABILITY_BINDINGS[readFamily] ?? readFamily;
  const capabilityRef = `capability:${capabilityKind}`;
  const capability = capabilityLookup ? await capabilityLookup(capabilityKind) : null;
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    return refusedDataReadProjection({ reason: 'missing_consent_record', capabilityRef, capabilityKind, now });
  }
  if (inspectCapabilityMaterialForSecrets(capability).length > 0) {
    return refusedDataReadProjection({ reason: 'secret_bearing_capability_material', capabilityRef, capabilityKind, now });
  }
  const revocationStatus = capability.revocation_status ?? (capability.revoked === true ? 'revoked' : 'not_revoked');
  if (revocationStatus === 'revoked') {
    return refusedDataReadProjection({ reason: 'revoked_capability', capabilityRef, capabilityKind, capability, now });
  }
  const grantFreshness = boundedGrantFreshness(capability, now);
  if (grantFreshness.posture === 'stale') {
    return refusedDataReadProjection({ reason: 'stale_grant', capabilityRef, capabilityKind, capability, now, grantFreshness });
  }
  if (consentRefsFor(capability).length === 0) {
    return refusedDataReadProjection({ reason: 'missing_consent_record', capabilityRef, capabilityKind, capability, now, grantFreshness });
  }
  return {
    schema: 'narada.narada_native_carrier.data_read_capability_lookup.v0',
    status: 'admitted',
    refusal_reason: null,
    projection: buildDataReadProjection({ capabilityRef, capabilityKind, capability, now, grantFreshness }),
    mutation_flags: { ...CAPABILITY_LOOKUP_NO_MUTATION_FLAGS },
    provider_transport_invoked: false,
    raw_secret_values_recorded: false,
  };
}

function projectionBaseFor(state) {
  const base = {
    schema: CAPABILITY_PROJECTION_SCHEMA,
    projection_state: state,
    capability_ref: `capability:${state}:fixture`,
    capability_kind: state === 'provider'
      ? 'provider_model_access'
      : state === 'data_read'
        ? 'site_file_excerpt_read'
        : 'fixture_only',
    consent_ref: state === 'fixture_only' || state === 'missing' ? null : `consent:${state}:fixture`,
    credential_ref_present: state === 'provider',
    grant_status: state === 'missing'
      ? 'missing'
      : state === 'revoked'
        ? 'not_granted'
        : 'projected',
    grant_freshness: {
      posture: state === 'stale' ? 'stale' : state === 'missing' ? 'unknown' : 'current',
      checked_at: '2026-05-16T00:00:00.000Z',
      expires_at: state === 'stale' ? '2026-05-15T00:00:00.000Z' : null,
    },
    revocation_status: state === 'revoked' ? 'revoked' : 'not_revoked',
    scope_summary: {
      scope_kind: state,
      allowed_surface_count: state === 'missing' || state === 'revoked' ? 0 : 1,
      values_omitted: true,
    },
    raw_secret_values_recorded: false,
    projected_capabilities_are_not_grants: true,
  };
  if (state === 'fixture_only') {
    base.capability_ref = 'capability:fixture-only:no-external-authority';
    base.grant_status = 'fixture_only';
  }
  return base;
}

function refusedProviderProjection({ reason, capabilityRef, capability = null, now, grantFreshness = null }) {
  return {
    schema: 'narada.narada_native_carrier.provider_capability_lookup.v0',
    status: 'refused',
    refusal_reason: reason,
    projection: buildProviderProjection({
      capabilityRef: capabilityRef ?? 'capability:missing',
      capability: capability ?? {},
      now,
      grantFreshness,
      projectionState: reason === 'revoked_capability'
        ? 'revoked'
        : reason === 'stale_grant'
          ? 'stale'
          : 'missing',
    }),
    mutation_flags: { ...CAPABILITY_LOOKUP_NO_MUTATION_FLAGS },
    provider_transport_invoked: false,
    raw_secret_values_recorded: false,
  };
}

function refusedDataReadProjection({ reason, capabilityRef, capabilityKind, capability = null, now, grantFreshness = null }) {
  return {
    schema: 'narada.narada_native_carrier.data_read_capability_lookup.v0',
    status: 'refused',
    refusal_reason: reason,
    projection: buildDataReadProjection({
      capabilityRef,
      capabilityKind,
      capability: capability ?? {},
      now,
      grantFreshness,
      projectionState: reason === 'revoked_capability'
        ? 'revoked'
        : reason === 'stale_grant'
          ? 'stale'
          : 'missing',
    }),
    mutation_flags: { ...CAPABILITY_LOOKUP_NO_MUTATION_FLAGS },
    provider_transport_invoked: false,
    raw_secret_values_recorded: false,
  };
}

function buildProviderProjection({
  capabilityRef,
  capability,
  now,
  grantFreshness = null,
  projectionState = 'provider',
}) {
  const consentRefs = consentRefsFor(capability);
  return buildCapabilityProjection(projectionState, {
    capability_ref: capabilityRef,
    capability_kind: 'provider_model_access',
    consent_ref: consentRefs[0] ?? null,
    consent_refs: consentRefs,
    credential_ref_present: typeof capability.credential_ref === 'string',
    policy_refs: policyRefsFor(capability),
    grant_status: grantStatusFor(capability, projectionState),
    grant_freshness: grantFreshness ?? boundedGrantFreshness(capability, now),
    revocation_status: capability.revocation_status ?? (capability.revoked === true ? 'revoked' : 'not_revoked'),
    scope_summary: scopeSummaryFor(capability),
  });
}

function buildDataReadProjection({
  capabilityRef,
  capabilityKind,
  capability,
  now,
  grantFreshness = null,
  projectionState = 'data_read',
}) {
  const consentRefs = consentRefsFor(capability);
  return buildCapabilityProjection(projectionState, {
    capability_ref: capabilityRef,
    capability_kind: capabilityKind,
    consent_ref: consentRefs[0] ?? null,
    consent_refs: consentRefs,
    credential_ref_present: false,
    policy_refs: policyRefsFor(capability),
    grant_status: grantStatusFor(capability, projectionState),
    grant_freshness: grantFreshness ?? boundedGrantFreshness(capability, now),
    revocation_status: capability.revocation_status ?? (capability.revoked === true ? 'revoked' : 'not_revoked'),
    scope_summary: scopeSummaryFor({
      ...capability,
      scope_kind: capabilityKind,
    }),
  });
}

function grantStatusFor(capability, projectionState) {
  if (projectionState === 'missing') return 'missing';
  if (projectionState === 'revoked') return 'not_granted';
  if (capability.granted === false) return 'not_granted';
  return 'projected';
}

function defaultDataReadCapabilityLookup(capabilityKind) {
  return {
    granted: true,
    consent_ref: `consent://fixture/${capabilityKind}`,
    policy_ref: `policy://fixture/${capabilityKind}`,
    scopes: [capabilityKind],
    revocation_status: 'not_revoked',
  };
}

function consentRefsFor(capability) {
  const refs = [
    capability.consent_ref,
    ...(Array.isArray(capability.consent_refs) ? capability.consent_refs : []),
  ].filter((ref) => typeof ref === 'string' && ref.length > 0);
  return [...new Set(refs)].sort();
}

function policyRefsFor(capability) {
  const refs = [
    capability.policy_ref,
    ...(Array.isArray(capability.policy_refs) ? capability.policy_refs : []),
  ].filter((ref) => typeof ref === 'string' && ref.length > 0);
  return [...new Set(refs)].sort();
}

function boundedGrantFreshness(capability, now) {
  const freshness = isRecord(capability.grant_freshness) ? capability.grant_freshness : {};
  const expiresAt = typeof freshness.expires_at === 'string'
    ? freshness.expires_at
    : (typeof capability.expires_at === 'string' ? capability.expires_at : null);
  const explicitPosture = typeof freshness.posture === 'string' ? freshness.posture : null;
  const expired = expiresAt ? Date.parse(expiresAt) <= Date.parse(now) : false;
  return {
    posture: explicitPosture === 'stale' || expired ? 'stale' : 'current',
    checked_at: now,
    expires_at: expiresAt,
  };
}

function scopeSummaryFor(capability) {
  const scopes = Array.isArray(capability.scopes) ? capability.scopes : [];
  return {
    scope_kind: typeof capability.scope_kind === 'string' ? capability.scope_kind : 'provider_model_access',
    allowed_surface_count: scopes.length,
    values_omitted: true,
  };
}

export function inspectCapabilityMaterialForSecrets(value, path = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...inspectCapabilityMaterialForSecrets(item, [...path, String(index)])));
    return findings;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      const refKey = /(^|_)ref(s)?$/i.test(key) || key === 'capability_ref';
      if (!refKey && SECRET_KEY_PATTERN.test(key)) findings.push(childPath.join('.'));
      findings.push(...inspectCapabilityMaterialForSecrets(child, childPath));
    }
    return findings;
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
    findings.push(path.join('.') || '<capability>');
  }
  return findings;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function deepMerge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    output[key] = isRecord(value) && isRecord(output[key])
      ? deepMerge(output[key], value)
      : value;
  }
  return output;
}
