import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SqliteInboxStore } from '@narada2/control-plane';
import { readOperatorSurfaceIdentities, type OperatorSurfaceIdentity } from './operator-surface-registry.js';

export type SiteReadinessPosture =
  | 'site_absent'
  | 'initialized_unready'
  | 'ready_missing_role_binding'
  | 'ready_missing_transport'
  | 'ready_pending_inbox'
  | 'fully_idle';

export interface SiteReadinessCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  next_command?: string;
}

export interface SiteReadinessResult {
  posture: SiteReadinessPosture;
  target_locus: {
    site: string;
    site_root: string;
    operation: string | null;
  };
  onboarding: {
    state: string;
    source: 'governance.readiness_phase' | 'readiness_phase' | 'default';
  };
  coordinates: {
    governing_law_source: unknown | null;
    authority_locus: unknown | null;
    evidence_locus: unknown | null;
    embodiments: unknown[];
    operator_surface_posture: {
      role: string;
      identity_id: string | null;
      bound_transport: boolean;
      submit_strategy: string | null;
    };
  };
  checks: SiteReadinessCheck[];
  blockers: SiteReadinessCheck[];
  warnings: SiteReadinessCheck[];
  pending_inbox: Array<{ envelope_id: string; kind: string; title: string | null }>;
  next_command: string;
  bounded_output: true;
}

export interface AssessSiteReadinessOptions {
  site: string;
  operation?: string | null;
  role?: string;
}

function titleFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  return typeof record.title === 'string'
    ? record.title
    : typeof record.summary === 'string'
      ? record.summary
      : null;
}

function listPendingInbox(siteRoot: string): SiteReadinessResult['pending_inbox'] {
  const dbPath = join(siteRoot, '.ai', 'inbox.db');
  if (!existsSync(dbPath)) return [];
  const store = new SqliteInboxStore(dbPath);
  try {
    return store.list({ status: 'received', limit: 5 }).map((envelope) => ({
      envelope_id: envelope.envelope_id,
      kind: envelope.kind,
      title: titleFromPayload(envelope.payload),
    }));
  } finally {
    store.close();
  }
}

function hasTransport(identity: OperatorSurfaceIdentity | null): boolean {
  if (!identity) return false;
  const capabilities = identity.input_capabilities ?? [];
  return capabilities.includes('focus') || capabilities.includes('type_text') || Boolean(identity.submit_strategy);
}

function nextCommandFor(posture: SiteReadinessPosture, siteRoot: string, role: string): string {
  switch (posture) {
    case 'site_absent':
      return `narada sites init --root ${JSON.stringify(siteRoot)}`;
    case 'initialized_unready':
      return `narada sites doctor ${JSON.stringify(siteRoot)} --format json`;
    case 'ready_missing_role_binding':
      return `narada operator-surface agent instantiate --cwd ${JSON.stringify(siteRoot)} --site ${JSON.stringify(siteRoot)} --role ${role} --agent-kind codex_cli --by <principal>`;
    case 'ready_missing_transport':
      return 'narada operator-surface bind-focused --as self';
    case 'ready_pending_inbox':
      return `narada inbox work-next --by ${role}`;
    case 'fully_idle':
      return `narada work-next --agent ${role} --format json`;
  }
}

function readSiteConfig(siteRoot: string): Record<string, unknown> | null {
  const configPath = join(siteRoot, 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function objectField(source: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(source: Record<string, unknown> | null | undefined, key: string): unknown[] {
  const value = source?.[key];
  return Array.isArray(value) ? value : [];
}

function readinessPhase(config: Record<string, unknown> | null): SiteReadinessResult['onboarding'] {
  const governance = objectField(config, 'governance');
  const governancePhase = governance?.readiness_phase;
  if (typeof governancePhase === 'string' && governancePhase.trim()) {
    return { state: governancePhase, source: 'governance.readiness_phase' };
  }
  const rootPhase = config?.readiness_phase;
  if (typeof rootPhase === 'string' && rootPhase.trim()) {
    return { state: rootPhase, source: 'readiness_phase' };
  }
  return { state: 'not_yet_onboarded', source: 'default' };
}

function coordinates(config: Record<string, unknown> | null, roleIdentity: OperatorSurfaceIdentity | null, role: string): SiteReadinessResult['coordinates'] {
  const governance = objectField(config, 'governance');
  const locus = objectField(config, 'locus');
  return {
    governing_law_source: governance?.governing_law_source ?? null,
    authority_locus: governance?.authority_locus ?? locus ?? null,
    evidence_locus: governance?.mutation_evidence_locus ?? null,
    embodiments: arrayField(governance, 'embodiments').length > 0 ? arrayField(governance, 'embodiments') : arrayField(config, 'embodiments'),
    operator_surface_posture: {
      role,
      identity_id: roleIdentity?.identity_id ?? null,
      bound_transport: hasTransport(roleIdentity),
      submit_strategy: roleIdentity?.submit_strategy ?? null,
    },
  };
}

export async function assessSiteReadiness(options: AssessSiteReadinessOptions): Promise<SiteReadinessResult> {
  const role = options.role?.trim() || 'architect';
  const siteRoot = resolve(options.site);
  const siteExists = existsSync(siteRoot);
  const configExists = existsSync(join(siteRoot, 'config.json'));
  const aiExists = existsSync(join(siteRoot, '.ai'));
  const config = siteExists && configExists ? readSiteConfig(siteRoot) : null;
  const pendingInbox = siteExists ? listPendingInbox(siteRoot) : [];
  const identities = siteExists ? await readOperatorSurfaceIdentities(siteRoot) : { identities: [] };
  const roleIdentity = identities.identities.find((identity) => identity.role === role) ?? null;

  let posture: SiteReadinessPosture;
  if (!siteExists) {
    posture = 'site_absent';
  } else if (!configExists || !aiExists) {
    posture = 'initialized_unready';
  } else if (!roleIdentity) {
    posture = 'ready_missing_role_binding';
  } else if (!hasTransport(roleIdentity)) {
    posture = 'ready_missing_transport';
  } else if (pendingInbox.length > 0) {
    posture = 'ready_pending_inbox';
  } else {
    posture = 'fully_idle';
  }

  const nextCommand = nextCommandFor(posture, siteRoot, role);
  const checks: SiteReadinessCheck[] = [
    {
      name: 'site_root_exists',
      status: siteExists ? 'pass' : 'fail',
      message: siteExists ? siteRoot : `missing: ${siteRoot}`,
      next_command: siteExists ? undefined : nextCommand,
    },
    {
      name: 'site_config_exists',
      status: configExists ? 'pass' : 'fail',
      message: join(siteRoot, 'config.json'),
      next_command: configExists ? undefined : nextCommand,
    },
    {
      name: 'site_ai_surface_exists',
      status: aiExists ? 'pass' : 'fail',
      message: join(siteRoot, '.ai'),
      next_command: aiExists ? undefined : nextCommand,
    },
    {
      name: 'role_identity_exists',
      status: roleIdentity ? 'pass' : 'fail',
      message: roleIdentity?.identity_id ?? `missing role identity for ${role}`,
      next_command: roleIdentity ? undefined : nextCommand,
    },
    {
      name: 'operator_surface_transport_declared',
      status: hasTransport(roleIdentity) ? 'pass' : 'fail',
      message: roleIdentity ? 'transport metadata present' : 'no role identity',
      next_command: hasTransport(roleIdentity) ? undefined : nextCommand,
    },
    {
      name: 'readiness_phase_declared',
      status: readinessPhase(config).source === 'default' ? 'warn' : 'pass',
      message: readinessPhase(config).state,
      next_command: readinessPhase(config).source === 'default' ? 'narada sites doctor <site> --format json' : undefined,
    },
  ];

  return {
    posture,
    target_locus: {
      site: options.site,
      site_root: siteRoot,
      operation: options.operation?.trim() || null,
    },
    onboarding: readinessPhase(config),
    coordinates: coordinates(config, roleIdentity, role),
    checks,
    blockers: checks.filter((check) => check.status === 'fail'),
    warnings: checks.filter((check) => check.status === 'warn'),
    pending_inbox: pendingInbox,
    next_command: nextCommand,
    bounded_output: true,
  };
}
