import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface OperatorSurfaceIdentity {
  identity_id: string;
  previous_identity_ids?: string[];
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
  migration_history?: OperatorSurfaceIdentityMigration[];
  label_projection?: {
    style?: {
      affinity_color?: string;
      color?: string;
      foreground_color?: string;
    };
  };
}

export interface OperatorSurfaceIdentityMigration {
  old_identity_id: string;
  new_identity_id: string;
  migrated_by: string;
  migrated_at: string;
  evidence_path?: string;
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
  source: 'site_metadata' | 'role_metadata' | 'projection_override' | 'declared_default';
  authority: 'ergonomic_projection_hint';
}

export interface OperatorSurfaceSiteMetadata {
  affinity_color?: string;
}

export interface OperatorSurfaceRoleMetadata {
  affinity_color?: string;
}

export interface OperatorSurfaceLabelStyle {
  affinity_color: OperatorSurfaceAffinityColor;
  diagnostic: OperatorSurfaceLabelStyleDiagnostic | null;
}

export interface OperatorSurfaceLabelStyleDiagnostic {
  code: 'operator_surface_label_style_defaulted';
  identity_id: string;
  role: string;
  reason: string;
  repair_hint: string;
}

export interface OperatorSurfaceIdentityRegistry {
  schema: string;
  updated_at: string;
  sites?: Record<string, OperatorSurfaceSiteMetadata>;
  roles?: Record<string, OperatorSurfaceRoleMetadata>;
  identities: OperatorSurfaceIdentity[];
}

export interface OperatorSurfaceCarrierProjectionIssue {
  identity_ref: string | null;
  field: string;
  reason: string;
  repair_command: string;
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
  const labelStyle = resolveOperatorSurfaceLabelStyle(identity, registry);
  return {
    identity_id: identity.identity_id,
    identity_name: identity.identity_id,
    label: identity.label,
    presentation_label: identity.label,
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
    label_projection: {
      style: labelStyle.affinity_color,
      diagnostic: labelStyle.diagnostic,
      authority_boundary: 'label style is ergonomic projection metadata only; it does not admit identity, role, capability, or runtime binding authority',
    },
    carrier_projection: {
      windows_focused_window_binding: {
        identity_name: identity.identity_id,
        label: identity.label,
        authority: 'projection_from_site_identity_record',
      },
      authority_boundary: 'identity_id is Site authority; identity_name is a Windows operator-surface projection field',
    },
    authority_limits: identity.authority_limits,
  };
}

export function operatorSurfaceLabelDiagnostics(labels: Array<Record<string, unknown>>): OperatorSurfaceLabelStyleDiagnostic[] {
  return labels.flatMap((label) => {
    const projection = label.label_projection as { diagnostic?: OperatorSurfaceLabelStyleDiagnostic | null } | undefined;
    return projection?.diagnostic ? [projection.diagnostic] : [];
  });
}

function resolveOperatorSurfaceLabelStyle(
  identity: OperatorSurfaceIdentity,
  registry?: OperatorSurfaceIdentityRegistry,
): OperatorSurfaceLabelStyle {
  const explicit = identity.label_projection?.style;
  const explicitColor = explicit?.affinity_color?.trim()
    || explicit?.color?.trim()
    || explicit?.foreground_color?.trim();
  if (explicitColor) {
    return {
      affinity_color: {
        value: explicitColor,
        source: 'projection_override',
        authority: 'ergonomic_projection_hint',
      },
      diagnostic: null,
    };
  }
  const roleColor = registry?.roles?.[identity.role]?.affinity_color?.trim();
  if (roleColor) {
    return {
      affinity_color: {
        value: roleColor,
        source: 'role_metadata',
        authority: 'ergonomic_projection_hint',
      },
      diagnostic: null,
    };
  }
  const siteColor = registry?.sites?.[identity.site_id]?.affinity_color?.trim();
  if (siteColor) {
    return {
      affinity_color: {
        value: siteColor,
        source: 'site_metadata',
        authority: 'ergonomic_projection_hint',
      },
      diagnostic: null,
    };
  }
  return {
    affinity_color: {
      value: '#6b7280',
      source: 'declared_default',
      authority: 'ergonomic_projection_hint',
    },
    diagnostic: {
      code: 'operator_surface_label_style_defaulted',
      identity_id: identity.identity_id,
      role: identity.role,
      reason: 'no explicit identity label_projection.style, role affinity_color, or Site affinity_color is configured',
      repair_hint: `Set role affinity with narada operator-surface identity add <identity> --role ${identity.role} --role-affinity-color <color> --by <principal>, or add role metadata in the Operator Surface identity registry.`,
    },
  };
}

export function operatorSurfaceCarrierProjectionIssues(
  registry: OperatorSurfaceIdentityRegistry,
): OperatorSurfaceCarrierProjectionIssue[] {
  const issues: OperatorSurfaceCarrierProjectionIssue[] = [];
  for (const identity of registry.identities as Array<Partial<OperatorSurfaceIdentity>>) {
    const identityRef = typeof identity.identity_id === 'string' && identity.identity_id.trim()
      ? identity.identity_id
      : typeof identity.label === 'string' && identity.label.trim()
        ? identity.label
        : null;
    if (typeof identity.identity_id !== 'string' || !identity.identity_id.trim()) {
      issues.push({
        identity_ref: identityRef,
        field: 'identity_id',
        reason: 'missing durable identity_id; Windows carrier identity_name cannot be projected',
        repair_command: 'narada operator-surface identity add <identity-name> --site <site-id> --role <role> --agent-kind <kind> --by <principal>',
      });
    }
    if (typeof identity.label !== 'string' || !identity.label.trim()) {
      issues.push({
        identity_ref: identityRef,
        field: 'label',
        reason: 'missing presentation label; Windows carrier label cannot be projected',
        repair_command: `narada operator-surface identity add ${identityRef ?? '<identity-name>'} --site <site-id> --role <role> --agent-kind <kind> --label <label> --by <principal>`,
      });
    }
  }
  return issues;
}
