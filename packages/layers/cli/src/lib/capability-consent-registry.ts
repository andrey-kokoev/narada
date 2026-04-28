import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type CapabilityGrantStatus = 'active' | 'revoked';

export interface CapabilityConsentGrant {
  grant_id: string;
  site_id: string;
  principal_id: string;
  agent_id: string | null;
  capability_kind: string;
  scope_json: unknown;
  allowed_actions: string[];
  denied_actions: string[];
  credential_ref: string | null;
  evidence_ref: string | null;
  expires_at: string | null;
  status: CapabilityGrantStatus;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

export interface CapabilityConsentRegistry {
  registry_kind: 'capability_consent_registry';
  registry_version: 1;
  grants: CapabilityConsentGrant[];
}

const CREDENTIAL_REF_PREFIXES = [
  'none',
  'env:',
  'keychain:',
  'credential-manager:',
  'secret-service:',
  'pass:',
  'vault:',
  'config-ref:',
] as const;

export function capabilityRegistryPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'capability-consent-registry.json');
}

function emptyRegistry(): CapabilityConsentRegistry {
  return {
    registry_kind: 'capability_consent_registry',
    registry_version: 1,
    grants: [],
  };
}

export async function readCapabilityRegistry(cwd: string): Promise<CapabilityConsentRegistry> {
  const path = capabilityRegistryPath(cwd);
  if (!existsSync(path)) return emptyRegistry();
  const parsed = JSON.parse(await readFile(path, 'utf8')) as CapabilityConsentRegistry;
  return {
    registry_kind: 'capability_consent_registry',
    registry_version: 1,
    grants: Array.isArray(parsed.grants) ? parsed.grants : [],
  };
}

export async function writeCapabilityRegistry(cwd: string, registry: CapabilityConsentRegistry): Promise<string> {
  const path = capabilityRegistryPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return path;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseScopeJson(value: string | undefined): unknown {
  if (!value) return {};
  return JSON.parse(value);
}

export function validateCredentialRef(value: string | undefined): string | null {
  if (!value || value === 'none') return null;
  if (CREDENTIAL_REF_PREFIXES.some((prefix) => value === prefix || value.startsWith(prefix))) {
    return value;
  }
  throw new Error(`credential_ref must be a reference, not a raw secret. Use one of: ${CREDENTIAL_REF_PREFIXES.join(', ')}`);
}

export function grantEffectiveStatus(grant: CapabilityConsentGrant, now = new Date()): 'active' | 'revoked' | 'expired' {
  if (grant.status === 'revoked') return 'revoked';
  if (grant.expires_at && Date.parse(grant.expires_at) <= now.getTime()) return 'expired';
  return 'active';
}

export function makeCapabilityGrant(args: {
  siteId: string;
  principalId: string;
  agentId?: string | null;
  capabilityKind: string;
  scope: unknown;
  allowedActions: string[];
  deniedActions: string[];
  credentialRef?: string | null;
  evidenceRef?: string | null;
  expiresAt?: string | null;
  grantedBy: string;
  now?: Date;
}): CapabilityConsentGrant {
  return {
    grant_id: `cap_${randomUUID()}`,
    site_id: args.siteId,
    principal_id: args.principalId,
    agent_id: args.agentId ?? null,
    capability_kind: args.capabilityKind,
    scope_json: args.scope,
    allowed_actions: args.allowedActions,
    denied_actions: args.deniedActions,
    credential_ref: args.credentialRef ?? null,
    evidence_ref: args.evidenceRef ?? null,
    expires_at: args.expiresAt ?? null,
    status: 'active',
    granted_by: args.grantedBy,
    granted_at: (args.now ?? new Date()).toISOString(),
    revoked_by: null,
    revoked_at: null,
    revocation_reason: null,
  };
}
