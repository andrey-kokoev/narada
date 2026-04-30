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

export interface SiteCapabilityChoice {
  number: number;
  id: string;
  status: 'answered' | 'deferred' | 'unresolved';
  prompt: string;
  options: string[];
  current: unknown | null;
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
  readiness_strata: {
    structural: SiteReadinessPosture;
    business_capability: {
      status: 'not_applicable' | 'ready' | 'choices_unresolved';
      unresolved_count: number;
      note: string;
    };
  };
  capability_choices: {
    site_kind: string | null;
    required_before_inhabited_readiness: boolean;
    choices: SiteCapabilityChoice[];
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

function siteKind(config: Record<string, unknown> | null): string | null {
  const kind = config?.site_kind;
  return typeof kind === 'string' && kind.trim() ? kind : null;
}

function configuredChoice(config: Record<string, unknown> | null, id: string): unknown | null {
  const governance = objectField(config, 'governance');
  const onboarding = objectField(config, 'onboarding') ?? objectField(governance, 'onboarding');
  const choices = objectField(onboarding, 'capability_choices') ?? objectField(config, 'capability_choices');
  return choices && Object.prototype.hasOwnProperty.call(choices, id) ? choices[id] ?? null : null;
}

function choiceStatus(value: unknown): SiteCapabilityChoice['status'] {
  if (value === null || value === undefined || value === '') return 'unresolved';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.status === 'deferred' || record.deferred === true) return 'deferred';
  }
  if (value === 'deferred' || value === 'none_for_now') return 'deferred';
  return 'answered';
}

function clientServiceCapabilityChoices(config: Record<string, unknown> | null): SiteCapabilityChoice[] {
  if (siteKind(config) !== 'client_service') return [];
  const definitions = [
    {
      id: 'mailbox_intake_posture',
      prompt: 'Mailbox/intake posture',
      options: ['none_for_now', 'bind_existing_mailbox', 'provision_or_request_mailbox'],
    },
    {
      id: 'allowed_correspondents_or_domains',
      prompt: 'Allowed correspondents or domains',
      options: ['none_declared', 'specific_correspondents', 'domain_predicates'],
    },
    {
      id: 'runtime_behavior',
      prompt: 'Runtime behavior',
      options: ['manual_only', 'scheduled_polling', 'continuous_background'],
    },
    {
      id: 'sync_posture',
      prompt: 'Sync posture',
      options: ['metadata_only', 'headers_and_bodies', 'attachments_with_bounds'],
    },
    {
      id: 'source_data_loci',
      prompt: 'Source data loci',
      options: ['none_declared', 'mailbox', 'filesystem', 'external_system'],
    },
    {
      id: 'affiliated_data_or_elt_sites',
      prompt: 'Affiliated Data/ELT Sites',
      options: ['none_for_now', 'existing_site_refs', 'request_new_site'],
    },
    {
      id: 'reporting_surfaces',
      prompt: 'Reporting surfaces',
      options: ['operator_console_only', 'site_inbox_observations', 'external_report_artifacts'],
    },
    {
      id: 'operator_surface_roles',
      prompt: 'Operator-surface roles',
      options: ['architect_only', 'architect_builder_observer', 'custom_declared_roles'],
    },
  ];
  return definitions.map((definition, index) => {
    const current = configuredChoice(config, definition.id);
    return {
      number: index + 1,
      ...definition,
      status: choiceStatus(current),
      current,
    };
  });
}

function businessCapabilityReadiness(
  config: Record<string, unknown> | null,
  structural: SiteReadinessPosture,
): SiteReadinessResult['readiness_strata']['business_capability'] {
  const choices = clientServiceCapabilityChoices(config);
  if (choices.length === 0) {
    return {
      status: 'not_applicable',
      unresolved_count: 0,
      note: 'Business-capability readiness choices are not required for this Site kind.',
    };
  }
  const unresolved = choices.filter((choice) => choice.status === 'unresolved');
  if (unresolved.length > 0) {
    return {
      status: 'choices_unresolved',
      unresolved_count: unresolved.length,
      note: `${structural} is structural readiness only; client-service inhabited readiness requires answering or deferring material capability choices.`,
    };
  }
  return {
    status: 'ready',
    unresolved_count: 0,
    note: 'Client-service material capability choices are answered or explicitly deferred.',
  };
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
  const capabilityChoices = clientServiceCapabilityChoices(config);
  const capabilityReadiness = businessCapabilityReadiness(config, posture);
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
    {
      name: 'client_service_capability_choices',
      status: capabilityReadiness.status === 'choices_unresolved' ? 'warn' : 'pass',
      message: capabilityReadiness.note,
      next_command: capabilityReadiness.status === 'choices_unresolved'
        ? `Record or defer capability choices under config capability_choices, then rerun narada sites doctor ${JSON.stringify(siteRoot)} --format json`
        : undefined,
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
    readiness_strata: {
      structural: posture,
      business_capability: capabilityReadiness,
    },
    capability_choices: {
      site_kind: siteKind(config),
      required_before_inhabited_readiness: siteKind(config) === 'client_service',
      choices: capabilityChoices,
    },
    checks,
    blockers: checks.filter((check) => check.status === 'fail'),
    warnings: checks.filter((check) => check.status === 'warn'),
    pending_inbox: pendingInbox,
    next_command: nextCommand,
    bounded_output: true,
  };
}
