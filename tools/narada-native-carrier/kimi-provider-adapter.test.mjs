import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRegistration, writeRegistration, registrationReadiness } from './adapter-registration.mjs';
import { executeProviderAdapter, makeProviderRegistry } from './provider-adapter.mjs';
import {
  KIMI_PROVIDER_KIND,
  kimiRegistration,
  makeKimiProviderAdapter,
  normalizeKimiChatCompletionResponse,
} from './kimi-provider-adapter.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-kimi-'));
}

function validCapability() {
  return {
    granted: true,
    capability_ref: 'cap_model_kimi_ref',
    credential_ref: 'cred://model/kimi',
    consent_ref: 'consent://operator/kimi',
    endpoint_url: 'https://api.moonshot.invalid/v1/chat/completions',
    model: 'kimi-k2-test',
  };
}

test('kimi provider kind registers as provider configured with capability reference', () => {
  const siteRoot = tempSite();
  const record = kimiRegistration({
    capability_ref: 'cap_model_kimi_ref',
    endpoint_url: 'https://api.moonshot.invalid/v1/chat/completions',
    model: 'kimi-k2-test',
  });
  const { readiness, path: registrationPath } = writeRegistration(siteRoot, record, {
    cap_model_kimi_ref: true,
  });
  const persistedText = fs.readFileSync(registrationPath, 'utf8');
  const persisted = JSON.parse(persistedText);

  assert.equal(readiness.status, 'configured_provider_adapter');
  assert.equal(readiness.provider_kind, KIMI_PROVIDER_KIND);
  assert.equal(readiness.capability_posture, 'capability_granted');
  assert.equal(registrationReadiness(readRegistration(siteRoot)).status, 'configured_provider_adapter');
  assert.deepEqual(persisted.provider_config_summary.keys, ['endpoint_url', 'model']);
  assert.doesNotMatch(persistedText, /moonshot\.invalid/);
  assert.doesNotMatch(persistedText, /kimi-k2-test/);
});

test('mocked kimi invocation returns normalized inert adapter output without raw evidence', async () => {
  const siteRoot = tempSite();
  const calls = [];
  const prompt = 'classify task with password=hunter2 and token sk-testsecretvalue123456';
  const result = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_success',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt, context: { task_number: 1302 } },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({
        transport: async (request) => {
          calls.push(request);
          return {
            choices: [
              { message: { content: 'raw Kimi model output that must not persist' } },
            ],
          };
        },
      }),
    }),
    now: '2026-05-16T00:12:00.000Z',
  });
  const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint_url, 'https://api.moonshot.invalid/v1/chat/completions');
  assert.equal(calls[0].credential_ref, 'cred://model/kimi');
  assert.equal(calls[0].request_body.model, 'kimi-k2-test');
  assert.equal(calls[0].request_body.messages[0].content, prompt);
  assert.equal(result.evidence.provider_kind, KIMI_PROVIDER_KIND);
  assert.equal(result.evidence.output.proposed_action_packet.status, 'inert_proposal');
  assert.equal(result.evidence.output.proposed_action_packet.requires_canonical_admission, true);
  assert.equal(result.evidence.output.raw_output_recorded, false);
  assert.equal(result.evidence.raw_secret_values_recorded, false);
  assert.doesNotMatch(evidenceText, /hunter2/);
  assert.doesNotMatch(evidenceText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(evidenceText, /raw Kimi model output/);
  assert.doesNotMatch(evidenceText, /classify task/);
});

test('kimi adapter represents missing capability endpoint model refusal and malformed response', async () => {
  const siteRoot = tempSite();
  const missingCapability = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_missing_capability',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => null,
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const missingEndpoint = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_missing_endpoint',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => ({ ...validCapability(), endpoint_url: null }),
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const missingModel = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_missing_model',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => ({ ...validCapability(), model: null }),
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const malformed = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_malformed',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({ transport: async () => ({ choices: [] }) }),
    }),
  });

  assert.equal(missingCapability.evidence.output.refusal_output.reason, 'missing_consent_record');
  assert.equal(missingEndpoint.evidence.output.refusal_output.reason, 'missing_endpoint_configuration');
  assert.equal(missingModel.evidence.output.refusal_output.reason, 'missing_model_configuration');
  assert.equal(malformed.evidence.output.refusal_output.reason, 'malformed_provider_response');
  assert.equal(malformed.evidence.execution_status, 'completed');
});

test('kimi provider refusal failure and timeout are bounded and redacted', async () => {
  const siteRoot = tempSite();
  const providerRefusal = normalizeKimiChatCompletionResponse({
    error: { message: 'provider refused raw details that should not persist' },
  });
  const failure = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_failure',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt: 'prompt with password=hunter2' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({
        transport: async () => {
          throw new Error('transport failed with token sk-testsecretvalue123456');
        },
      }),
    }),
  });
  const timeout = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_kimi_timeout',
    registration: kimiRegistration({ capability_ref: 'cap_model_kimi_ref' }),
    input: { prompt: 'prompt with password=hunter2' },
    capabilityLookup: async () => validCapability(),
    timeoutMs: 1,
    providerRegistry: makeProviderRegistry({
      [KIMI_PROVIDER_KIND]: makeKimiProviderAdapter({
        transport: () => new Promise((resolve) => setTimeout(() => resolve({ choices: [] }), 50)),
      }),
    }),
  });
  const failureText = fs.readFileSync(failure.evidence_path, 'utf8');
  const timeoutText = fs.readFileSync(timeout.evidence_path, 'utf8');

  assert.equal(providerRefusal.status, 'refused');
  assert.equal(providerRefusal.reason, 'provider_refused');
  assert.equal(failure.evidence.output.refusal_output.reason, 'provider_failure');
  assert.equal(timeout.evidence.output.refusal_output.reason, 'provider_timeout');
  assert.doesNotMatch(failureText, /hunter2/);
  assert.doesNotMatch(failureText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(timeoutText, /hunter2/);
});
