import {
  NARS_AUTHORITY_RUNTIME_HOST_KINDS,
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';

export const NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA = 'narada.nars.runtime_surface_contract.v1';

export const NARS_RUNTIME_ORIGINS = Object.freeze(['local', 'cloudflare']);
export const NARS_SURFACE_ORIGINS = Object.freeze(['local', 'cloudflare']);
export const NARS_RUNTIME_SURFACE_QUADRANT_IDS = Object.freeze([
  'local/local',
  'local/cloudflare',
  'cloudflare/local',
  'cloudflare/cloudflare',
]);

export const NARS_RUNTIME_EVIDENCE_CLASSES = Object.freeze(['genuine', 'projected', 'synthetic']);
export const NARS_AUTHORITY_CANONICITY = Object.freeze(['canonical', 'synthetic_canonical']);
export const NARS_PROJECTION_POSTURES = Object.freeze(['non_canonical_projection', 'synthetic_authority']);
export const NARS_PROJECTION_ROUTE_KINDS = Object.freeze(['projection_edge', 'intent_route']);
export const NARS_CAPABILITY_STATES = Object.freeze(['present', 'absent']);
export const NARS_CLOUDFLARE_NATIVE_MCP_STATES = Object.freeze(['absent', 'fabric_summary']);
export const NARS_CROSSING_AUTHORITY_OWNERS = Object.freeze(['local', 'cloudflare-host']);

export const NARS_RUNTIME_SURFACE_CROSSINGS = Object.freeze({
  'local/local': Object.freeze({
    source_zone: 'local_nars',
    destination_zone: 'local_surface',
    authority_owner: 'local',
    admissibility_regime: 'local_authority_admission',
    crossing_artifact: 'local_session_evidence',
    confirmation_rule: 'local_nars_durable_evidence',
    anti_collapse_invariant: 'surface_never_mints_local_event',
  }),
  'local/cloudflare': Object.freeze({
    source_zone: 'local_nars',
    destination_zone: 'cloudflare_surface',
    authority_owner: 'local',
    admissibility_regime: 'projected_input_returns_to_local_nars',
    crossing_artifact: 'projection_event_or_input_intent',
    confirmation_rule: 'projection_crossing_artifact_only',
    anti_collapse_invariant: 'projection_ack_is_not_canonical_mutation',
  }),
  'cloudflare/local': Object.freeze({
    source_zone: 'cloudflare_authority',
    destination_zone: 'local_surface',
    authority_owner: 'cloudflare-host',
    admissibility_regime: 'synthetic_authority_admission',
    crossing_artifact: 'synthetic_session_evidence',
    confirmation_rule: 'cloudflare_authority_durable_evidence',
    anti_collapse_invariant: 'local_surface_cannot_grant_provider_authority',
  }),
  'cloudflare/cloudflare': Object.freeze({
    source_zone: 'cloudflare_authority',
    destination_zone: 'cloudflare_surface',
    authority_owner: 'cloudflare-host',
    admissibility_regime: 'synthetic_authority_admission',
    crossing_artifact: 'synthetic_session_evidence',
    confirmation_rule: 'cloudflare_authority_durable_evidence',
    anti_collapse_invariant: 'cloudflare_surface_cannot_grant_provider_authority',
  }),
});

// Re-exported so consumers import the whole origin/authority vocabulary from
// this one contract package. The definitions remain owned by carrier-protocol;
// these are the same objects, not aliases or redefinitions.
export {
  NARS_AUTHORITY_RUNTIME_HOST_KINDS,
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';

const HOST_TO_RUNTIME_ORIGIN = Object.freeze({
  local: 'local',
  'cloudflare-host': 'cloudflare',
});

export function runtimeOriginFromAuthorityHost(authorityRuntimeHost) {
  return HOST_TO_RUNTIME_ORIGIN[authorityRuntimeHost] ?? null;
}

export function deriveNarsRuntimeQuadrant(runtimeOrigin, surfaceOrigin) {
  if (!NARS_RUNTIME_ORIGINS.includes(runtimeOrigin)) return null;
  if (!NARS_SURFACE_ORIGINS.includes(surfaceOrigin)) return null;
  return `${runtimeOrigin}/${surfaceOrigin}`;
}

export function buildNarsCapabilityProfile(runtimeOrigin, overrides = {}) {
  const base = runtimeOrigin === 'cloudflare'
    ? {
      // The Cloudflare-origin synthetic slice has no local provider, tool,
      // MCP, filesystem, or local artifact authority. Absence is explicit.
      provider_execution: 'absent',
      local_tool_execution: 'absent',
      local_mcp: 'absent',
      local_filesystem_authority: 'absent',
      local_artifact_authority: 'absent',
      cloudflare_native_mcp: 'fabric_summary',
    }
    : {
      provider_execution: 'present',
      local_tool_execution: 'present',
      local_mcp: 'present',
      local_filesystem_authority: 'present',
      local_artifact_authority: 'present',
      cloudflare_native_mcp: 'absent',
    };
  return Object.freeze({
    ...base,
    ...overrides,
    replay: 'present',
    input_admission: 'present',
    revocation: 'present',
  });
}

export const NARS_RUNTIME_SURFACE_QUADRANTS = Object.freeze({
  'local/local': Object.freeze({
    quadrant: 'local/local',
    runtime_origin: 'local',
    surface_origin: 'local',
    authority_runtime_host: 'local',
    canonicity: 'canonical',
    projection_posture: null,
    evidence_class: 'genuine',
  }),
  'local/cloudflare': Object.freeze({
    quadrant: 'local/cloudflare',
    runtime_origin: 'local',
    surface_origin: 'cloudflare',
    authority_runtime_host: 'local',
    canonicity: 'canonical',
    projection_posture: 'non_canonical_projection',
    evidence_class: 'projected',
  }),
  'cloudflare/local': Object.freeze({
    quadrant: 'cloudflare/local',
    runtime_origin: 'cloudflare',
    surface_origin: 'local',
    authority_runtime_host: 'cloudflare-host',
    canonicity: 'synthetic_canonical',
    projection_posture: 'synthetic_authority',
    evidence_class: 'synthetic',
  }),
  'cloudflare/cloudflare': Object.freeze({
    quadrant: 'cloudflare/cloudflare',
    runtime_origin: 'cloudflare',
    surface_origin: 'cloudflare',
    authority_runtime_host: 'cloudflare-host',
    canonicity: 'synthetic_canonical',
    projection_posture: 'synthetic_authority',
    evidence_class: 'synthetic',
  }),
});

export function buildNarsRuntimeSurfaceContract({
  runtime_origin,
  surface_origin,
  authority,
  projection = null,
  capability_profile = null,
  crossing = null,
  generated_at = null,
} = {}) {
  const quadrant = deriveNarsRuntimeQuadrant(runtime_origin, surface_origin);
  const expectation = quadrant ? NARS_RUNTIME_SURFACE_QUADRANTS[quadrant] : null;
  return {
    schema: NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA,
    runtime_origin: runtime_origin ?? null,
    surface_origin: surface_origin ?? null,
    quadrant,
    evidence_class: expectation?.evidence_class ?? null,
    authority: {
      authority_runtime_host: authority?.authority_runtime_host ?? null,
      authority_epoch: authority?.authority_epoch ?? null,
      authority_runtime_id: authority?.authority_runtime_id ?? null,
      canonicity: authority?.canonicity ?? expectation?.canonicity ?? null,
      authority_transition_state: authority?.authority_transition_state ?? null,
      source_write_admission: authority?.source_write_admission ?? null,
    },
    projection: projection == null
      ? null
      : {
        projection_id: projection.projection_id ?? null,
        authority_session_id: projection.authority_session_id ?? null,
        route_kind: projection.route_kind ?? null,
        posture: projection.posture ?? expectation?.projection_posture ?? null,
      },
    crossing: crossing ?? (quadrant ? NARS_RUNTIME_SURFACE_CROSSINGS[quadrant] : null),
    capability_profile: capability_profile ?? buildNarsCapabilityProfile(runtime_origin),
    generated_at: generated_at ?? new Date().toISOString(),
  };
}

export function validateNarsRuntimeSurfaceContract(candidate) {
  const violations = [];
  const push = (path, code, detail) => violations.push({ path, code, detail });
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    push('$', 'contract_not_an_object', 'Contract must be an object.');
    return { ok: false, violations };
  }
  if (candidate.schema !== NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA) {
    push('$.schema', 'invalid_schema', `Expected ${NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA}.`);
  }
  if (!NARS_RUNTIME_ORIGINS.includes(candidate.runtime_origin)) {
    push('$.runtime_origin', 'invalid_runtime_origin', `Expected one of ${NARS_RUNTIME_ORIGINS.join(', ')}.`);
  }
  if (!NARS_SURFACE_ORIGINS.includes(candidate.surface_origin)) {
    push('$.surface_origin', 'invalid_surface_origin', `Expected one of ${NARS_SURFACE_ORIGINS.join(', ')}.`);
  }
  const expectedQuadrant = deriveNarsRuntimeQuadrant(candidate.runtime_origin, candidate.surface_origin);
  if (expectedQuadrant && candidate.quadrant !== expectedQuadrant) {
    push('$.quadrant', 'quadrant_mismatch', `Expected derived quadrant ${expectedQuadrant}.`);
  }
  const expectation = expectedQuadrant ? NARS_RUNTIME_SURFACE_QUADRANTS[expectedQuadrant] : null;
  if (expectation && candidate.evidence_class !== expectation.evidence_class) {
    push('$.evidence_class', 'evidence_class_mismatch', `Expected ${expectation.evidence_class} for ${expectedQuadrant}.`);
  }

  const authority = candidate.authority;
  if (!authority || typeof authority !== 'object') {
    push('$.authority', 'authority_required', 'Authority descriptor is required.');
  } else {
    if (!NARS_AUTHORITY_RUNTIME_HOST_KINDS.includes(authority.authority_runtime_host)) {
      push('$.authority.authority_runtime_host', 'invalid_authority_runtime_host', `Expected one of ${NARS_AUTHORITY_RUNTIME_HOST_KINDS.join(', ')}.`);
    }
    const originFromHost = runtimeOriginFromAuthorityHost(authority.authority_runtime_host);
    if (originFromHost && candidate.runtime_origin && originFromHost !== candidate.runtime_origin) {
      push('$.authority.authority_runtime_host', 'authority_host_origin_mismatch', `Host ${authority.authority_runtime_host} implies runtime_origin ${originFromHost}.`);
    }
    if (!Number.isInteger(authority.authority_epoch) || authority.authority_epoch < 1) {
      push('$.authority.authority_epoch', 'invalid_authority_epoch', 'authority_epoch must be an integer >= 1.');
    }
    if (typeof authority.authority_runtime_id !== 'string' || !authority.authority_runtime_id.trim()) {
      push('$.authority.authority_runtime_id', 'invalid_authority_runtime_id', 'authority_runtime_id must be a non-empty string.');
    }
    if (!NARS_AUTHORITY_CANONICITY.includes(authority.canonicity)) {
      push('$.authority.canonicity', 'invalid_canonicity', `Expected one of ${NARS_AUTHORITY_CANONICITY.join(', ')}.`);
    }
    if (expectation && authority.canonicity !== expectation.canonicity) {
      push('$.authority.canonicity', 'canonicity_mismatch', `Expected ${expectation.canonicity} for ${expectedQuadrant}.`);
    }
    if (authority.authority_transition_state != null
      && !NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES.includes(authority.authority_transition_state)) {
      push('$.authority.authority_transition_state', 'invalid_authority_transition_state', 'Not a known host transition state.');
    }
    if (authority.source_write_admission != null
      && !NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS.includes(authority.source_write_admission)) {
      push('$.authority.source_write_admission', 'invalid_source_write_admission', 'Not a known source write admission.');
    }
  }

  if (candidate.projection != null) {
    const projection = candidate.projection;
    if (typeof projection !== 'object') {
      push('$.projection', 'invalid_projection', 'Projection must be an object when present.');
    } else {
      if (projection.route_kind != null && !NARS_PROJECTION_ROUTE_KINDS.includes(projection.route_kind)) {
        push('$.projection.route_kind', 'invalid_route_kind', `Expected one of ${NARS_PROJECTION_ROUTE_KINDS.join(', ')}.`);
      }
      if (!NARS_PROJECTION_POSTURES.includes(projection.posture)) {
        push('$.projection.posture', 'invalid_projection_posture', `Expected one of ${NARS_PROJECTION_POSTURES.join(', ')}.`);
      }
      if (expectation?.projection_posture && projection.posture !== expectation.projection_posture) {
        push('$.projection.posture', 'projection_posture_mismatch', `Expected ${expectation.projection_posture} for ${expectedQuadrant}.`);
      }
      if (typeof projection.projection_id !== 'string' || !projection.projection_id.trim()) {
        if (typeof projection.authority_session_id !== 'string' || !projection.authority_session_id.trim()) {
          push('$.projection', 'projection_identity_required', 'projection_id or authority_session_id is required.');
        }
      }
    }
  } else if (expectation?.projection_posture) {
    push('$.projection', 'projection_required', `Projection identity is required for ${expectedQuadrant}.`);
  }
  if (expectation?.projection_posture == null && candidate.projection != null) {
    push('$.projection', 'projection_forbidden', `A projection is not valid for ${expectedQuadrant}.`);
  }
  if (expectation?.projection_posture && candidate.projection && expectation.runtime_origin === 'local'
    && candidate.projection.route_kind !== 'projection_edge') {
    push('$.projection.route_kind', 'projection_route_mismatch', 'Local-origin projection input must cross a projection_edge.');
  }
  if (expectation?.projection_posture && candidate.projection && expectation.runtime_origin === 'cloudflare'
    && candidate.projection.route_kind !== 'intent_route') {
    push('$.projection.route_kind', 'intent_route_mismatch', 'Cloudflare-origin input must cross an intent_route.');
  }

  const crossing = candidate.crossing;
  if (!crossing || typeof crossing !== 'object' || Array.isArray(crossing)) {
    push('$.crossing', 'crossing_required', 'Crossing declaration is required.');
  } else {
    for (const key of ['source_zone', 'destination_zone', 'admissibility_regime', 'crossing_artifact', 'confirmation_rule', 'anti_collapse_invariant']) {
      if (typeof crossing[key] !== 'string' || !crossing[key].trim()) {
        push(`$.crossing.${key}`, 'crossing_field_required', `${key} must be a non-empty string.`);
      }
    }
    if (!NARS_CROSSING_AUTHORITY_OWNERS.includes(crossing.authority_owner)) {
      push('$.crossing.authority_owner', 'invalid_crossing_authority_owner', 'Crossing authority owner is not recognized.');
    }
    if (expectation && JSON.stringify(crossing) !== JSON.stringify(NARS_RUNTIME_SURFACE_CROSSINGS[expectedQuadrant])) {
      push('$.crossing', 'crossing_mismatch', `Crossing declaration does not match ${expectedQuadrant}.`);
    }
  }

  const capability = candidate.capability_profile;
  if (!capability || typeof capability !== 'object') {
    push('$.capability_profile', 'capability_profile_required', 'Capability profile is required.');
  } else {
    for (const key of ['provider_execution', 'local_tool_execution', 'local_mcp', 'local_filesystem_authority', 'local_artifact_authority', 'replay', 'input_admission', 'revocation']) {
      if (!NARS_CAPABILITY_STATES.includes(capability[key])) {
        push(`$.capability_profile.${key}`, 'invalid_capability_state', `Expected present or absent.`);
      }
    }
    if (!NARS_CLOUDFLARE_NATIVE_MCP_STATES.includes(capability.cloudflare_native_mcp)) {
      push('$.capability_profile.cloudflare_native_mcp', 'invalid_cloudflare_native_mcp', `Expected one of ${NARS_CLOUDFLARE_NATIVE_MCP_STATES.join(', ')}.`);
    }
    if (candidate.runtime_origin === 'cloudflare') {
      for (const key of ['provider_execution', 'local_tool_execution', 'local_mcp', 'local_filesystem_authority', 'local_artifact_authority']) {
        if (capability[key] === 'present') {
          push(`$.capability_profile.${key}`, 'cloudflare_capability_must_be_absent', `Cloudflare-origin synthetic slice must report ${key} as absent.`);
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
