/**
 * get-runtime-value.mjs
 *
 * Helper for reading runtime configuration values from a narada.site.config.v0
 * partitioned config.json.
 *
 * Usage:
 *   import { getRuntimeValue, loadSiteConfig } from './get-runtime-value.mjs';
 *   const config = loadSiteConfig('.');
 *   const minutes = getRuntimeValue(config, 'task_governance.minimum_work_minutes');
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Load and parse config.json from a site root.
 * Returns null if config.json does not exist or cannot be parsed.
 */
export function loadSiteConfig(siteRoot) {
  const configPath = join(resolve(siteRoot), 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Extract a runtime parameter's current_value from a partitioned config.
 * Supports dot-notation paths like 'task_governance.minimum_work_minutes'.
 * Returns undefined if the parameter is not found.
 */
export function getRuntimeValue(config, path) {
  if (!config || typeof config !== 'object') return undefined;

  const parts = path.split('.');
  let current = config.runtime_config;
  if (!current || typeof current !== 'object') return undefined;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  if (current && typeof current === 'object' && 'current_value' in current) {
    return current.current_value;
  }

  return undefined;
}

/**
 * Extract the full runtime parameter metadata object.
 * Returns undefined if the parameter is not found.
 */
export function getRuntimeParam(config, path) {
  if (!config || typeof config !== 'object') return undefined;

  const parts = path.split('.');
  let current = config.runtime_config;
  if (!current || typeof current !== 'object') return undefined;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  if (current && typeof current === 'object' && 'current_value' in current) {
    return current;
  }

  return undefined;
}
