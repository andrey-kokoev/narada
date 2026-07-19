import assert from 'node:assert/strict';
import test from 'node:test';

import { D1RegistryStore } from '@narada2/invokable-intelligence-registry/d1';
import { createFakeD1 } from '@narada2/invokable-intelligence-registry';
import { deterministicId } from '@narada2/invokable-intelligence-resolver';

import { createCloudflareAiProviderAdapter } from './cloudflare-worker.mjs';
import { cloudflareIntelligenceResolutionConfigured } from './cloudflare-intelligence-resolution.mjs';

const CARRIER_TURN_INTENT_ID = deterministicId('intent', {
  purpose: 'carrier-turn',
  principal: null,
  requiredCapabilities: [],
  requestedModel: null,
  requestedOptions: {},
});

function makeAi(resultOrError, calls = []) {
  return {
    calls,
    async run(model, request) {
      calls.push({ model, request });
      if (resultOrError instanceof Error) throw resultOrError;
      return resultOrError;
    },
  };
}

function configuredEnv(overrides = {}) {
  return {
    AI: makeAi({ response: 'cf-ok' }),
    INTELLIGENCE_REGISTRY_DB: createFakeD1(':memory:'),
    INTELLIGENCE_TARGET_SITE: 'site:thoughts-project',
    INTELLIGENCE_USER_SITE: 'site:andrey-user',
    INTELLIGENCE_HOST_SITE: 'site:andrey-pc',
    CLOUDFLARE_CARRIER_AI_MODEL: 'env-selection-must-not-win',
    ...overrides,
  };
}

test('resolver-driven: plan model wins over env selection, chain persisted, planned adapter only', async () => {
  const env = configuredEnv();
  assert.equal(cloudflareIntelligenceResolutionConfigured(env), true);
  const adapter = createCloudflareAiProviderAdapter(env);
  assert.equal(adapter.model, null);
  assert.equal(adapter.resolution, 'invokable-intelligence');

  const result = await adapter.run({ input: 'hello' });
  assert.equal(result.text, 'cf-ok');
  assert.equal(env.AI.calls.length, 1);
  assert.equal(env.AI.calls[0].model, '@cf/meta/llama-3.1-8b-instruct', 'plan-selected model, not the env var');

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const catalogModels = await store.listResources({ kind: 'model' });
  assert.ok(catalogModels.length > 0, 'workers-ai catalog seeded into D1');

  const plan = await store.getPlanByIntent(CARRIER_TURN_INTENT_ID);
  assert.ok(plan, 'plan persisted in D1');
  assert.equal(plan.selected.adapter.id, 'adapter:workers-ai-binding');
  const attempts = await store.listAttempts(plan.id);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].state, 'succeeded');
  const evidence = await store.listEvidence(attempts[0].id);
  assert.equal(evidence.length, 1);
  await store.close();
});

test('replay: a second carrier turn reuses the recorded plan and dedups the attempt', async () => {
  const env = configuredEnv();
  const adapter = createCloudflareAiProviderAdapter(env);
  await adapter.run({ input: 'one' });
  await adapter.run({ input: 'two' });
  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const plan = await store.getPlanByIntent(CARRIER_TURN_INTENT_ID);
  const attempts = await store.listAttempts(plan.id);
  assert.equal(attempts.length, 1, 'retries upsert the same attempt, never duplicate');
  await store.close();
});

test('refusal is typed and distinct from provider/session failures', async () => {
  const fake = createFakeD1(':memory:');
  // Preload locus sites WITHOUT catalog models: zero candidates, and the
  // catalog seeder no-ops because resources exist.
  const store = await D1RegistryStore.open(fake);
  for (const id of ['site:thoughts-project', 'site:andrey-user', 'site:andrey-pc']) {
    await store.putResource({ schema: 'narada.invokable-intelligence.site.v1', id });
  }
  await store.close();

  const env = configuredEnv({ INTELLIGENCE_REGISTRY_DB: fake });
  const adapter = createCloudflareAiProviderAdapter(env);
  await assert.rejects(adapter.run({ input: 'hello' }), (error) => {
    assert.ok(String(error.message).startsWith('intelligence_resolution_refused:no-candidates'));
    assert.ok(error.refusal);
    assert.equal(env.AI.calls.length, 0, 'no provider invocation on refusal');
    return true;
  });
});

test('provider failure is recorded as a failed attempt with a structured code', async () => {
  const env = configuredEnv({ AI: makeAi(new Error('upstream 500')) });
  const adapter = createCloudflareAiProviderAdapter(env);
  await assert.rejects(adapter.run({ input: 'hello' }), (error) => {
    assert.equal(error.code, 'cloudflare_workers_ai_provider_failed');
    return true;
  });
  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const plan = await store.getPlanByIntent(CARRIER_TURN_INTENT_ID);
  assert.ok(plan);
  const attempts = await store.listAttempts(plan.id);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].state, 'failed');
  assert.equal(attempts[0].error.code, 'cloudflare_workers_ai_provider_failed');
  await store.close();
});

test('legacy env path is unchanged when resolution is not configured', async () => {
  const env = {
    AI: makeAi({ response: 'legacy-ok' }),
    CLOUDFLARE_CARRIER_AI_MODEL: 'legacy-model-x',
  };
  assert.equal(cloudflareIntelligenceResolutionConfigured(env), false);
  const adapter = createCloudflareAiProviderAdapter(env);
  assert.equal(adapter.model, 'legacy-model-x');
  assert.equal(adapter.resolution, 'legacy-env');
  const result = await adapter.run({ input: 'hello' });
  assert.equal(result.text, 'legacy-ok');
  assert.equal(env.AI.calls[0].model, 'legacy-model-x');
});
