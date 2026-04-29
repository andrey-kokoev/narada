import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface OperatorSurfaceIdentity {
  identity_id: string;
  site_id: string;
  role: string;
  agent_kind: string;
  label: string;
  admitted_by: string;
  admitted_at: string;
  updated_at: string;
  authority_limits: string[];
}

export interface OperatorSurfaceIdentityRegistry {
  schema: string;
  updated_at: string;
  identities: OperatorSurfaceIdentity[];
}

export function operatorSurfaceDir(cwd: string): string {
  return join(resolve(cwd), 'operator-surfaces');
}

export function operatorSurfaceIdentityPath(cwd: string): string {
  return join(operatorSurfaceDir(cwd), 'identities.json');
}

export async function readOperatorSurfaceIdentities(cwd: string): Promise<OperatorSurfaceIdentityRegistry> {
  try {
    const raw = await readFile(operatorSurfaceIdentityPath(cwd), 'utf8');
    const parsed = JSON.parse(raw) as OperatorSurfaceIdentityRegistry;
    if (!Array.isArray(parsed.identities)) throw new Error('Invalid operator surface identity registry');
    return parsed;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return {
        schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
        updated_at: new Date().toISOString(),
        identities: [],
      };
    }
    throw error;
  }
}

export async function writeOperatorSurfaceIdentities(
  cwd: string,
  registry: OperatorSurfaceIdentityRegistry,
): Promise<string> {
  registry.updated_at = new Date().toISOString();
  const dir = operatorSurfaceDir(cwd);
  await mkdir(dir, { recursive: true });
  const path = operatorSurfaceIdentityPath(cwd);
  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`);
  return path;
}

export function makeOperatorSurfaceLabel(identity: OperatorSurfaceIdentity): Record<string, unknown> {
  return {
    identity_id: identity.identity_id,
    label: identity.label,
    site_id: identity.site_id,
    role: identity.role,
    agent_kind: identity.agent_kind,
    authority_limits: identity.authority_limits,
  };
}
