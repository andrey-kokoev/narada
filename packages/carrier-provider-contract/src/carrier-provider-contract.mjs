import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const PROVIDER_SUPPORT_STATES = Object.freeze({
  DECLARED: 'declared',
  ADMITTED_UNSUPPORTED: 'admitted_unsupported',
  ADAPTER_IMPLEMENTED: 'adapter_implemented',
  VERIFIED_SUPPORTED: 'verified_supported',
  DEPRECATED: 'deprecated',
  REMOVED: 'removed',
});

export const PROVIDER_CREDENTIAL_REQUIREMENT_KINDS = Object.freeze({
  NONE: 'none',
  API_KEY_SECRET: 'api_key_secret',
  LOCAL_CODEX_SUBSCRIPTION: 'local_codex_subscription',
});

export const DEFAULT_CARRIER_PROVIDER = 'kimi-code-api';
export const PROVIDER_RUNTIME_BINDING_SCHEMA = 'narada.carrier.provider_runtime_binding.v1';

export function loadProviderRegistry(url = new URL('../contracts/provider-registry.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function credentialFingerprint(value) {
  if (!value) return null;
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
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
  const resolved = metadata[provider];
  if (!resolved) throw new Error(`provider_runtime_provider_unknown:${provider}`);
  return resolved;
}

export function resolveProviderRuntimeBinding(provider, {
  metadata = loadProviderMetadata(),
  env = process.env,
  overrides = {},
  requireCredential = true,
} = {}) {
  const providerDefault = resolveProviderMetadata(provider, metadata);
  const requirement = providerDefault.credential_requirement ?? {
    kind: (providerDefault.credential_env_names ?? []).length > 0 ? 'api_key_secret' : 'none',
    env_names: providerDefault.credential_env_names ?? [],
    secret_ref: providerDefault.credential_secret_ref ?? null,
  };
  const canonicalEnvironmentMatchesProvider = nonEmpty(env.NARADA_INTELLIGENCE_PROVIDER) === provider;
  const canonicalCredential = nonEmpty(overrides.apiKey)
    ?? (canonicalEnvironmentMatchesProvider ? nonEmpty(env.NARADA_AI_API_KEY) : undefined);
  const providerCredential = firstEnvValue(requirement.env_names ?? providerDefault.credential_env_names, env);
  const apiKey = canonicalCredential ?? providerCredential ?? null;
  if (requireCredential && requirement.kind === PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.API_KEY_SECRET && !apiKey) {
    throw new Error(`provider_runtime_credential_missing:${provider}`);
  }
  const baseUrl = nonEmpty(overrides.baseUrl)
    ?? (canonicalEnvironmentMatchesProvider ? nonEmpty(env.NARADA_AI_BASE_URL) : undefined)
    ?? firstEnvValue(providerDefault.base_url_env_names, env)
    ?? providerDefault.base_url;
  const model = nonEmpty(overrides.model)
    ?? (canonicalEnvironmentMatchesProvider ? nonEmpty(env.NARADA_AI_MODEL) : undefined)
    ?? firstEnvValue(providerDefault.model_env_names, env)
    ?? providerDefault.default_model;
  const thinking = nonEmpty(overrides.thinking)
    ?? (canonicalEnvironmentMatchesProvider ? nonEmpty(env.NARADA_AI_THINKING) : undefined)
    ?? (canonicalEnvironmentMatchesProvider ? nonEmpty(env.NARADA_THINKING_LEVEL) : undefined)
    ?? providerDefault.default_thinking
    ?? 'medium';
  if (!nonEmpty(baseUrl)) throw new Error(`provider_runtime_base_url_missing:${provider}`);
  if (!nonEmpty(model)) throw new Error(`provider_runtime_model_missing:${provider}`);
  const credentialEnvNames = Object.freeze([...(requirement.env_names ?? providerDefault.credential_env_names ?? [])]);
  const baseUrlEnvNames = Object.freeze([...(providerDefault.base_url_env_names ?? [])]);
  const modelEnvNames = Object.freeze([...(providerDefault.model_env_names ?? [])]);
  return Object.freeze({
    schema: PROVIDER_RUNTIME_BINDING_SCHEMA,
    provider_id: provider,
    base_url: baseUrl,
    model,
    reasoning_effort: thinking,
    api_key: apiKey,
    credential_requirement_kind: requirement.kind,
    credential_secret_ref: requirement.secret_ref ?? providerDefault.credential_secret_ref ?? null,
    credential_env_names: credentialEnvNames,
    base_url_env_names: baseUrlEnvNames,
    model_env_names: modelEnvNames,
    credential_source: requirement.kind === PROVIDER_CREDENTIAL_REQUIREMENT_KINDS.LOCAL_CODEX_SUBSCRIPTION
      ? 'local_subscription'
      : canonicalCredential
        ? (nonEmpty(overrides.apiKey) ? 'runtime_binding' : 'canonical_environment')
        : providerCredential
          ? 'provider_environment'
          : 'not_required',
    credential_fingerprint: credentialFingerprint(apiKey),
  });
}

export function providerRuntimeEnvironment(binding, { includeProviderAliases = true } = {}) {
  if (!binding || binding.schema !== PROVIDER_RUNTIME_BINDING_SCHEMA) throw new Error('provider_runtime_binding_required');
  const env = {
    NARADA_INTELLIGENCE_PROVIDER: binding.provider_id,
    NARADA_AI_BASE_URL: binding.base_url,
    NARADA_AI_MODEL: binding.model,
    NARADA_AI_THINKING: binding.reasoning_effort,
  };
  if (binding.api_key) env.NARADA_AI_API_KEY = binding.api_key;
  if (includeProviderAliases) {
    if (binding.api_key && binding.credential_env_names?.[0]) env[binding.credential_env_names[0]] = binding.api_key;
    if (binding.base_url && binding.base_url_env_names?.[0]) env[binding.base_url_env_names[0]] = binding.base_url;
    if (binding.model && binding.model_env_names?.[0]) env[binding.model_env_names[0]] = binding.model;
  }
  return env;
}

export function redactProviderRuntimeBinding(binding) {
  if (!binding) return null;
  const { api_key: _apiKey, ...redacted } = binding;
  return Object.freeze(redacted);
}

export function providerEnvironment(provider, metadata = loadProviderMetadata(), env = process.env) {
  const providerDefault = resolveProviderMetadata(provider, metadata);
  const baseUrl = firstEnvValue(providerDefault.base_url_env_names, env) ?? providerDefault.base_url;
  const model = firstEnvValue(providerDefault.model_env_names, env) ?? providerDefault.default_model;
  const thinking = env.NARADA_AI_THINKING ?? env.NARADA_THINKING_LEVEL ?? providerDefault.default_thinking ?? 'medium';
  const apiKey = firstEnvValue(providerDefault.credential_env_names, env) ?? '';
  const availableModels = Array.isArray(providerDefault.available_models)
    ? providerDefault.available_models.filter((value) => typeof value === 'string' && value)
    : [];
  return { providerDefault, baseUrl, model, thinking, apiKey, availableModels };
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
