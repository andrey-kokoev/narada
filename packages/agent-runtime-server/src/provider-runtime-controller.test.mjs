import assert from 'node:assert/strict';
import test from 'node:test';
import { createNarsProviderRuntimeController } from './provider-runtime-controller.mjs';

const env = {
  OPENAI_API_KEY: 'openai-secret',
  OPENAI_BASE_URL: 'https://openai.example.test',
  OPENAI_MODEL: 'openai-default',
  DEEPSEEK_API_KEY: 'deepseek-secret',
  DEEPSEEK_API_BASE_URL: 'https://deepseek.example.test',
  DEEPSEEK_MODEL: 'deepseek-default',
};

function createFixture({ busy = false } = {}) {
  const contexts = [];
  const transitions = [];
  let runtimeBusy = busy;
  const controller = createNarsProviderRuntimeController({
    env,
    runtimeContext: {
      intelligenceProvider: 'openai-api',
      siteRoot: 'D:/code/narada',
      providerSettings: {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: 'openai-initial',
        thinking: 'medium',
      },
    },
    createCall: ({ runtimeContext }) => {
      contexts.push(runtimeContext);
      return async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] });
    },
    isBusy: () => runtimeBusy,
    onTransition: (record) => transitions.push(record),
  });
  return { controller, contexts, transitions, setBusy: (value) => { runtimeBusy = value; } };
}

test('provider runtime controller refuses a switch while a turn boundary is busy', async () => {
  const fixture = createFixture({ busy: true });
  const result = await fixture.controller.reconfigure({ request_id: 'busy-1', model: 'openai-next' });
  assert.equal(result.terminal_state, 'refused');
  assert.deepEqual(fixture.transitions.map((record) => record.reconfiguration_state), [
    'requested', 'validating', 'refused',
  ]);
  assert.equal(fixture.controller.snapshot().model, 'openai-initial');
  assert.equal(JSON.stringify(result).includes('openai-secret'), false);
});

test('provider runtime controller refuses malformed explicit targets before binding', async () => {
  const fixture = createFixture();
  const result = await fixture.controller.reconfigure({ request_id: 'invalid-1', model: 42 });
  assert.equal(result.terminal_state, 'refused');
  assert.equal(result.reason, 'target_not_admitted');
  assert.equal(result.error, 'provider_runtime_reconfiguration_model_invalid');
  assert.deepEqual(fixture.transitions.map((record) => record.reconfiguration_state), [
    'requested', 'validating', 'refused',
  ]);
  assert.equal(fixture.contexts.length, 1);
  assert.equal(fixture.controller.snapshot().provider, 'openai-api');
});

test('provider runtime controller switches provider and model using provider-specific credentials', async () => {
  const fixture = createFixture();
  const result = await fixture.controller.reconfigure({
    request_id: 'switch-1',
    provider: 'deepseek-api',
    model: 'deepseek-next',
  });
  assert.equal(result.terminal_state, 'active');
  assert.deepEqual(fixture.transitions.map((record) => record.reconfiguration_state), [
    'requested', 'validating', 'admitted', 'switching', 'active',
  ]);
  assert.equal(fixture.controller.snapshot().provider, 'deepseek-api');
  assert.equal(fixture.controller.snapshot().model, 'deepseek-next');
  assert.equal(fixture.contexts.at(-1).intelligenceProvider, 'deepseek-api');
  assert.equal(fixture.contexts.at(-1).providerSettings.apiKey, 'deepseek-secret');
  assert.equal(fixture.contexts.at(-1).providerSettings.baseUrl, 'https://deepseek.example.test');
  assert.equal(fixture.transitions.at(-1).previous_provider, 'openai-api');
  assert.equal(fixture.transitions.at(-1).previous_model, 'openai-initial');
  assert.equal(JSON.stringify(result).includes('deepseek-secret'), false);
});

