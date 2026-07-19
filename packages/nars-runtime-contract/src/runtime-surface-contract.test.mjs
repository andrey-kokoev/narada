import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA,
  NARS_RUNTIME_ORIGINS,
  NARS_SURFACE_ORIGINS,
  NARS_RUNTIME_SURFACE_QUADRANT_IDS,
  NARS_RUNTIME_SURFACE_QUADRANTS,
  NARS_RUNTIME_SURFACE_CROSSINGS,
  NARS_AUTHORITY_RUNTIME_HOST_KINDS,
  buildNarsCapabilityProfile,
  buildNarsRuntimeSurfaceContract,
  deriveNarsRuntimeQuadrant,
  runtimeOriginFromAuthorityHost,
  validateNarsRuntimeSurfaceContract,
} from './runtime-surface-contract.mjs';

const LOCAL_AUTHORITY = {
  authority_runtime_host: 'local',
  authority_epoch: 1,
  authority_runtime_id: 'local-nars:session-1',
  canonicity: 'canonical',
};

const CLOUDFLARE_AUTHORITY = {
  authority_runtime_host: 'cloudflare-host',
  authority_epoch: 1,
  authority_runtime_id: 'cloudflare-nars-authority:cf_nars_1',
  canonicity: 'synthetic_canonical',
};

test('quadrant vocabulary is closed and derived', () => {
  assert.deepEqual([...NARS_RUNTIME_ORIGINS], ['local', 'cloudflare']);
  assert.deepEqual([...NARS_SURFACE_ORIGINS], ['local', 'cloudflare']);
  assert.equal(NARS_RUNTIME_SURFACE_QUADRANT_IDS.length, 4);
  assert.equal(deriveNarsRuntimeQuadrant('local', 'local'), 'local/local');
  assert.equal(deriveNarsRuntimeQuadrant('local', 'cloudflare'), 'local/cloudflare');
  assert.equal(deriveNarsRuntimeQuadrant('cloudflare', 'local'), 'cloudflare/local');
  assert.equal(deriveNarsRuntimeQuadrant('cloudflare', 'cloudflare'), 'cloudflare/cloudflare');
  assert.equal(deriveNarsRuntimeQuadrant('worker', 'local'), null);
  assert.equal(deriveNarsRuntimeQuadrant('local', 'browser'), null);
});

test('projected quadrants require an explicit identity and crossing route', () => {
  const missingProjection = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'cloudflare',
    authority: LOCAL_AUTHORITY,
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const missingProjectionValidation = validateNarsRuntimeSurfaceContract(missingProjection);
  assert.equal(missingProjectionValidation.ok, false);
  assert.ok(missingProjectionValidation.violations.some((v) => v.code === 'projection_required'));

  const wrongCrossing = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'cloudflare',
    authority: LOCAL_AUTHORITY,
    projection: { projection_id: 'proj_1', route_kind: 'projection_edge' },
    crossing: { ...NARS_RUNTIME_SURFACE_CROSSINGS['local/local'] },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const wrongCrossingValidation = validateNarsRuntimeSurfaceContract(wrongCrossing);
  assert.equal(wrongCrossingValidation.ok, false);
  assert.ok(wrongCrossingValidation.violations.some((v) => v.code === 'crossing_mismatch'));
});

test('authority host kinds are reused from carrier-protocol, not redefined', () => {
  assert.deepEqual([...NARS_AUTHORITY_RUNTIME_HOST_KINDS], ['local', 'cloudflare-host']);
  assert.equal(runtimeOriginFromAuthorityHost('local'), 'local');
  assert.equal(runtimeOriginFromAuthorityHost('cloudflare-host'), 'cloudflare');
  assert.equal(runtimeOriginFromAuthorityHost('unknown'), null);
});

test('capability profile defaults make cloudflare provider/tool/local authority absence explicit', () => {
  const local = buildNarsCapabilityProfile('local');
  assert.equal(local.provider_execution, 'present');
  assert.equal(local.local_tool_execution, 'present');
  assert.equal(local.local_mcp, 'present');
  assert.equal(local.local_filesystem_authority, 'present');
  assert.equal(local.cloudflare_native_mcp, 'absent');
  assert.equal(local.replay, 'present');
  assert.equal(local.input_admission, 'present');
  assert.equal(local.revocation, 'present');

  const cloudflare = buildNarsCapabilityProfile('cloudflare');
  assert.equal(cloudflare.provider_execution, 'absent');
  assert.equal(cloudflare.local_tool_execution, 'absent');
  assert.equal(cloudflare.local_mcp, 'absent');
  assert.equal(cloudflare.local_filesystem_authority, 'absent');
  assert.equal(cloudflare.local_artifact_authority, 'absent');
  assert.equal(cloudflare.cloudflare_native_mcp, 'fabric_summary');
  assert.equal(cloudflare.replay, 'present');
  assert.equal(cloudflare.input_admission, 'present');
  assert.equal(cloudflare.revocation, 'present');
});

test('every supported quadrant builds a valid contract without transport or UI inference', () => {
  for (const [quadrant, expectation] of Object.entries(NARS_RUNTIME_SURFACE_QUADRANTS)) {
    const authority = expectation.authority_runtime_host === 'local' ? LOCAL_AUTHORITY : CLOUDFLARE_AUTHORITY;
    const contract = buildNarsRuntimeSurfaceContract({
      runtime_origin: expectation.runtime_origin,
      surface_origin: expectation.surface_origin,
      authority,
      projection: expectation.projection_posture
        ? {
          projection_id: expectation.runtime_origin === 'local' ? 'proj_1' : null,
          authority_session_id: expectation.runtime_origin === 'cloudflare' ? 'cf_nars_1' : null,
          route_kind: expectation.runtime_origin === 'local' ? 'projection_edge' : 'intent_route',
        }
        : null,
      generated_at: '2026-07-18T00:00:00.000Z',
    });
    assert.equal(contract.schema, NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA);
    assert.equal(contract.quadrant, quadrant);
    assert.equal(contract.evidence_class, expectation.evidence_class);
    assert.equal(contract.authority.canonicity, expectation.canonicity);
    assert.deepEqual(contract.crossing, NARS_RUNTIME_SURFACE_CROSSINGS[quadrant]);
    const validation = validateNarsRuntimeSurfaceContract(contract);
    assert.deepEqual(validation, { ok: true, violations: [] });
  }
});

test('validator rejects authority host/runtime origin mismatch (dual-host ambiguity)', () => {
  const contract = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'local',
    authority: { ...LOCAL_AUTHORITY, authority_runtime_host: 'cloudflare-host', canonicity: 'synthetic_canonical' },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const validation = validateNarsRuntimeSurfaceContract(contract);
  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((v) => v.code === 'authority_host_origin_mismatch'));
});

test('validator rejects cloudflare-origin capability presence claims without evidence', () => {
  const contract = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'cloudflare',
    surface_origin: 'cloudflare',
    authority: CLOUDFLARE_AUTHORITY,
    projection: { authority_session_id: 'cf_nars_1', route_kind: 'intent_route' },
    capability_profile: buildNarsCapabilityProfile('cloudflare', { provider_execution: 'present' }),
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const validation = validateNarsRuntimeSurfaceContract(contract);
  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((v) => v.code === 'cloudflare_capability_evidence_required'));
});

test('validator keeps local tool/mcp/filesystem/artifact authority hard-absent on cloudflare origin', () => {
  for (const dimension of ['local_tool_execution', 'local_mcp', 'local_filesystem_authority', 'local_artifact_authority']) {
    const contract = buildNarsRuntimeSurfaceContract({
      runtime_origin: 'cloudflare',
      surface_origin: 'cloudflare',
      authority: CLOUDFLARE_AUTHORITY,
      projection: { authority_session_id: 'cf_nars_1', route_kind: 'intent_route' },
      capability_profile: buildNarsCapabilityProfile('cloudflare', { [dimension]: 'declared' }),
      generated_at: '2026-07-18T00:00:00.000Z',
    });
    const validation = validateNarsRuntimeSurfaceContract(contract);
    assert.equal(validation.ok, false, dimension);
    assert.ok(validation.violations.some((v) => v.code === 'cloudflare_capability_hard_absent'), dimension);
  }
});

test('validator accepts graduated cloudflare provider execution with configuration and executed evidence', () => {
  const declared = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'cloudflare',
    surface_origin: 'cloudflare',
    authority: CLOUDFLARE_AUTHORITY,
    projection: { authority_session_id: 'cf_nars_1', route_kind: 'intent_route' },
    capability_profile: buildNarsCapabilityProfile('cloudflare', { provider_execution: 'declared' }),
    capability_evidence: {
      provider_execution: { state: 'declared', evidence_ref: 'provider-binding:openai-api:gpt-5.5', graduated_at: null },
    },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  assert.deepEqual(validateNarsRuntimeSurfaceContract(declared), { ok: true, violations: [] });

  const presented = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'cloudflare',
    surface_origin: 'cloudflare',
    authority: CLOUDFLARE_AUTHORITY,
    projection: { authority_session_id: 'cf_nars_1', route_kind: 'intent_route' },
    capability_profile: buildNarsCapabilityProfile('cloudflare', { provider_execution: 'present' }),
    capability_evidence: {
      provider_execution: { state: 'present', evidence_ref: 'cf_evt_provider_turn_7', graduated_at: '2026-07-18T00:00:00.000Z' },
    },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  assert.deepEqual(validateNarsRuntimeSurfaceContract(presented), { ok: true, violations: [] });

  const mismatchedEvidence = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'cloudflare',
    surface_origin: 'cloudflare',
    authority: CLOUDFLARE_AUTHORITY,
    projection: { authority_session_id: 'cf_nars_1', route_kind: 'intent_route' },
    capability_profile: buildNarsCapabilityProfile('cloudflare', { provider_execution: 'present' }),
    capability_evidence: {
      provider_execution: { state: 'declared', evidence_ref: 'provider-binding:openai-api', graduated_at: null },
    },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const validation = validateNarsRuntimeSurfaceContract(mismatchedEvidence);
  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((v) => v.code === 'capability_evidence_state_mismatch' || v.code === 'cloudflare_capability_evidence_required'));
});

test('validator rejects non-canonical posture on local/local and projected posture violations', () => {
  const genuine = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'local',
    authority: LOCAL_AUTHORITY,
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  assert.equal(validateNarsRuntimeSurfaceContract(genuine).ok, true);

  const projected = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'cloudflare',
    authority: LOCAL_AUTHORITY,
    projection: { projection_id: 'proj_1', route_kind: 'projection_edge', posture: 'synthetic_authority' },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const validation = validateNarsRuntimeSurfaceContract(projected);
  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((v) => v.code === 'projection_posture_mismatch'));
});

test('validator rejects malformed contracts structurally', () => {
  assert.equal(validateNarsRuntimeSurfaceContract(null).ok, false);
  assert.equal(validateNarsRuntimeSurfaceContract({}).ok, false);
  const noIdentity = buildNarsRuntimeSurfaceContract({
    runtime_origin: 'local',
    surface_origin: 'cloudflare',
    authority: LOCAL_AUTHORITY,
    projection: { route_kind: 'projection_edge' },
    generated_at: '2026-07-18T00:00:00.000Z',
  });
  const validation = validateNarsRuntimeSurfaceContract(noIdentity);
  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((v) => v.code === 'projection_identity_required'));
});
