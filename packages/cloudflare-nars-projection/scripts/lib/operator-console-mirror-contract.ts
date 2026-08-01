import { createHash } from 'node:crypto';

const VOLATILE_ROUTE_DIRECTORY_KEYS = new Set(['generatedAt']);

export interface RouteDirectoryCanonicalizationOptions {
  ignoreAuthorityIdentity?: boolean;
}

/**
 * Preserve the complete route-directory contract while removing only the
 * generation timestamp that is expected to differ between authorities.
 */
export function canonicalizeRouteDirectory(
  value: unknown,
  options: RouteDirectoryCanonicalizationOptions = {},
): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeRouteDirectory(entry, options));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => !VOLATILE_ROUTE_DIRECTORY_KEYS.has(key))
      .filter((key) => !(options.ignoreAuthorityIdentity && key === 'workspaceHost'))
      .sort()
      .map((key) => [key, canonicalizeRouteDirectory(record[key], options)]),
  );
}

export function routeDirectoryDigest(
  value: unknown,
  options: RouteDirectoryCanonicalizationOptions = {},
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeRouteDirectory(value, options)))
    .digest('hex');
}
