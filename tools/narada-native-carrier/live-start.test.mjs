import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveStartEvidence, buildMissingRuntimeHandle } from './live-start.mjs';
import { buildLocalProcessRuntimeHandle } from './runtime-handle.mjs';

const NOW = '2026-05-16T03:30:00.000Z';

function assertNoEffects(evidence) {
  assert.equal(evidence.provider_transport_invoked, false);
  assert.equal(evidence.narada_mutation_performed, false);
  assert.equal(evidence.raw_transcript_recorded, false);
  assert.equal(evidence.raw_prompt_recorded, false);
  assert.equal(evidence.raw_provider_output_recorded, false);
  assert.equal(evidence.raw_secret_values_recorded, false);
  for (const value of Object.values(evidence.mutation_flags)) assert.equal(value, false);
}

test('live start evidence records fixture-only runtime and reachability posture', async () => {
  const evidence = await buildLiveStartEvidence({
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'carrier_session_fixture_start',
    agentId: 'narada.builder',
    now: NOW,
  });

  assert.equal(evidence.status, 'started');
  assert.deepEqual(evidence.blocked_reasons, []);
  assert.equal(evidence.runtime_handle.kind, 'fixture');
  assert.equal(evidence.reachability.to_data.status, 'reachable');
  assert.equal(evidence.reachability.to_intelligence.status, 'fixture_only');
  assertNoEffects(evidence);
});

test('live start evidence records provider-configured posture without provider call', async () => {
  let capabilityLookups = 0;
  const evidence = await buildLiveStartEvidence({
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'carrier_session_provider_start',
    agentId: 'narada.builder',
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    capabilityLookup: async () => {
      capabilityLookups += 1;
      return {
        granted: true,
        credential_ref: 'credential://model/openai',
        consent_ref: 'consent://operator/model-openai',
        scopes: ['model.invoke'],
      };
    },
    now: NOW,
  });
  const text = JSON.stringify(evidence);

  assert.equal(capabilityLookups, 1);
  assert.equal(evidence.status, 'started');
  assert.equal(evidence.reachability.to_intelligence.status, 'provider_configured_not_invoked');
  assert.equal(evidence.capability_projection.credential_ref_present, true);
  assert.doesNotMatch(text, /credential:\/\/model\/openai/);
  assertNoEffects(evidence);
});

test('live start evidence blocks missing capability stale revoked and missing registration', async () => {
  const missing = await buildLiveStartEvidence({
    carrierSessionId: 'carrier_session_missing_capability',
    agentId: 'narada.builder',
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    capabilityLookup: async () => null,
    now: NOW,
  });
  const stale = await buildLiveStartEvidence({
    carrierSessionId: 'carrier_session_stale',
    agentId: 'narada.builder',
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    capabilityLookup: async () => ({ consent_ref: 'consent://x', expires_at: '2026-05-15T00:00:00.000Z' }),
    now: NOW,
  });
  const revoked = await buildLiveStartEvidence({
    carrierSessionId: 'carrier_session_revoked',
    agentId: 'narada.builder',
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    capabilityLookup: async () => ({ consent_ref: 'consent://x', revoked: true }),
    now: NOW,
  });
  const missingRegistration = await buildLiveStartEvidence({
    carrierSessionId: 'carrier_session_missing_registration',
    agentId: 'narada.builder',
    requireRegistration: true,
    now: NOW,
  });

  assert.equal(missing.status, 'blocked');
  assert.ok(missing.blocked_reasons.includes('blocked_missing_capability'));
  assert.equal(stale.status, 'blocked');
  assert.ok(stale.blocked_reasons.includes('blocked_stale_grant'));
  assert.equal(revoked.status, 'blocked');
  assert.ok(revoked.blocked_reasons.includes('blocked_revoked_grant'));
  assert.equal(missingRegistration.status, 'blocked');
  assert.ok(missingRegistration.blocked_reasons.includes('blocked_missing_registration'));
  for (const evidence of [missing, stale, revoked, missingRegistration]) assertNoEffects(evidence);
});

test('live start evidence blocks missing required local executable and missing runtime handle', async () => {
  const runtimeUnavailable = await buildLiveStartEvidence({
    carrierSessionId: 'carrier_session_runtime_unavailable',
    agentId: 'narada.builder',
    runtimeHandle: buildMissingRuntimeHandle({ checkedAt: NOW }),
    now: NOW,
  });
  const executableMissing = await buildLiveStartEvidence({
    carrierSessionId: 'carrier_session_executable_missing',
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 1234,
      startedAt: NOW,
      heartbeatDueAt: '2026-05-16T03:35:00.000Z',
    }),
    requiredLocalExecutable: 'narada-native-runner',
    executableAvailable: false,
    now: NOW,
  });

  assert.equal(runtimeUnavailable.status, 'blocked');
  assert.ok(runtimeUnavailable.blocked_reasons.includes('blocked_runtime_unavailable'));
  assert.equal(executableMissing.status, 'blocked');
  assert.ok(executableMissing.blocked_reasons.includes('blocked_runtime_executable_missing'));
  assert.equal(executableMissing.required_local_executable.present, false);
  assertNoEffects(runtimeUnavailable);
  assertNoEffects(executableMissing);
});
