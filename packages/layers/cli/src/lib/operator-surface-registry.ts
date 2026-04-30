import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface OperatorSurfaceIdentity {
  identity_id: string;
  site_id: string;
  role: string;
  agent_kind: string;
  label: string;
  input_capabilities?: OperatorSurfaceInputCapability[];
  submit_strategy?: OperatorSurfaceSubmitStrategy;
  admitted_by: string;
  admitted_at: string;
  updated_at: string;
  authority_limits: string[];
}

export type OperatorSurfaceInputCapability =
  | 'focus'
  | 'type_text'
  | 'submit'
  | 'clear_pending_input'
  | 'recover_surface_state';

export type OperatorSurfaceSubmitStrategy =
  | 'type_only'
  | 'operator_confirmed_submit'
  | 'known_surface_submit';

export interface OperatorSurfaceAffinityColor {
  value: string;
  source: 'site_metadata' | 'role_metadata' | 'projection_override';
  authority: 'ergonomic_projection_hint';
}

export interface OperatorSurfaceSiteMetadata {
  affinity_color?: string;
}

export interface OperatorSurfaceRoleMetadata {
  affinity_color?: string;
}

export interface OperatorSurfaceIdentityRegistry {
  schema: string;
  updated_at: string;
  sites?: Record<string, OperatorSurfaceSiteMetadata>;
  roles?: Record<string, OperatorSurfaceRoleMetadata>;
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

export function makeOperatorSurfaceLabel(
  identity: OperatorSurfaceIdentity,
  registry?: OperatorSurfaceIdentityRegistry,
): Record<string, unknown> {
  const siteColor = registry?.sites?.[identity.site_id]?.affinity_color;
  const roleColor = registry?.roles?.[identity.role]?.affinity_color;
  return {
    identity_id: identity.identity_id,
    label: identity.label,
    site_id: identity.site_id,
    role: identity.role,
    agent_kind: identity.agent_kind,
    input_posture: {
      capabilities: identity.input_capabilities ?? ['focus', 'type_text', 'clear_pending_input', 'recover_surface_state'],
      submit_strategy: identity.submit_strategy ?? 'type_only',
      automation_default: 'type_only',
      blind_submit_chord_probe_limit: 0,
      authority: 'ergonomic_projection_hint',
    },
    projection_hints: {
      site_line: {
        affinity_color: siteColor
          ? {
              value: siteColor,
              source: 'site_metadata',
              authority: 'ergonomic_projection_hint',
            } satisfies OperatorSurfaceAffinityColor
          : null,
      },
      role_line: {
        affinity_color: roleColor
          ? {
              value: roleColor,
              source: 'role_metadata',
              authority: 'ergonomic_projection_hint',
            } satisfies OperatorSurfaceAffinityColor
          : null,
      },
      agent_name_line: {
        affinity_color: null,
      },
    },
    authority_limits: identity.authority_limits,
  };
}
