import { readFileSync } from 'node:fs';

const PROVIDER_ADAPTERS_PATH = new URL('../../carrier-provider-contract/contracts/provider-adapters.json', import.meta.url);
const PROVIDER_ADAPTERS = JSON.parse(readFileSync(PROVIDER_ADAPTERS_PATH, 'utf8'));

const PROVIDER_AUTH_ENV_VARS = Object.freeze({
  'codex-subscription': null,
  'kimi-api': 'KIMI_API_KEY',
  'kimi-code-api': 'KIMI_CODE_API_KEY',
  'openai-api': 'OPENAI_API_KEY',
  'anthropic-api': 'ANTHROPIC_API_KEY',
  'deepseek-api': 'DEEPSEEK_API_KEY',
  'glm-api': 'GLM_API_KEY',
  'openrouter-api': 'OPENROUTER_API_KEY',
});

export const ADMITTED_INTELLIGENCE_PROVIDERS = Object.freeze(uniqueStrings(stringArray(PROVIDER_ADAPTERS.admitted_providers)));

export function resolveIntelligenceProviderChoices({ currentProvider = null, availableProviders = ADMITTED_INTELLIGENCE_PROVIDERS } = {}) {
  return uniqueStrings([currentProvider, ...stringArray(availableProviders)]);
}

export function normalizeIntelligenceProvider(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isAdmittedIntelligenceProvider(value, availableProviders = ADMITTED_INTELLIGENCE_PROVIDERS) {
  const provider = normalizeIntelligenceProvider(value);
  return Boolean(provider && stringArray(availableProviders).includes(provider));
}

export function intelligenceProviderAuthEnvVar(provider) {
  const normalized = normalizeIntelligenceProvider(provider);
  return normalized ? PROVIDER_AUTH_ENV_VARS[normalized] ?? null : null;
}

export function hasConfiguredIntelligenceProviderAuth(provider, env = process.env) {
  const envVarName = intelligenceProviderAuthEnvVar(provider);
  if (!envVarName) return true;
  return Boolean(normalizeIntelligenceProvider(env?.[envVarName]));
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [];
}

function uniqueStrings(values) {
  return [...new Set(stringArray(values))];
}
