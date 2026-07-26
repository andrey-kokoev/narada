type AnyRecord = Record<string, any>;

import { existsSync, readFileSync } from 'node:fs';
import {
  CLOUDFLARE_SITE_REGISTRY_LOCAL_PROJECTION_SCHEMA,
  projectCloudflareSiteRegistrySites,
} from './cloudflare-site-registry.js';

export function readCloudflareSiteRegistryLocalProjection(projectionPath: string): AnyRecord {
  if (!projectionPath) {
    return {
      schema: CLOUDFLARE_SITE_REGISTRY_LOCAL_PROJECTION_SCHEMA,
      state: 'not_configured',
      path: null,
      site_count: 0,
      sites: [],
      site_records: [],
    };
  }
  if (!existsSync(projectionPath)) {
    return {
      schema: CLOUDFLARE_SITE_REGISTRY_LOCAL_PROJECTION_SCHEMA,
      state: 'missing',
      path: projectionPath,
      site_count: 0,
      sites: [],
      site_records: [],
    };
  }
  let projection;
  try {
    projection = JSON.parse(readFileSync(projectionPath, 'utf8'));
  } catch (error) {
    return {
      schema: CLOUDFLARE_SITE_REGISTRY_LOCAL_PROJECTION_SCHEMA,
      state: 'invalid_json',
      path: projectionPath,
      site_count: 0,
      sites: [],
      site_records: [],
      reason: 'cloudflare_site_registry_projection_json_invalid',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    schema: CLOUDFLARE_SITE_REGISTRY_LOCAL_PROJECTION_SCHEMA,
    state: 'read',
    path: projectionPath,
    source_schema: projection?.schema ?? null,
    ...projectCloudflareSiteRegistrySites(projection),
  };
}
