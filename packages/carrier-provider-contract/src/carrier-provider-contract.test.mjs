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
  assert.equal(registry.providers['glm-api'].support_state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
  assert.equal(registry.providers['openrouter-api'].credential_secret_ref, 'narada/provider/openrouter-api/api-key');
  assert.equal(registry.providers['openrouter-api'].credential_requirement.kind, PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.API_KEY_SECRET);
  assert.deepEqual(registry.providers['openrouter-api'].credential_requirement.env_names, ['OPENROUTER_API_KEY']);
  assert.equal(registry.providers['codex-subscription'].credential_secret_ref, undefined);
  assert.equal(registry.providers['codex-subscription'].credential_requirement.kind, PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.LOCAL_CODEX_SUBSCRIPTION);
  for (const [provider, metadata] of Object.entries(registry.providers)) {
    assert.equal(Array.isArray(metadata.available_models), true, `${provider} must advertise available_models`);
    assert.equal(metadata.available_models.includes(metadata.default_model), true, `${provider} available_models must include default_model`);
    for (const cognition of ['low', 'medium', 'high']) {
      const defaults = metadata.cognition_defaults?.[cognition];
      assert.equal(typeof defaults?.model, 'string', `${provider} ${cognition} cognition default must set model`);
      assert.equal(typeof defaults?.reasoning_effort, 'string', `${provider} ${cognition} cognition default must set reasoning_effort`);
      assert.equal(metadata.available_models.includes(defaults.model), true, `${provider} ${cognition} cognition model must be available`);
    }
  }
});

test('provider environment uses provider-specific env precedence', () => {
  const metadata = loadProviderMetadata();
  assert.equal(resolveProviderMetadata('missing-provider', metadata), metadata['openai-api']);

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
  assert.deepEqual(kimi.availableModels, ['kimi-k2.6', 'kimi-k2.7']);

  const kimiCode = providerEnvironment('kimi-code-api', metadata, {
    KIMI_CODE_API_KEY: 'kimi-code-native-key',
  });

  assert.equal(kimiCode.baseUrl, 'https://api.kimi.com/coding/');
  assert.equal(kimiCode.model, 'kimi-k2.7');
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
