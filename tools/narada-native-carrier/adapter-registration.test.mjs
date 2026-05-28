import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeAndClose } from './harness.mjs';
import { runFixtureWorkLoop } from './work-loop.mjs';
import { operationalReadiness } from './readiness.mjs';
import { registrationReadiness, writeRegistration } from './adapter-registration.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-registration-'));
}

test('adapter registration readiness falls back to fixture without capability', () => {
  const readiness = registrationReadiness();

  assert.equal(readiness.status, 'fixture_fallback');
  assert.equal(readiness.provider_kind, 'fixture');
  assert.equal(readiness.capability_posture, 'not_required_for_fixture');
  assert.equal(readiness.registration.raw_provider_config_recorded, false);
  assert.equal(readiness.registration.raw_secret_values_recorded, false);
});

test('provider adapter registration records capability reference and omits config values', () => {
  const siteRoot = tempSite();
  const record = {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    model_posture: 'provider_configured',
    executor_posture: 'no_effect',
    supported_request_classes: ['prompt_context'],
    supported_response_classes: ['inert_proposal', 'refusal'],
    provider_config: {
      endpoint: 'https://example.invalid/v1',
      model: 'model-name',
    },
  };
  const { readiness, path: registrationPath } = writeRegistration(siteRoot, record, {
    cap_model_openai_ref: true,
  });
  const persistedText = fs.readFileSync(registrationPath, 'utf8');
  const persisted = JSON.parse(persistedText);

  assert.equal(readiness.status, 'configured_provider_adapter');
  assert.equal(readiness.capability_posture, 'capability_granted');
  assert.equal(persisted.capability_ref, 'cap_model_openai_ref');
  assert.deepEqual(persisted.provider_config_summary.keys, ['endpoint', 'model']);
  assert.equal(persisted.raw_provider_config_recorded, false);
  assert.equal(persisted.raw_secret_values_recorded, false);
  assert.doesNotMatch(persistedText, /example\.invalid/);
  assert.doesNotMatch(persistedText, /model-name/);
});

test('provider adapter registration refuses missing or ungranted capability', () => {
  const missing = registrationReadiness({
    adapter_id: 'provider-missing',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
  });
  const ungranted = registrationReadiness({
    adapter_id: 'provider-ungranted',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_missing',
  }, {});

  assert.equal(missing.status, 'refused');
  assert.equal(missing.capability_posture, 'missing_capability_ref');
  assert.equal(ungranted.status, 'refused');
  assert.equal(ungranted.capability_posture, 'invalid_or_ungranted_capability');
});

test('adapter registration refuses secret-bearing provider configuration', () => {
  const siteRoot = tempSite();
  const { readiness, path: registrationPath } = writeRegistration(siteRoot, {
    adapter_id: 'provider-secret',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: {
      api_key: 'sk-testsecretvalue123456',
      endpoint: 'https://example.invalid/v1',
    },
  }, { cap_model_openai_ref: true });

  assert.equal(readiness.status, 'refused');
  assert.equal(readiness.capability_posture, 'secret_bearing_configuration');
  assert.equal(registrationPath, null);
  assert.deepEqual(readiness.refusal.secret_findings, ['api_key']);
});

test('adapter registration refuses unsafe evidence policy overrides', () => {
  const siteRoot = tempSite();
  const { readiness, path: registrationPath } = writeRegistration(siteRoot, {
    adapter_id: 'provider-unsafe-policy',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: {
      endpoint: 'https://example.invalid/v1',
    },
    evidence_policy: {
      raw_prompts_recorded: true,
      raw_outputs_recorded: true,
      raw_secret_values_recorded: true,
      unbounded_transcripts_recorded: true,
    },
  }, { cap_model_openai_ref: true });
  const fixture = registrationReadiness().registration;

  assert.equal(readiness.status, 'refused');
  assert.equal(readiness.capability_posture, 'unsafe_evidence_policy');
  assert.equal(registrationPath, null);
  assert.deepEqual(readiness.refusal.unsafe_evidence_policy_keys, [
    'raw_prompts_recorded',
    'raw_outputs_recorded',
    'raw_secret_values_recorded',
    'unbounded_transcripts_recorded',
  ]);
  assert.equal(fixture.evidence_policy.raw_prompts_recorded, false);
  assert.equal(fixture.evidence_policy.raw_outputs_recorded, false);
  assert.equal(fixture.evidence_policy.raw_secret_values_recorded, false);
  assert.equal(fixture.evidence_policy.unbounded_transcripts_recorded, false);
});

test('operational readiness reports adapter registration posture without exposing secrets', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_registration';
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: {
      endpoint: 'https://example.invalid/v1',
      model: 'model-name',
    },
  }, { cap_model_openai_ref: true });
  materializeAndClose({
    siteRoot,
    agentId: 'narada.builder',
    carrierSessionId,
    agentStartEventId: 'agent_start_registration',
    now: '2026-05-15T21:40:00.000Z',
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1297, prompt: 'inspect adapter registration' },
    now: '2026-05-15T21:40:01.000Z',
  });
  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  const readinessText = JSON.stringify(readiness);

  assert.equal(readiness.adapter_registration_readiness.status, 'configured_provider_adapter');
  assert.equal(readiness.adapter_registration_readiness.capability_posture, 'capability_reference_recorded');
  assert.deepEqual(readiness.residual_blockers, []);
  assert.doesNotMatch(readinessText, /example\.invalid/);
  assert.doesNotMatch(readinessText, /model-name/);
});
