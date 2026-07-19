import { readFileSync } from 'node:fs';
import {
  DEFAULT_CARRIER_PROVIDER,
  PROVIDER_CREDENTIAL_REQUIREMENT_KINDS,
  PROVIDER_RUNTIME_BINDING_SCHEMA,
  PROVIDER_SUPPORT_STATES,
  firstEnvValue,
  nonEmpty,
  providerEnvironment as coreProviderEnvironment,
  providerRuntimeEnvironment,
  redactProviderRuntimeBinding,
  resolveProviderMetadata as coreResolveProviderMetadata,
  resolveProviderRuntimeBinding as coreResolveProviderRuntimeBinding,
} from './provider-runtime-binding-core.mjs';

// Node entry point: registry loaders read contracts/*.json from disk. The
// binding logic itself lives in provider-runtime-binding-core.mjs (worker-safe,
// no node:fs) and is wrapped here with disk-loaded registry defaults.

export {
  DEFAULT_CARRIER_PROVIDER,
  PROVIDER_CREDENTIAL_REQUIREMENT_KINDS,
  PROVIDER_RUNTIME_BINDING_SCHEMA,
  PROVIDER_SUPPORT_STATES,
  firstEnvValue,
  nonEmpty,
  providerRuntimeEnvironment,
  redactProviderRuntimeBinding,
};

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
  return coreResolveProviderMetadata(provider, metadata);
}

export function resolveProviderRuntimeBinding(provider, {
  metadata = loadProviderMetadata(),
  env = process.env,
  overrides = {},
  requireCredential = true,
} = {}) {
  return coreResolveProviderRuntimeBinding(provider, { metadata, env, overrides, requireCredential });
}

export function providerEnvironment(provider, metadata = loadProviderMetadata(), env = process.env) {
  return coreProviderEnvironment(provider, metadata, env);
}

export function admittedProviderNames(contract = loadProviderAdapterContract()) {
  return Object.freeze([...(contract.admitted_providers ?? [])]);
}
