import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CapabilityGrantRecord {
  grant_id: string;
  id?: string;
  site_id?: string;
  capability_kind?: string;
  status?: string;
  active?: boolean;
  allowed_actions?: string[];
  denied_actions?: string[];
}

export interface CapabilityRegistry {
  grants: CapabilityGrantRecord[];
}

export async function readCapabilityRegistry(cwd: string): Promise<CapabilityRegistry> {
  const path = resolve(cwd, '.ai', 'capability-consent-registry.json');
  if (!existsSync(path)) return { grants: [] };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { grants?: CapabilityGrantRecord[] };
  return { grants: Array.isArray(parsed.grants) ? parsed.grants : [] };
}

export function grantEffectiveStatus(grant: CapabilityGrantRecord): 'active' | 'inactive' {
  return grant.active === true || grant.status === 'active' ? 'active' : 'inactive';
}
