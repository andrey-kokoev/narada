import {
  DEFAULT_CARRIER_PROVIDER,
  PROVIDER_SUPPORT_STATES,
  loadProviderMetadata,
  providerEnvironment,
  resolveProviderMetadata,
} from '../../carrier-provider-contract/src/carrier-provider-contract.mjs';
import { REQUEST_ADAPTERS } from './provider-adapters.mjs';

function resolveProviderAdapter(provider, metadata = loadProviderMetadata().providers, adapters = REQUEST_ADAPTERS) {
  const providerMetadata = metadata[provider];
  if (!providerMetadata) {
    throw new Error(`Unsupported intelligence provider: ${provider}`);
  }
  const support = resolveProviderSupportState(provider, providerMetadata, adapters);
  if (!support.ready) {
    throw new Error(`Unsupported intelligence provider adapter for ${provider}: ${support.state}. ${support.required_next_step}`);
  }
  const adapter = adapters[providerMetadata.adapter_kind];
  if (!adapter) {
    throw new Error(`Request adapter not implemented for ${provider}: ${providerMetadata.adapter_kind}. support_state=${support.state}. ${support.required_next_step}`);
  }
  return {
    provider_id: provider,
    adapter_id: providerMetadata.adapter_kind,
    support_state: support.state,
    support_status: support.state,
    adapter,
  };
}

function resolveProviderSupportState(provider, providerMetadata, adapters = REQUEST_ADAPTERS) {
  const state = normalizeProviderSupportState(providerMetadata.support_state ?? providerMetadata.support_status);
  const adapterExists = !!adapters[providerMetadata.adapter_kind];
  const required_next_step = requiredNextProviderSupportStep(state, providerMetadata.adapter_kind, adapterExists);
  return {
    provider_id: provider,
    state,
    adapter_kind: providerMetadata.adapter_kind,
    adapter_exists: adapterExists,
    ready: state === PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED || state === PROVIDER_SUPPORT_STATES.DEPRECATED,
    required_next_step,
  };
}

function normalizeProviderSupportState(value) {
  if (value === 'supported') return PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED;
  if (value === 'unsupported_until_adapter_exists') return PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED;
  if (value === 'unsupported_until_reviewed') return PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED;
  return value ?? PROVIDER_SUPPORT_STATES.DECLARED;
}

function requiredNextProviderSupportStep(state, adapterKind, adapterExists) {
  if (state === PROVIDER_SUPPORT_STATES.DECLARED) return 'Admit provider policy and choose a request adapter before launch.';
  if (state === PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED) return `Implement request adapter ${adapterKind} and move the provider to adapter_implemented.`;
  if (state === PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED) return 'Verify launcher, docs, credential mapping, and runtime tests before marking verified_supported.';
  if (state === PROVIDER_SUPPORT_STATES.REMOVED) return 'Use an admitted replacement provider or restore the provider through a new contract revision.';
  if (state === PROVIDER_SUPPORT_STATES.DEPRECATED) return 'Provider remains launchable for compatibility; migrate to a non-deprecated provider.';
  if (!adapterExists) return `Implement request adapter ${adapterKind} before launching this provider.`;
  return 'Provider is verified for launch.';
}

const DEFAULT_AGENT_CLI_PROVIDER = DEFAULT_CARRIER_PROVIDER;

export {
  DEFAULT_AGENT_CLI_PROVIDER,
  PROVIDER_SUPPORT_STATES,
  loadProviderMetadata,
  normalizeProviderSupportState,
  providerEnvironment,
  requiredNextProviderSupportStep,
  resolveProviderAdapter,
  resolveProviderMetadata,
  resolveProviderSupportState,
};
