import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeProviderAdapter, makeProviderRegistry } from './provider-adapter.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-provider-'));
}

function registration(overrides = {}) {
  return {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    model_posture: 'provider_configured',
    executor_posture: 'no_effect',
    ...overrides,
  };
}

test('provider adapter selection uses registered provider kind and capability reference', async () => {
  const siteRoot = tempSite();
  const calls = [];
  const result = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_provider_success',
    registration: registration(),
    input: {
      prompt: 'summarize task without storing this prompt',
      context: { task_number: 1301 },
    },
    capabilityLookup: async (ref) => ({
      granted: true,
      capability_ref: ref,
      credential_ref: 'cred://model/openai',
      policy_ref: 'policy://bounded-model-output',
      consent_ref: 'consent://operator/openai',
      scopes: ['model.invoke'],
    }),
    providerRegistry: makeProviderRegistry({
      openai_compatible: (request) => {
        calls.push(request);
        return {
          status: 'ok',
          text: 'raw model output that must not be persisted',
          proposed_payload: {
            summary: 'provider suggested inert observation',
            transcript: 'raw model output that must not be persisted',
          },
          closeout_summary: 'raw closeout that must be summarized',
        };
      },
    }),
    now: '2026-05-16T00:10:00.000Z',
  });
  const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');

  assert.equal(result.evidence.provider_kind, 'openai_compatible');
  assert.equal(result.evidence.capability_ref, 'cap_model_openai_ref');
  assert.equal(result.evidence.capability_summary.credential_ref_present, true);
  assert.deepEqual(result.evidence.capability_summary.policy_refs, ['policy://bounded-model-output']);
  assert.deepEqual(result.evidence.capability_summary.consent_refs, ['consent://operator/openai']);
  assert.equal(result.evidence.capability_summary.scope_summary.values_omitted, true);
  assert.equal(result.evidence.capability_lookup_status, 'admitted');
  assert.equal(result.evidence.execution_status, 'completed');
  assert.equal(result.evidence.output.proposed_action_packet.status, 'inert_proposal');
  assert.equal(result.evidence.output.proposed_action_packet.requires_canonical_admission, true);
  assert.equal(result.evidence.output_is_inert_until_admitted, true);
  assert.equal(result.evidence.canonical_admission_required, true);
  assert.equal(result.evidence.direct_task_lifecycle_mutation, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider_kind, 'openai_compatible');
  assert.equal(calls[0].capability_ref, 'cap_model_openai_ref');
  assert.equal(calls[0].credential_ref_present, true);
  assert.equal(calls[0].credential_ref, 'cred://model/openai');
  assert.doesNotMatch(evidenceText, /summarize task without storing/);
  assert.doesNotMatch(evidenceText, /raw model output/);
  assert.doesNotMatch(evidenceText, /raw closeout/);
  assert.doesNotMatch(evidenceText, /cred:\/\/model\/openai/);
});

test('provider adapter refuses missing capability and unknown provider without raw evidence', async () => {
  const siteRoot = tempSite();
  const missingCapability = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_provider_missing_capability',
    registration: registration(),
    input: { prompt: 'secret prompt token sk-testsecretvalue123456' },
    capabilityLookup: async () => null,
    providerRegistry: makeProviderRegistry({}),
  });
  const unknownProvider = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_provider_unknown',
    registration: registration({ provider_kind: 'unknown_provider' }),
    input: { prompt: 'secret prompt token sk-testsecretvalue123456' },
    capabilityLookup: async () => ({ granted: true, credential_ref: 'cred://known', consent_ref: 'consent://known' }),
    providerRegistry: makeProviderRegistry({}),
  });
  const missingText = fs.readFileSync(missingCapability.evidence_path, 'utf8');
  const unknownText = fs.readFileSync(unknownProvider.evidence_path, 'utf8');

  assert.equal(missingCapability.evidence.execution_status, 'refused');
  assert.equal(missingCapability.evidence.output.refusal_output.reason, 'missing_consent_record');
  assert.equal(unknownProvider.evidence.execution_status, 'refused');
  assert.equal(unknownProvider.evidence.output.refusal_output.reason, 'provider_adapter_not_registered');
  assert.equal(missingCapability.evidence.raw_secret_values_recorded, false);
  assert.doesNotMatch(missingText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(unknownText, /sk-testsecretvalue123456/);
});

test('provider adapter refuses secret-bearing capability lookup and provider failures', async () => {
  const siteRoot = tempSite();
  const secretCapability = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_provider_secret_capability',
    registration: registration(),
    input: { prompt: 'normal prompt' },
    capabilityLookup: async () => ({ granted: true, api_key: 'sk-testsecretvalue123456' }),
    providerRegistry: makeProviderRegistry({
      openai_compatible: () => ({ text: 'not called' }),
    }),
  });
  const failure = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_provider_failure',
    registration: registration(),
    input: { prompt: 'normal prompt' },
    capabilityLookup: async () => ({ granted: true, credential_ref: 'cred://model/openai', consent_ref: 'consent://operator/openai' }),
    providerRegistry: makeProviderRegistry({
      openai_compatible: () => {
        throw new Error('provider failed with password=hunter2');
      },
    }),
  });
  const secretText = fs.readFileSync(secretCapability.evidence_path, 'utf8');
  const failureText = fs.readFileSync(failure.evidence_path, 'utf8');

  assert.equal(secretCapability.evidence.output.refusal_output.reason, 'secret_bearing_capability_material');
  assert.equal(failure.evidence.output.refusal_output.reason, 'provider_failure');
  assert.equal(secretCapability.evidence.credential_secret_recorded, false);
  assert.equal(failure.evidence.raw_provider_output_recorded, false);
  assert.doesNotMatch(secretText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(failureText, /hunter2/);
});

test('provider adapter refuses bounded capability projection states before transport', async () => {
  const siteRoot = tempSite();
  const cases = [
    ['missing_capability_ref', registration({ capability_ref: null }), async () => ({ consent_ref: 'consent://x' })],
    ['missing_consent_record', registration(), async () => ({ granted: true, credential_ref: 'cred://model/openai' })],
    ['revoked_capability', registration(), async () => ({ consent_ref: 'consent://x', revoked: true })],
    ['stale_grant', registration(), async () => ({ consent_ref: 'consent://x', expires_at: '2026-05-15T00:00:00.000Z' })],
  ];

  for (const [reason, candidateRegistration, capabilityLookup] of cases) {
    let providerCalled = false;
    const result = await executeProviderAdapter({
      siteRoot,
      carrierSessionId: `carrier_session_provider_${reason}`,
      registration: candidateRegistration,
      input: { prompt: 'secret prompt token sk-testsecretvalue123456' },
      capabilityLookup,
      providerRegistry: makeProviderRegistry({
        openai_compatible: () => {
          providerCalled = true;
          return { text: 'should not be called' };
        },
      }),
      now: '2026-05-16T00:00:00.000Z',
    });
    const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');

    assert.equal(result.evidence.execution_status, 'refused');
    assert.equal(result.evidence.output.refusal_output.reason, reason);
    assert.equal(result.evidence.capability_lookup_status, 'refused');
    assert.equal(result.evidence.capability_lookup_refusal_reason, reason);
    assert.equal(providerCalled, false);
    assert.equal(result.evidence.direct_task_lifecycle_mutation, false);
    assert.equal(result.evidence.raw_secret_values_recorded, false);
    assert.doesNotMatch(evidenceText, /sk-testsecretvalue123456/);
    assert.doesNotMatch(evidenceText, /cred:\/\/model\/openai/);
  }
});
