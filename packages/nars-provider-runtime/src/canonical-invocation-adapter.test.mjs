import assert from 'node:assert/strict';
import test from 'node:test';

import { createCanonicalInvocationAdapter } from './canonical-invocation-adapter.mjs';

function invocation(overrides = {}) {
  return {
    plan: { options: { thinking: 'high' } },
    model: { id: 'model:kimi-k3', provider: { id: 'model-provider:kimi' } },
    modelProvider: { id: 'model-provider:kimi' },
    offering: {
      id: 'model-offering:gateway-kimi-k3',
      model: { id: 'model:kimi-k3' },
      model_provider: { id: 'model-provider:kimi' },
      inference_provider: { id: 'inference-provider:gateway' },
      endpoint: { id: 'inference-endpoint:gateway' },
      invocation_model_key: 'service/kimi-k3',
    },
    inferenceProvider: { id: 'inference-provider:gateway' },
    endpoint: { id: 'inference-endpoint:gateway', address: { kind: 'url', url: 'https://gateway.example.test/custom/invoke' } },
    adapter: { id: 'adapter:openai', runtime_family: 'node', protocol: { family: 'openai', operation: 'chat-completions', version: '1' } },
    credential: { id: 'credential-locator:gateway', store: 'env', reference: 'EXACT_GATEWAY_SECRET' },
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    ...overrides,
  };
}

test('canonical adapter uses exact plan-bound endpoint and invocation model key while ignoring selection env', async () => {
  let submitted = null;
  const events = [];
  const invocationScope = { kind: 'runtime-test', runtime_session_id: 'session-test' };
  const adapter = createCanonicalInvocationAdapter({
    runtimeContext: { invocationScope },
    env: {
      EXACT_GATEWAY_SECRET: 'credential-only',
      NARADA_INTELLIGENCE_PROVIDER: 'wrong-provider',
      NARADA_AI_MODEL: 'wrong-model',
      NARADA_AI_BASE_URL: 'https://wrong.example.test',
    },
    httpTransport: async (request) => {
      submitted = request;
      return { id: 'provider-request:1', choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } };
    },
    nowMs: (() => { let value = 10; return () => value += 5; })(),
  });
  const outcome = await adapter.invoke(invocation({ invocationEventSink: (event) => events.push(event) }));
  assert.equal(submitted.url.toString(), 'https://gateway.example.test/custom/invoke');
  assert.equal(submitted.body.model, 'service/kimi-k3');
  assert.equal(submitted.headers.Authorization, 'Bearer credential-only');
  assert.equal(outcome.admission, 'acknowledged');
  assert.equal(outcome.response.choices[0].message.content, 'ok');
  assert.deepEqual(outcome.usage, { input_tokens: 3, output_tokens: 2, latency_ms: 5 });
  assert.deepEqual(events[0].invocation_scope, invocationScope);
});

test('credential failure refuses before transport submission', async () => {
  let calls = 0;
  const adapter = createCanonicalInvocationAdapter({
    env: {},
    httpTransport: async () => { calls += 1; },
  });
  const outcome = await adapter.invoke(invocation());
  assert.equal(calls, 0);
  assert.equal(outcome.admission, 'not-acknowledged');
  assert.equal(outcome.transportSubmitted, false);
  assert.equal(outcome.error.code, 'credential-unavailable');
});

test('model publisher, inference service, and offering coordinates must remain factorized and coherent', async () => {
  const adapter = createCanonicalInvocationAdapter({ credentialResolver: async () => 'unused' });
  const outcome = await adapter.invoke(invocation({
    modelProvider: { id: 'model-provider:not-kimi' },
  }));
  assert.equal(outcome.error.code, 'canonical-coordinate-mismatch');
  assert.equal(outcome.transportSubmitted, false);
});
