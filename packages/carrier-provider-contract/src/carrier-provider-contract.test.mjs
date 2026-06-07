import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CARRIER_PROVIDER,
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
  assert.equal(registry.providers['codex-subscription'].support_state, PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED);
});

test('provider environment uses provider-specific env precedence', () => {
  const metadata = loadProviderMetadata();
  assert.equal(resolveProviderMetadata('missing-provider', metadata), metadata['openai-api']);

  const kimi = providerEnvironment('kimi-api', metadata, {
    NARADA_KIMI_API_BASE_URL: 'https://kimi.example',
    NARADA_AI_BASE_URL: 'https://generic.example',
    NARADA_KIMI_MODEL: 'kimi-custom',
    NARADA_AI_MODEL: 'generic-model',
    NARADA_KIMI_API_KEY: 'kimi-key',
    NARADA_AI_API_KEY: 'generic-key',
  });

  assert.equal(kimi.baseUrl, 'https://kimi.example');
  assert.equal(kimi.model, 'kimi-custom');
  assert.equal(kimi.apiKey, 'kimi-key');
});

test('provider adapter contract lists admitted carrier providers', () => {
  const contract = loadProviderAdapterContract();
  assert.equal(contract.schema, 'narada.agent_tui.provider_adapter_contract.v0');
  assert.deepEqual(admittedProviderNames(contract), [
    'codex-subscription',
    'kimi-api',
    'openai-api',
    'anthropic-api',
  ]);
});

test('narada tool-call envelope fixture names the envelope key and example', () => {
  const contract = loadNaradaToolCallEnvelope();
  assert.equal(contract.schema, 'narada.carrier.provider_tool_call_envelope.v1');
  assert.equal(contract.envelope_key, 'narada_tool_call');
  assert.equal(contract.example.narada_tool_call.name, 'mcp_output_show');
  assert.equal(contract.example.narada_tool_call.arguments.output_ref, 'mcp_output:o_6cd77433e384445e976c7fdf');
});
