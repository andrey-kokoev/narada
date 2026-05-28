import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_PROJECTION_SCHEMA,
  CAPABILITY_PROJECTION_STATES,
  buildCapabilityProjection,
  resolveProviderCapabilityProjection,
  validateCapabilityProjection,
} from './capability-projection.mjs';

test('capability projection schema covers every required projection state', () => {
  assert.deepEqual(CAPABILITY_PROJECTION_STATES, [
    'provider',
    'data_read',
    'fixture_only',
    'missing',
    'revoked',
    'stale',
  ]);

  for (const state of CAPABILITY_PROJECTION_STATES) {
    const projection = buildCapabilityProjection(state);
    assert.equal(projection.schema, CAPABILITY_PROJECTION_SCHEMA);
    assert.equal(projection.projection_state, state);
    assert.equal(typeof projection.capability_ref === 'string', true);
    assert.equal(typeof projection.capability_kind === 'string', true);
    assert.ok('consent_ref' in projection);
    assert.equal(typeof projection.credential_ref_present, 'boolean');
    assert.equal(typeof projection.grant_status, 'string');
    assert.equal(typeof projection.grant_freshness.posture, 'string');
    assert.equal(typeof projection.revocation_status, 'string');
    assert.equal(projection.scope_summary.values_omitted, true);
    assert.equal(projection.raw_secret_values_recorded, false);
    assert.equal(projection.projected_capabilities_are_not_grants, true);
    assert.deepEqual(validateCapabilityProjection(projection), []);
  }
});

test('provider and data-read projections distinguish credential posture without raw secrets', () => {
  const provider = buildCapabilityProjection('provider');
  const dataRead = buildCapabilityProjection('data_read');

  assert.equal(provider.capability_kind, 'provider_model_access');
  assert.equal(provider.credential_ref_present, true);
  assert.equal(provider.consent_ref, 'consent:provider:fixture');
  assert.equal(JSON.stringify(provider).includes('sk-'), false);
  assert.equal(dataRead.capability_kind, 'site_file_excerpt_read');
  assert.equal(dataRead.credential_ref_present, false);
  assert.equal(dataRead.consent_ref, 'consent:data_read:fixture');
});

test('fixture missing revoked and stale projections carry explicit grant posture', () => {
  const fixture = buildCapabilityProjection('fixture_only');
  const missing = buildCapabilityProjection('missing');
  const revoked = buildCapabilityProjection('revoked');
  const stale = buildCapabilityProjection('stale');

  assert.equal(fixture.grant_status, 'fixture_only');
  assert.equal(fixture.consent_ref, null);
  assert.equal(missing.grant_status, 'missing');
  assert.equal(missing.grant_freshness.posture, 'unknown');
  assert.equal(revoked.grant_status, 'not_granted');
  assert.equal(revoked.revocation_status, 'revoked');
  assert.equal(stale.grant_freshness.posture, 'stale');
  assert.equal(stale.grant_freshness.expires_at, '2026-05-15T00:00:00.000Z');
});

test('capability projection validation rejects raw secrets and grant collapse', () => {
  const projection = buildCapabilityProjection('provider', {
    raw_secret_values_recorded: true,
    projected_capabilities_are_not_grants: false,
    credential_ref_value: 'sk-secret-value',
    scope_summary: { raw_scope_value: 'unbounded scope' },
  });

  assert.deepEqual(validateCapabilityProjection(projection), [
    'raw_secret_values_recorded must be false',
    'projected_capabilities_are_not_grants must be true',
    'credential_ref_value must not be recorded',
    'scope_summary must not include raw_scope_value',
  ]);
});

test('provider capability projection lookup returns bounded invocation posture', async () => {
  const lookup = await resolveProviderCapabilityProjection({
    registration: { capability_ref: 'cap_model_openai_ref' },
    capabilityLookup: async (ref) => ({
      capability_ref: ref,
      granted: true,
      credential_ref: 'credential://model/openai',
      policy_ref: 'policy://bounded-output',
      consent_refs: ['consent://operator/model-openai'],
      scopes: ['model.invoke', 'model.readiness'],
      grant_freshness: { expires_at: '2026-05-17T00:00:00.000Z' },
      revocation_status: 'not_revoked',
    }),
    now: '2026-05-16T00:00:00.000Z',
  });
  const text = JSON.stringify(lookup);

  assert.equal(lookup.status, 'admitted');
  assert.equal(lookup.projection.capability_ref, 'cap_model_openai_ref');
  assert.equal(lookup.projection.credential_ref_present, true);
  assert.deepEqual(lookup.projection.policy_refs, ['policy://bounded-output']);
  assert.deepEqual(lookup.projection.consent_refs, ['consent://operator/model-openai']);
  assert.equal(lookup.projection.scope_summary.allowed_surface_count, 2);
  assert.equal(lookup.projection.scope_summary.values_omitted, true);
  assert.equal(lookup.projection.grant_freshness.posture, 'current');
  assert.equal(lookup.projection.revocation_status, 'not_revoked');
  assert.equal(lookup.provider_transport_invoked, false);
  assert.equal(lookup.raw_secret_values_recorded, false);
  assert.equal(text.includes('credential://model/openai'), false);
});

test('provider capability projection lookup refuses bounded invalid states', async () => {
  const cases = [
    ['missing_capability_ref', { registration: {}, capability: null }],
    ['missing_consent_record', { capability: { granted: true, credential_ref: 'credential://model/openai' } }],
    ['revoked_capability', { capability: { consent_ref: 'consent://x', revoked: true } }],
    ['stale_grant', { capability: { consent_ref: 'consent://x', expires_at: '2026-05-15T00:00:00.000Z' } }],
    ['secret_bearing_capability_material', { capability: { consent_ref: 'consent://x', api_key: 'sk-testsecretvalue123456' } }],
  ];

  for (const [reason, setup] of cases) {
    const result = await resolveProviderCapabilityProjection({
      registration: setup.registration ?? { capability_ref: 'cap_model_openai_ref' },
      capabilityLookup: async () => setup.capability,
      now: '2026-05-16T00:00:00.000Z',
    });
    const text = JSON.stringify(result);

    assert.equal(result.status, 'refused');
    assert.equal(result.refusal_reason, reason);
    assert.equal(result.provider_transport_invoked, false);
    assert.equal(result.raw_secret_values_recorded, false);
    for (const value of Object.values(result.mutation_flags)) assert.equal(value, false);
    assert.doesNotMatch(text, /sk-testsecretvalue123456/);
    assert.doesNotMatch(text, /credential:\/\/model\/openai/);
  }
});
