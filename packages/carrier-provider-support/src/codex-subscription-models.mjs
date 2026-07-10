import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codexAuthHome } from './codex-subscription-auth.mjs';

export const DEFAULT_CODEX_MODEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function resolveCodexSubscriptionModelCatalog({
  processEnv = process.env,
  fallbackModels = [],
  now = Date.now(),
  maxAgeMs = DEFAULT_CODEX_MODEL_CACHE_MAX_AGE_MS,
  readFile = readFileSync,
} = {}) {
  const fallback = uniqueStrings(fallbackModels);
  const authHome = codexAuthHome({ processEnv });
  const cachePath = authHome ? join(authHome, 'models_cache.json') : null;
  if (!cachePath) return fallbackCatalog(fallback, 'auth_home_unavailable', null, maxAgeMs);

  try {
    const parsed = JSON.parse(readFile(cachePath, 'utf8'));
    const fetchedAt = Date.parse(parsed?.fetched_at ?? '');
    if (!Number.isFinite(fetchedAt) || now - fetchedAt > maxAgeMs) {
      return fallbackCatalog(fallback, 'cache_missing_fresh_timestamp', cachePath, maxAgeMs);
    }
    const models = uniqueStrings(
      Array.isArray(parsed?.models)
        ? parsed.models
          .filter((model) => model?.visibility === 'list')
          .sort((left, right) => Number(left?.priority ?? 0) - Number(right?.priority ?? 0))
          .map((model) => model?.slug)
        : [],
    );
    if (models.length === 0) return fallbackCatalog(fallback, 'cache_has_no_selectable_models', cachePath, maxAgeMs);
    return {
      models,
      source: 'live_codex_cache',
      observed_at: new Date(fetchedAt).toISOString(),
      cache_path: cachePath,
      max_age_ms: maxAgeMs,
      fallback_reason: null,
    };
  } catch {
    return fallbackCatalog(fallback, 'cache_unavailable_or_invalid', cachePath, maxAgeMs);
  }
}

function fallbackCatalog(models, reason, cachePath, maxAgeMs = DEFAULT_CODEX_MODEL_CACHE_MAX_AGE_MS) {
  return {
    models,
    source: 'declared_registry_fallback',
    observed_at: null,
    cache_path: cachePath,
    max_age_ms: maxAgeMs,
    fallback_reason: reason,
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}
