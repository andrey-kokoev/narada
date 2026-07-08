import assert from 'node:assert/strict';
import test from 'node:test';
import { executeRuntimeAffordanceAction } from './affordance-actions.mjs';

function makeContext(overrides = {}) {
  return {
    state: {
      sessionSettings: {
        provider: 'codex-subscription',
        model: 'gpt-5.5',
        thinking: 'medium',
      },
    },
    providerSettings: {
      provider: 'codex-subscription',
      available_providers: ['codex-subscription', 'openai-api', 'deepseek-api'],
      model: 'gpt-5.5',
      thinking: 'medium',
      ...overrides.providerSettings,
    },
    env: {
      OPENAI_API_KEY: 'secret',
      DEEPSEEK_API_KEY: 'secret',
      ...overrides.env,
    },
  };
}

test('runtime affordance action can switch provider and preserve other intelligence settings', () => {
  const context = makeContext();
  const result = executeRuntimeAffordanceAction({
    requestId: 'req-1',
    surfaceId: 'nars.runtime.intelligence',
    actionId: 'set_provider',
    target: { kind: 'runtime', operation: 'set_provider' },
    args: { provider: 'openai-api' },
    context,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.result.operation, 'set_provider');
  assert.equal(result.result.intelligence.provider, 'openai-api');
  assert.equal(result.result.intelligence.model, 'gpt-5.5');
  assert.equal(result.result.intelligence.thinking, 'medium');
  assert.equal(context.state.sessionSettings.provider, 'openai-api');
});

test('runtime affordance action refuses provider switch when auth is missing', () => {
  const context = makeContext({ env: { OPENAI_API_KEY: '' } });
  const result = executeRuntimeAffordanceAction({
    requestId: 'req-2',
    surfaceId: 'nars.runtime.intelligence',
    actionId: 'set_provider',
    target: { kind: 'runtime', operation: 'set_provider' },
    args: { provider: 'openai-api' },
    context,
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'affordance_action_target_not_executable');
  assert.equal(context.state.sessionSettings.provider, 'codex-subscription');
});
