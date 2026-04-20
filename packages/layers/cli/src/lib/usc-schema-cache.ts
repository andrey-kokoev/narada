/**
 * USC schema cache
 *
 * Caches JSON schema files from USC packages locally so that validation
 * and read-only operations can fall back when USC packages are not installed.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';

export interface UscValidationResult {
  allPassed: boolean;
  results: Array<{ name: string; valid: boolean; errors: string[]; source: 'usc' | 'cached-schema' }>;
}

const USC_INSTALL_HINT =
  'USC packages are not installed. To use USC validation, install them:\n' +
  '  pnpm add @narada.usc/compiler @narada.usc/core';

export interface SchemaCacheResult {
  cached: number;
  cacheDir: string;
}

/**
 * Best-effort discovery of schema directories within a USC installation.
 */
const USC_SCHEMA_RELATIVE_PATHS = [
  'packages/compiler/schemas',
  'packages/core/schemas',
  'schemas',
];

/**
 * Populate the local schema cache with schema files discovered in USC packages.
 * Silently skips missing directories.
 */
export function populateSchemaCache(uscRoot: string, targetDir: string): SchemaCacheResult {
  const cacheDir = getCacheDir(targetDir);
  mkdirSync(cacheDir, { recursive: true });

  let cached = 0;
  for (const rel of USC_SCHEMA_RELATIVE_PATHS) {
    const sourceDir = join(uscRoot, rel);
    if (!existsSync(sourceDir)) continue;
    try {
      for (const entry of readdirSync(sourceDir)) {
        if (entry.endsWith('.json')) {
          const src = join(sourceDir, entry);
          const dest = join(cacheDir, entry);
          cpSync(src, dest, { force: true });
          cached++;
        }
      }
    } catch {
      // Best-effort: ignore permission or read errors
    }
  }

  return { cached, cacheDir };
}

/**
 * Check whether a schema cache exists and contains files.
 */
export function hasSchemaCache(targetDir: string): boolean {
  const cacheDir = getCacheDir(targetDir);
  if (!existsSync(cacheDir)) return false;
  try {
    const entries = readdirSync(cacheDir);
    return entries.some((e) => e.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * Get the filesystem path to a cached schema by file name.
 * Returns `null` if the cache does not contain the requested schema.
 */
export function getCachedSchemaPath(targetDir: string, name: string): string | null {
  const cacheDir = getCacheDir(targetDir);
  const candidate = join(cacheDir, name);
  if (existsSync(candidate)) return candidate;
  return null;
}

/**
 * List all cached schema file names.
 */
export function listCachedSchemas(targetDir: string): string[] {
  const cacheDir = getCacheDir(targetDir);
  if (!existsSync(cacheDir)) return [];
  try {
    return readdirSync(cacheDir).filter((e) => e.endsWith('.json'));
  } catch {
    return [];
  }
}

/**
 * Read a cached schema as a parsed object.
 * Returns `null` if the schema is not cached.
 */
export function readCachedSchema(targetDir: string, name: string): unknown | null {
  const path = getCachedSchemaPath(targetDir, name);
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Validate a USC repo.
 *
 * First tries the full USC validator. If USC packages are not installed,
 * falls back to cached schemas for a lightweight structural check.
 */
export async function validateUscRepo(targetDir: string): Promise<UscValidationResult> {
  // 1. Try full USC validator
  try {
    const validator = await import('@narada.usc/core/src/validator.js');
    const result = validator.validateAll({ appPath: targetDir }) as {
      results: Array<{ name: string; valid: boolean; errors: string[] }>;
      allPassed: boolean;
    };
    return {
      allPassed: result.allPassed,
      results: result.results.map((r) => ({ ...r, source: 'usc' as const })),
    };
  } catch {
    // USC not available; proceed to fallback
  }

  // 2. Fallback: cached-schema structural validation
  const results: UscValidationResult['results'] = [];

  const requiredFiles = [
    { name: 'construction-state.json', schema: 'construction-state.schema.json' },
    { name: 'task-graph.json', schema: 'task-graph.schema.json' },
  ];

  for (const { name, schema } of requiredFiles) {
    const filePath = join(targetDir, 'usc', name);
    const errors: string[] = [];

    if (!existsSync(filePath)) {
      errors.push(`Missing required file: usc/${name}`);
      results.push({ name, valid: false, errors, source: 'cached-schema' });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      errors.push(`usc/${name} is not valid JSON`);
      results.push({ name, valid: false, errors, source: 'cached-schema' });
      continue;
    }

    // If we have a cached schema, do a lightweight structural check
    const cachedSchema = readCachedSchema(targetDir, schema);
    if (cachedSchema && typeof cachedSchema === 'object' && cachedSchema !== null) {
      const schemaObj = cachedSchema as Record<string, unknown>;
      if (Array.isArray(schemaObj.required)) {
        const requiredKeys = schemaObj.required as string[];
        const obj = parsed as Record<string, unknown>;
        for (const key of requiredKeys) {
          if (!(key in obj)) {
            errors.push(`Missing required key "${key}" (from cached schema)`);
          }
        }
      }
      if (schemaObj.type && typeof parsed === 'object' && parsed !== null) {
        const expectedType = schemaObj.type as string;
        const actualType = Array.isArray(parsed) ? 'array' : typeof parsed;
        if (expectedType === 'object' && actualType !== 'object') {
          errors.push(`Expected type "object", got "${actualType}"`);
        }
      }
    } else {
      // No cached schema for this file — just note it
      errors.push(`No cached schema available for ${name}; structural check limited`);
    }

    results.push({
      name,
      valid: errors.length === 0,
      errors,
      source: 'cached-schema',
    });
  }

  // Also check that cache exists at all
  if (!hasSchemaCache(targetDir)) {
    results.push({
      name: 'schema-cache',
      valid: false,
      errors: ['No cached schemas found. Run narada init usc to populate the cache.'],
      source: 'cached-schema',
    });
  }

  return {
    allPassed: results.every((r) => r.valid),
    results,
  };
}

function getCacheDir(targetDir: string): string {
  return join(targetDir, '.ai', 'usc-schema-cache');
}
