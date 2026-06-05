import { readFileSync } from 'node:fs';

export const PROVIDER_SUPPORT_STATES = Object.freeze({
  DECLARED: 'declared',
  ADMITTED_UNSUPPORTED: 'admitted_unsupported',
  ADAPTER_IMPLEMENTED: 'adapter_implemented',
  VERIFIED_SUPPORTED: 'verified_supported',
  DEPRECATED: 'deprecated',
  REMOVED: 'removed',
});

export const DEFAULT_CARRIER_PROVIDER = 'codex-subscription';

export function loadProviderRegistry(url = new URL('../contracts/provider-registry.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function loadProviderMetadata(url = new URL('../contracts/provider-registry.json', import.meta.url)) {
  return Object.freeze(loadProviderRegistry(url).providers ?? {});
}

export function loadProviderAdapterContract(url = new URL('../contracts/provider-adapters.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function loadNaradaToolCallEnvelope(url = new URL('../contracts/narada-tool-call-envelope.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function resolveProviderMetadata(provider, metadata = loadProviderMetadata()) {
  return metadata[provider] ?? metadata['openai-api'];
}

export function providerEnvironment(provider, metadata = loadProviderMetadata(), env = process.env) {
  const providerDefault = resolveProviderMetadata(provider, metadata);
  const baseUrl = firstEnvValue(providerDefault.base_url_env_names, env) ?? providerDefault.base_url;
  const model = firstEnvValue(providerDefault.model_env_names, env) ?? providerDefault.default_model;
  const apiKey = firstEnvValue(providerDefault.credential_env_names, env) ?? '';
  return { providerDefault, baseUrl, model, apiKey };
}

export function admittedProviderNames(contract = loadProviderAdapterContract()) {
  return Object.freeze([...(contract.admitted_providers ?? [])]);
}

function firstEnvValue(names = [], env = process.env) {
  for (const name of names) {
    const value = env[name];
    if (value) return value;
  }
  return undefined;
}
