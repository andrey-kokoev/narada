import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codexAuthHome } from './codex-subscription-auth.js';

type AnyRecord = Record<string, any>;

export const DEFAULT_CODEX_MODEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function resolveCodexSubscriptionModelCatalog(
  {
    processEnv = process.env,
    fallbackModels = [],
    now = Date.now(),
    maxAgeMs = DEFAULT_CODEX_MODEL_CACHE_MAX_AGE_MS,
    readFile = (path: string, encoding: 'utf8') => readFileSync(path, encoding),
  }: AnyRecord = {},
): AnyRecord {
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
          .filter((model: any) => model?.visibility === 'list')
          .sort((left: any, right: any) => Number(left?.priority ?? 0) - Number(right?.priority ?? 0))
          .map((model: any) => model?.slug)
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

function fallbackCatalog(
  models: string[],
  reason: string,
  cachePath: string | null,
  maxAgeMs = DEFAULT_CODEX_MODEL_CACHE_MAX_AGE_MS,
): AnyRecord {
  return {
    models,
    source: 'declared_registry_fallback',
    observed_at: null,
    cache_path: cachePath,
    max_age_ms: maxAgeMs,
    fallback_reason: reason,
  };
}

function uniqueStrings(values: any[]): string[] {
  return [...new Set(values
    .filter((value: any) => typeof value === 'string' && value.trim())
    .map((value: any) => value.trim()))];
}
