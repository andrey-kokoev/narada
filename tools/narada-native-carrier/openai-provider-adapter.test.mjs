import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRegistration, registrationReadiness, writeRegistration } from './adapter-registration.mjs';
import { executeProviderAdapter, makeProviderRegistry } from './provider-adapter.mjs';
import {
  DEFAULT_OPENAI_CHAT_COMPLETIONS_ENDPOINT,
  OPENAI_PROVIDER_KIND,
  makeOpenAIProviderAdapter,
  normalizeOpenAIChatCompletionResponse,
  openaiRegistration,
} from './openai-provider-adapter.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-openai-'));
}

function validCapability() {
  return {
    granted: true,
    capability_ref: 'cap_model_openai_ref',
    credential_ref: 'cred://model/openai',
    consent_ref: 'consent://operator/openai',
    model: 'gpt-test-mini',
  };
}

test('openai provider kind registers as provider configured with capability reference', () => {
  const siteRoot = tempSite();
  const record = openaiRegistration({
    capability_ref: 'cap_model_openai_ref',
    model: 'gpt-test-mini',
  });
  const { readiness, path: registrationPath } = writeRegistration(siteRoot, record, {
    cap_model_openai_ref: true,
  });
  const persistedText = fs.readFileSync(registrationPath, 'utf8');
  const persisted = JSON.parse(persistedText);

  assert.equal(readiness.status, 'configured_provider_adapter');
  assert.equal(readiness.provider_kind, OPENAI_PROVIDER_KIND);
  assert.equal(readiness.capability_posture, 'capability_granted');
  assert.equal(registrationReadiness(readRegistration(siteRoot)).status, 'configured_provider_adapter');
  assert.deepEqual(persisted.provider_config_summary.keys, ['api_posture', 'endpoint_url', 'model']);
  assert.doesNotMatch(persistedText, /api\.openai\.com/);
  assert.doesNotMatch(persistedText, /gpt-test-mini/);
});

test('mocked openai invocation returns normalized inert adapter output without raw evidence', async () => {
  const siteRoot = tempSite();
  const calls = [];
  const prompt = 'summarize task with password=hunter2 and token sk-testsecretvalue123456';
  const result = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_success',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt, context: { task_number: 1303 } },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({
        transport: async (request) => {
          calls.push(request);
          return {
            choices: [
              { message: { content: 'raw OpenAI model output that must not persist' } },
            ],
          };
        },
      }),
    }),
    now: '2026-05-16T00:14:00.000Z',
  });
  const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint_url, DEFAULT_OPENAI_CHAT_COMPLETIONS_ENDPOINT);
  assert.equal(calls[0].credential_ref, 'cred://model/openai');
  assert.equal(calls[0].request_body.model, 'gpt-test-mini');
  assert.equal(calls[0].request_body.messages[0].content, prompt);
  assert.equal(result.evidence.provider_kind, OPENAI_PROVIDER_KIND);
  assert.equal(result.evidence.output.proposed_action_packet.status, 'inert_proposal');
  assert.equal(result.evidence.output.proposed_action_packet.requires_canonical_admission, true);
  assert.equal(result.evidence.output.raw_output_recorded, false);
  assert.equal(result.evidence.raw_secret_values_recorded, false);
  assert.doesNotMatch(evidenceText, /hunter2/);
  assert.doesNotMatch(evidenceText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(evidenceText, /raw OpenAI model output/);
  assert.doesNotMatch(evidenceText, /summarize task/);
});

test('openai adapter represents missing capability model rate limit and malformed response', async () => {
  const siteRoot = tempSite();
  const missingCapability = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_missing_capability',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => null,
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const missingModel = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_missing_model',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => ({ ...validCapability(), model: null }),
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const rateLimit = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_rate_limit',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({
        transport: async () => ({ error: { type: 'rate_limit_exceeded', message: 'raw rate-limit text' } }),
      }),
    }),
  });
  const malformed = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_malformed',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({ transport: async () => ({ choices: [] }) }),
    }),
  });

  assert.equal(missingCapability.evidence.output.refusal_output.reason, 'missing_consent_record');
  assert.equal(missingModel.evidence.output.refusal_output.reason, 'missing_model_configuration');
  assert.equal(rateLimit.evidence.output.refusal_output.reason, 'provider_rate_limited');
  assert.equal(malformed.evidence.output.refusal_output.reason, 'malformed_provider_response');
  assert.equal(malformed.evidence.execution_status, 'completed');
});

test('openai provider refusal failure and timeout are bounded and redacted', async () => {
  const siteRoot = tempSite();
  const providerRefusal = normalizeOpenAIChatCompletionResponse({
    error: { message: 'provider refused raw details that should not persist' },
  });
  const failure = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_failure',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt: 'prompt with password=hunter2' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({
        transport: async () => {
          throw new Error('transport failed with token sk-testsecretvalue123456');
        },
      }),
    }),
  });
  const timeout = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_openai_timeout',
    registration: openaiRegistration({ capability_ref: 'cap_model_openai_ref' }),
    input: { prompt: 'prompt with password=hunter2' },
    capabilityLookup: async () => validCapability(),
    timeoutMs: 1,
    providerRegistry: makeProviderRegistry({
      [OPENAI_PROVIDER_KIND]: makeOpenAIProviderAdapter({
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
