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
  assert.equal(registry.providers['codex-subscription'].credential_secret_ref, undefined);
  assert.equal(registry.providers['codex-subscription'].credential_requirement.kind, PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.LOCAL_CODEX_SUBSCRIPTION);
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

  const kimiCode = providerEnvironment('kimi-code-api', metadata, {
    KIMI_CODE_API_KEY: 'kimi-code-native-key',
  });

  assert.equal(kimiCode.baseUrl, 'https://api.kimi.com/coding/');
  assert.equal(kimiCode.model, 'kimi-k2.7');
  assert.equal(kimiCode.apiKey, 'kimi-code-native-key');

  const openai = providerEnvironment('openai-api', metadata, {
    OPENAI_API_KEY: 'openai-native-key',
  });
  assert.equal(openai.apiKey, 'openai-native-key');

  const noGenericFallback = providerEnvironment('kimi-api', metadata, {
    UNUSED_API_KEY: 'generic-key',
  });
  assert.equal(noGenericFallback.apiKey, '');
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
  ]);
});

test('narada tool-call envelope fixture names the envelope key and example', () => {
  const contract = loadNaradaToolCallEnvelope();
  assert.equal(contract.schema, 'narada.carrier.provider_tool_call_envelope.v1');
  assert.equal(contract.envelope_key, 'narada_tool_call');
  assert.equal(contract.example.narada_tool_call.name, 'mcp_output_show');
  assert.equal(contract.example.narada_tool_call.arguments.output_ref, 'mcp_output:o_6cd77433e384445e976c7fdf');
});
