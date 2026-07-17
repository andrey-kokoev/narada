import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CARRIER_PROVIDER,
  PROVIDER_CREDENTIAL_REQUIREMENT_KINDS,
  PROVIDER_SUPPORT_STATES,
  admittedProviderNames,
  loadProviderAdapterContract,
  loadProviderMetadata,
  loadNaradaToolCallEnvelope,
  loadProviderRegistry,
  providerEnvironment,
  providerRuntimeEnvironment,
  redactProviderRuntimeBinding,
  resolveProviderRuntimeBinding,
  resolveProviderMetadata,
} from './carrier-provider-contract.mjs';

test('provider registry exposes carrier-level defaults and support states', () => {
  const registry = loadProviderRegistry();
  assert.equal(registry.schema, 'narada.carrier.provider_registry.v1');
  assert.equal(registry.default_provider, DEFAULT_CARRIER_PROVIDER);
  assert.deepEqual(registry.support_states, Object.values(PROVIDER_SUPPORT_STATES));
  assert.deepEqual(registry.credential_requirement_kinds, Object.values(PROVIDER_CREDENTIAL_REQUIREMENT_KINDS));
  assert.equal(registry.providers['codex-subscription'].support_state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
  assert.equal(registry.providers['kimi-api'].credential_secret_ref, 'narada/provider/kimi-api/api-key');
  assert.equal(registry.providers['kimi-api'].credential_requirement.kind, PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.API_KEY_SECRET);
  assert.equal(registry.providers['kimi-api'].credential_requirement.secret_ref, 'narada/provider/kimi-api/api-key');
  assert.deepEqual(registry.providers['kimi-api'].credential_requirement.env_names, ['KIMI_API_KEY']);
  assert.equal(registry.providers['openai-api'].credential_secret_ref, 'narada/provider/openai-api/api-key');
  assert.equal(registry.providers['deepseek-api'].support_state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
  assert.equal(registry.providers['deepseek-api'].default_model, 'deepseek-v4-flash');
  assert.deepEqual(registry.providers['deepseek-api'].available_models, ['deepseek-v4-flash', 'deepseek-v4-pro']);
  assert.deepEqual(registry.providers['deepseek-api'].cognition_defaults, {
    low: { model: 'deepseek-v4-flash', reasoning_effort: 'low' },
    medium: { model: 'deepseek-v4-flash', reasoning_effort: 'medium' },
    high: { model: 'deepseek-v4-pro', reasoning_effort: 'high' },
  });
  assert.equal(registry.providers['glm-api'].support_state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
  assert.equal(registry.providers['openrouter-api'].credential_secret_ref, 'narada/provider/openrouter-api/api-key');
  assert.equal(registry.providers['openrouter-api'].credential_requirement.kind, PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.API_KEY_SECRET);
  assert.deepEqual(registry.providers['openrouter-api'].credential_requirement.env_names, ['OPENROUTER_API_KEY']);
  assert.equal(registry.providers['codex-subscription'].credential_secret_ref, undefined);
  assert.equal(registry.providers['codex-subscription'].credential_requirement.kind, PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.LOCAL_CODEX_SUBSCRIPTION);
  assert.equal(registry.providers['codex-subscription'].default_model, 'gpt-5.6-sol');
  assert.equal(registry.providers['codex-subscription'].default_thinking, 'low');
  assert.deepEqual(registry.providers['codex-subscription'].model_catalog, { kind: 'codex_local_cache', max_age_ms: 86400000 });
  assert.deepEqual(registry.providers['kimi-api'].cognition_defaults.low, { model: 'kimi-k3', reasoning_effort: 'low' });
  assert.deepEqual(registry.providers['kimi-code-api'].cognition_defaults.low, { model: 'k3', reasoning_effort: 'low' });
  assert.deepEqual(registry.providers['openai-api'].cognition_defaults, {
    low: { model: 'gpt-5.6-luna', reasoning_effort: 'low' },
    medium: { model: 'gpt-5.6-terra', reasoning_effort: 'medium' },
    high: { model: 'gpt-5.6-sol', reasoning_effort: 'high' },
  });
  assert.deepEqual(registry.providers['codex-subscription'].cognition_defaults, {
    low: { model: 'gpt-5.6-luna', reasoning_effort: 'low' },
    medium: { model: 'gpt-5.6-terra', reasoning_effort: 'medium' },
    high: { model: 'gpt-5.6-sol', reasoning_effort: 'high' },
  });
  assert.deepEqual(registry.providers['openrouter-api'].cognition_defaults, {
    low: { model: 'z-ai/glm-5-turbo', reasoning_effort: 'low' },
    medium: { model: 'z-ai/glm-5.2', reasoning_effort: 'medium' },
    high: { model: 'z-ai/glm-5.2', reasoning_effort: 'high' },
  });
  for (const [provider, metadata] of Object.entries(registry.providers)) {
    assert.equal(Array.isArray(metadata.available_models), true, `${provider} must advertise available_models`);
    assert.equal(metadata.available_models.includes(metadata.default_model), true, `${provider} available_models must include default_model`);
    assert.equal(['none', 'low', 'medium', 'high', 'xhigh'].includes(metadata.default_thinking ?? 'medium'), true, `${provider} default_thinking must be valid`);
    for (const cognition of ['low', 'medium', 'high']) {
      const defaults = metadata.cognition_defaults?.[cognition];
      assert.equal(typeof defaults?.model, 'string', `${provider} ${cognition} cognition default must set model`);
      assert.equal(typeof defaults?.reasoning_effort, 'string', `${provider} ${cognition} cognition default must set reasoning_effort`);
      assert.equal(metadata.available_models.includes(defaults.model), true, `${provider} ${cognition} cognition model must be available`);
    }
  }
});

test('provider runtime binding is isolated from unrelated provider credentials', () => {
  const metadata = loadProviderMetadata();
  const env = {
    NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
    NARADA_AI_API_KEY: 'canonical-openai-decoy',
    NARADA_AI_BASE_URL: 'https://canonical-openai-decoy.invalid',
    OPENAI_API_KEY: 'openai-decoy',
    DEEPSEEK_API_KEY: 'deepseek-decoy',
    KIMI_API_KEY: 'kimi-decoy',
    KIMI_CODE_API_KEY: 'kimi-code-selected',
    ANTHROPIC_API_KEY: 'anthropic-decoy',
  };
  const binding = resolveProviderRuntimeBinding('kimi-code-api', { metadata, env });
  assert.equal(binding.provider_id, 'kimi-code-api');
  assert.equal(binding.base_url, 'https://api.kimi.com/coding/');
  assert.equal(binding.api_key, 'kimi-code-selected');
  assert.equal(binding.credential_source, 'provider_environment');
  assert.equal(binding.credential_fingerprint.startsWith('sha256:'), true);
  assert.equal(redactProviderRuntimeBinding(binding).api_key, undefined);
  const projected = providerRuntimeEnvironment(binding);
  assert.equal(projected.NARADA_AI_API_KEY, 'kimi-code-selected');
  assert.equal(projected.KIMI_CODE_API_KEY, 'kimi-code-selected');
  assert.equal(Object.hasOwn(projected, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(projected, 'KIMI_API_KEY'), false);
  assert.notEqual(binding.api_key, env.NARADA_AI_API_KEY);
  assert.notEqual(binding.base_url, env.NARADA_AI_BASE_URL);

  const changedDecoys = resolveProviderRuntimeBinding('kimi-code-api', {
    metadata,
    env: { ...env, OPENAI_API_KEY: 'changed-openai', KIMI_API_KEY: 'changed-kimi' },
  });
  assert.equal(changedDecoys.credential_fingerprint, binding.credential_fingerprint);
  assert.equal(changedDecoys.api_key, binding.api_key);
});

test('provider runtime binding fails closed for a missing selected credential', () => {
  const metadata = loadProviderMetadata();
  assert.throws(
    () => resolveProviderRuntimeBinding('kimi-code-api', {
      metadata,
      env: { OPENAI_API_KEY: 'unrelated-openai', KIMI_API_KEY: 'unrelated-kimi' },
    }),
    /provider_runtime_credential_missing:kimi-code-api/,
  );
});

test('provider environment uses provider-specific env precedence', () => {
  const metadata = loadProviderMetadata();
  assert.throws(() => resolveProviderMetadata('missing-provider', metadata), /provider_runtime_provider_unknown/);

  const kimi = providerEnvironment('kimi-api', metadata, {
    KIMI_API_BASE_URL: 'https://kimi.example',
    OPENAI_BASE_URL: 'https://generic.example',
    KIMI_MODEL: 'kimi-custom',
    OPENAI_MODEL: 'generic-model',
    KIMI_API_KEY: 'kimi-native-key',
  });

  assert.equal(kimi.baseUrl, 'https://kimi.example');
  assert.equal(kimi.model, 'kimi-custom');
  assert.equal(kimi.apiKey, 'kimi-native-key');
  assert.deepEqual(kimi.availableModels, ['kimi-k2.5', 'kimi-k2.6', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k3']);

  const kimiCode = providerEnvironment('kimi-code-api', metadata, {
    KIMI_CODE_API_KEY: 'kimi-code-native-key',
  });

  assert.equal(kimiCode.baseUrl, 'https://api.kimi.com/coding/');
  assert.equal(kimiCode.model, 'k3');
  assert.equal(kimiCode.apiKey, 'kimi-code-native-key');

  const glm = providerEnvironment('glm-api', metadata, {
    GLM_API_KEY: 'glm-native-key',
    GLM_MODEL: 'GLM-5.2',
  });

  assert.equal(glm.baseUrl, 'https://open.bigmodel.cn/api/paas/v4/');
  assert.equal(glm.model, 'GLM-5.2');
  assert.equal(glm.apiKey, 'glm-native-key');
  assert.deepEqual(glm.availableModels, ['GLM-5.2', 'GLM-5V-Turbo', 'GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.6']);

  const openai = providerEnvironment('openai-api', metadata, {
    OPENAI_API_KEY: 'openai-native-key',
  });
  assert.equal(openai.apiKey, 'openai-native-key');

  const noGenericFallback = providerEnvironment('kimi-api', metadata, {
    UNUSED_API_KEY: 'generic-key',
  });
  assert.equal(noGenericFallback.apiKey, '');

  const openrouter = providerEnvironment('openrouter-api', metadata, {
    OPENROUTER_BASE_URL: 'https://openrouter.example/api/',
    OPENROUTER_MODEL: 'openrouter/test-model',
    OPENROUTER_API_KEY: 'openrouter-native-key',
  });
  assert.equal(openrouter.baseUrl, 'https://openrouter.example/api/');
  assert.equal(openrouter.model, 'openrouter/test-model');
  assert.equal(openrouter.apiKey, 'openrouter-native-key');
});

test('provider adapter contract lists admitted carrier providers', () => {
  const contract = loadProviderAdapterContract();
  assert.equal(contract.schema, 'narada.agent_tui.provider_adapter_contract.v0');
  assert.deepEqual(admittedProviderNames(contract), [
    'codex-subscription',
    'kimi-api',
    'kimi-code-api',
    'openai-api',
    'anthropic-api',
    'deepseek-api',
    'glm-api',
    'openrouter-api',
  ]);
});

test('narada tool-call envelope fixture names the envelope key and example', () => {
  const contract = loadNaradaToolCallEnvelope();
  assert.equal(contract.schema, 'narada.carrier.provider_tool_call_envelope.v1');
  assert.equal(contract.envelope_key, 'narada_tool_call');
  assert.equal(contract.example.narada_tool_call.name, 'mcp_output_show');
  assert.equal(contract.example.narada_tool_call.arguments.output_ref, 'mcp_output:o_6cd77433e384445e976c7fdf');
});
