import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRegistration, registrationReadiness, writeRegistration } from './adapter-registration.mjs';
import { executeProviderAdapter, makeProviderRegistry } from './provider-adapter.mjs';
import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_ANTHROPIC_MESSAGES_ENDPOINT,
  anthropicRegistration,
  makeAnthropicProviderAdapter,
  normalizeAnthropicMessagesResponse,
} from './anthropic-provider-adapter.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-anthropic-'));
}

function validCapability() {
  return {
    granted: true,
    capability_ref: 'cap_model_anthropic_ref',
    credential_ref: 'cred://model/anthropic',
    consent_ref: 'consent://operator/anthropic',
    model: 'claude-test-sonnet',
  };
}

test('anthropic provider kind registers as provider configured with capability reference', () => {
  const siteRoot = tempSite();
  const record = anthropicRegistration({
    capability_ref: 'cap_model_anthropic_ref',
    model: 'claude-test-sonnet',
  });
  const { readiness, path: registrationPath } = writeRegistration(siteRoot, record, {
    cap_model_anthropic_ref: true,
  });
  const persistedText = fs.readFileSync(registrationPath, 'utf8');
  const persisted = JSON.parse(persistedText);

  assert.equal(readiness.status, 'configured_provider_adapter');
  assert.equal(readiness.provider_kind, ANTHROPIC_PROVIDER_KIND);
  assert.equal(readiness.capability_posture, 'capability_granted');
  assert.equal(registrationReadiness(readRegistration(siteRoot)).status, 'configured_provider_adapter');
  assert.deepEqual(persisted.provider_config_summary.keys, ['api_posture', 'endpoint_url', 'model']);
  assert.doesNotMatch(persistedText, /api\.anthropic\.com/);
  assert.doesNotMatch(persistedText, /claude-test-sonnet/);
});

test('mocked anthropic invocation returns normalized inert adapter output without raw evidence', async () => {
  const siteRoot = tempSite();
  const calls = [];
  const prompt = 'summarize task with password=hunter2 and token sk-testsecretvalue123456';
  const result = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_success',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt, context: { task_number: 1304 } },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({
        transport: async (request) => {
          calls.push(request);
          return {
            content: [
              { type: 'text', text: 'raw Anthropic model output that must not persist' },
            ],
          };
        },
      }),
    }),
    now: '2026-05-16T00:16:00.000Z',
  });
  const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint_url, DEFAULT_ANTHROPIC_MESSAGES_ENDPOINT);
  assert.equal(calls[0].credential_ref, 'cred://model/anthropic');
  assert.equal(calls[0].request_body.model, 'claude-test-sonnet');
  assert.equal(calls[0].request_body.messages[0].content, prompt);
  assert.equal(result.evidence.provider_kind, ANTHROPIC_PROVIDER_KIND);
  assert.equal(result.evidence.output.proposed_action_packet.status, 'inert_proposal');
  assert.equal(result.evidence.output.proposed_action_packet.requires_canonical_admission, true);
  assert.equal(result.evidence.output.raw_output_recorded, false);
  assert.equal(result.evidence.raw_secret_values_recorded, false);
  assert.doesNotMatch(evidenceText, /hunter2/);
  assert.doesNotMatch(evidenceText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(evidenceText, /raw Anthropic model output/);
  assert.doesNotMatch(evidenceText, /summarize task/);
});

test('anthropic adapter represents missing capability model rate limit and malformed response', async () => {
  const siteRoot = tempSite();
  const missingCapability = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_missing_capability',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => null,
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const missingModel = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_missing_model',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => ({ ...validCapability(), model: null }),
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({ transport: async () => ({}) }),
    }),
  });
  const rateLimit = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_rate_limit',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({
        transport: async () => ({ error: { type: 'rate_limit_error', message: 'raw rate-limit text' } }),
      }),
    }),
  });
  const malformed = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_malformed',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt: 'prompt omitted from evidence' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({ transport: async () => ({ content: [] }) }),
    }),
  });

  assert.equal(missingCapability.evidence.output.refusal_output.reason, 'missing_consent_record');
  assert.equal(missingModel.evidence.output.refusal_output.reason, 'missing_model_configuration');
  assert.equal(rateLimit.evidence.output.refusal_output.reason, 'provider_rate_limited');
  assert.equal(malformed.evidence.output.refusal_output.reason, 'malformed_provider_response');
  assert.equal(malformed.evidence.execution_status, 'completed');
});

test('anthropic provider refusal failure and timeout are bounded and redacted', async () => {
  const siteRoot = tempSite();
  const providerRefusal = normalizeAnthropicMessagesResponse({
    error: { message: 'provider refused raw details that should not persist' },
  });
  const failure = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_failure',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt: 'prompt with password=hunter2' },
    capabilityLookup: async () => validCapability(),
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({
        transport: async () => {
          throw new Error('transport failed with token sk-testsecretvalue123456');
        },
      }),
    }),
  });
  const timeout = await executeProviderAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_anthropic_timeout',
    registration: anthropicRegistration({ capability_ref: 'cap_model_anthropic_ref' }),
    input: { prompt: 'prompt with password=hunter2' },
    capabilityLookup: async () => validCapability(),
    timeoutMs: 1,
    providerRegistry: makeProviderRegistry({
      [ANTHROPIC_PROVIDER_KIND]: makeAnthropicProviderAdapter({
        transport: () => new Promise((resolve) => setTimeout(() => resolve({ content: [] }), 50)),
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
