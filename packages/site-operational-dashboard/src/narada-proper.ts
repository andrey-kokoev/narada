import {
  DASHBOARD_SCHEMA,
  type DashboardFreshness,
  type DashboardRow,
  type DashboardRowState,
  type DashboardSection,
  type DashboardSnapshot,
} from './index.js';

export type NaradaProperArtifactKey =
  | 'site_identity'
  | 'task_lifecycle'
  | 'roster'
  | 'inbox'
  | 'inbox_drop'
  | 'publication'
  | 'telemetry'
  | 'packages'
  | 'capabilities'
  | 'residuals'
  | 'work_next';

export interface NaradaProperArtifactSource {
  key: NaradaProperArtifactKey;
  evidence_ref: string;
  observed_at?: string;
  data?: unknown;
  read?: () => unknown | Promise<unknown>;
}

export interface NaradaProperProviderContext {
  site_ref?: string;
  generated_at: string;
  artifacts: NaradaProperArtifactSource[];
}

export interface NaradaProperProviderResult {
  sections: DashboardSection[];
  rows: DashboardRow[];
}

const DEFAULT_AUTHORITY_LIMITS = [
  'dashboard_row_is_observation_not_site_authority',
  'provider_must_not_mutate_task_inbox_lifecycle_roster_publication_or_secrets',
  'raw_secret_values_excluded',
];

const SECTION_TITLES: Record<string, string> = {
  identity: 'Site Identity / Loci',
  tasks: 'Task Lifecycle',
  agents: 'Roster / Agents',
  inbox: 'Inbox / Inbox Drop',
  publication: 'Publication / Telemetry',
  packages: 'Package / Build Posture',
  capabilities: 'Capability / Secret Posture',
  attention: 'Residuals / Operator Attention',
};

export async function collectNaradaProperDashboardSections(
  context: NaradaProperProviderContext,
): Promise<DashboardSection[]> {
  const artifacts = await loadArtifacts(context.artifacts);
  return [
    section('identity', [identityRow(context, artifacts.site_identity)]),
    section('tasks', [taskLifecycleRow(context, artifacts.task_lifecycle)]),
    section('agents', [rosterRow(context, artifacts.roster)]),
    section('inbox', [inboxRow(context, artifacts.inbox), inboxDropRow(context, artifacts.inbox_drop)]),
    section('publication', [publicationRow(context, artifacts.publication), telemetryRow(context, artifacts.telemetry)]),
    section('packages', [packageRow(context, artifacts.packages)]),
    section('capabilities', [capabilityRow(context, artifacts.capabilities)]),
    section('attention', [residualsRow(context, artifacts.residuals), workNextRow(context, artifacts.work_next)]),
  ];
}

export async function buildNaradaProperDashboardSnapshot(
  context: NaradaProperProviderContext,
): Promise<DashboardSnapshot> {
  const sections = await collectNaradaProperDashboardSections(context);
  return {
    schema: DASHBOARD_SCHEMA,
    snapshot_id: `narada-proper-${context.generated_at.replace(/[^0-9A-Za-z]/g, '')}`,
    generated_at: context.generated_at,
    title: `${context.site_ref ?? 'narada-proper'} operational posture`,
    subtitle: 'Read-only local Site dashboard projection',
    sections,
    authority_limits: [
      'dashboard_is_projection_not_site_authority',
      'rows_are_observations_not_admissions',
      'dashboard_does_not_mutate_task_inbox_lifecycle_roster_publication_or_secrets',
    ],
    evidence_refs: context.artifacts.map((artifact) => artifact.evidence_ref),
  };
}

export function flattenDashboardRows(sections: DashboardSection[]): DashboardRow[] {
  return sections.flatMap((section) => section.rows);
}

async function loadArtifacts(
  sources: NaradaProperArtifactSource[],
): Promise<Partial<Record<NaradaProperArtifactKey, LoadedArtifact>>> {
  const loaded: Partial<Record<NaradaProperArtifactKey, LoadedArtifact>> = {};
  for (const source of sources) {
    loaded[source.key] = {
      evidence_ref: source.evidence_ref,
      observed_at: source.observed_at,
      data: source.read ? await source.read() : source.data,
    };
  }
  return loaded;
}

interface LoadedArtifact {
  evidence_ref: string;
  observed_at?: string;
  data?: unknown;
}

function section(id: string, rows: DashboardRow[]): DashboardSection {
  return { id, title: SECTION_TITLES[id] ?? id, rows };
}

function identityRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const siteId = stringField(record, 'site_id') ?? context.site_ref ?? 'narada-proper';
  const authorityLocus = stringField(record, 'authority_locus') ?? 'unknown';
  return row({
    id: 'narada-proper-site-identity',
    label: 'Site identity and authority locus',
    state: artifact ? 'ok' : 'unknown',
    basis: artifact
      ? `Observed Site ${siteId} with authority locus ${authorityLocus}.`
      : 'Site identity artifact is missing; dashboard cannot infer authority locus from cwd.',
    context,
    artifact,
    next_action: artifact ? 'continue_read_only_observation' : 'provide_site_identity_projection_artifact',
    detail: { site_id: siteId, authority_locus: authorityLocus, root_count: arrayField(record, 'roots').length },
  });
}

function taskLifecycleRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const open = numberField(record, 'open') ?? numberField(record, 'open_tasks') ?? 0;
  const claimed = numberField(record, 'claimed') ?? 0;
  const inReview = numberField(record, 'in_review') ?? 0;
  const blocked = numberField(record, 'blocked') ?? 0;
  return row({
    id: 'narada-proper-task-lifecycle',
    label: 'Task lifecycle snapshot',
    state: artifact ? stateFromCount(blocked, open + claimed + inReview) : 'unknown',
    basis: artifact
      ? `Bounded task lifecycle projection shows ${open} open, ${claimed} claimed, ${inReview} in review, and ${blocked} blocked.`
      : 'Task lifecycle projection artifact is missing; provider did not read SQLite directly.',
    context,
    artifact,
    next_action: blocked > 0 ? 'inspect_blocked_task_projection' : 'use_governed_task_lifecycle_commands_for_mutation',
    detail: { open, claimed, in_review: inReview, blocked },
  });
}

function rosterRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const agents = arrayField(record, 'agents');
  const active = agents.filter((agent) => stringField(asRecord(agent), 'status') === 'working').length;
  return row({
    id: 'narada-proper-roster-agents',
    label: 'Roster and active agents',
    state: artifact ? (agents.length === 0 ? 'attention' : 'ok') : 'unknown',
    basis: artifact
      ? `Roster projection contains ${agents.length} agents and ${active} working entries.`
      : 'Roster projection artifact is missing; provider did not mutate roster state.',
    context,
    artifact,
    next_action: agents.length === 0 ? 'inspect_roster_projection' : 'continue_role_loop',
    detail: { agent_count: agents.length, working_agents: active },
  });
}

function inboxRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const received = numberField(record, 'received') ?? 0;
  const handling = numberField(record, 'handling') ?? 0;
  const pending = numberField(record, 'pending') ?? 0;
  return row({
    id: 'narada-proper-inbox',
    label: 'Canonical Inbox posture',
    state: artifact ? stateFromCount(handling + pending, received) : 'unknown',
    basis: artifact
      ? `Inbox summary reports ${received} received, ${handling} handling, and ${pending} pending envelopes.`
      : 'Inbox summary artifact is missing; provider did not expose raw inbox payloads.',
    context,
    artifact,
    next_action: received + handling + pending > 0 ? 'handle_inbox_through_governed_triage' : 'continue_observation',
    detail: { received, handling, pending },
  });
}

function inboxDropRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const files = numberField(record, 'unadmitted_files') ?? numberField(record, 'file_count') ?? 0;
  return row({
    id: 'narada-proper-inbox-drop',
    label: 'Inbox drop posture',
    state: artifact ? stateFromCount(files, 0) : 'unknown',
    basis: artifact ? `Inbox-drop projection reports ${files} unadmitted files.` : 'Inbox-drop projection artifact is missing.',
    context,
    artifact,
    next_action: files > 0 ? 'run_governed_inbox_ingest_preview' : 'continue_observation',
    detail: { unadmitted_files: files },
  });
}

function publicationRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const dirty = booleanField(record, 'dirty') ?? false;
  const unpublished = numberField(record, 'unpublished_artifacts') ?? 0;
  return row({
    id: 'narada-proper-publication',
    label: 'Publication posture',
    state: artifact ? stateFromCount(dirty || unpublished > 0 ? 1 : 0, 0) : 'unknown',
    basis: artifact
      ? `Publication projection reports dirty=${dirty} and ${unpublished} unpublished artifacts.`
      : 'Publication projection artifact is missing; provider did not inspect remote publication authority.',
    context,
    artifact,
    next_action: dirty || unpublished > 0 ? 'inspect_repo_publication_intent' : 'continue_observation',
    detail: { dirty, unpublished_artifacts: unpublished },
  });
}

function telemetryRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const readiness = stringField(record, 'readiness') ?? stringField(record, 'status') ?? 'unknown';
  return row({
    id: 'narada-proper-telemetry',
    label: 'Telemetry/readiness posture',
    state: artifact ? mapStatus(readiness) : 'unknown',
    basis: artifact ? `Telemetry projection reports readiness/status ${readiness}.` : 'Telemetry readiness artifact is missing.',
    context,
    artifact,
    next_action: readiness === 'blocked' ? 'inspect_telemetry_blocker_evidence' : 'continue_observation',
    detail: { readiness },
  });
}

function packageRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const tests = stringField(record, 'tests') ?? 'unknown';
  const build = stringField(record, 'build') ?? 'unknown';
  return row({
    id: 'narada-proper-package-build',
    label: 'Package/build posture',
    state: artifact ? (tests === 'failed' || build === 'failed' ? 'warning' : 'ok') : 'unknown',
    basis: artifact ? `Package projection reports tests=${tests} and build=${build}.` : 'Package/build artifact is missing; provider did not run commands.',
    context,
    artifact,
    next_action: tests === 'failed' || build === 'failed' ? 'inspect_focused_verification_output' : 'continue_observation',
    detail: { tests, build },
  });
}

function capabilityRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const missing = numberField(record, 'missing_refs') ?? 0;
  const stale = numberField(record, 'stale_refs') ?? 0;
  const configured = numberField(record, 'configured_refs') ?? 0;
  return row({
    id: 'narada-proper-capability-secret',
    label: 'Capability and secret posture',
    state: artifact ? stateFromCount(missing + stale, 0) : 'unknown',
    basis: artifact
      ? `Capability projection reports ${configured} configured refs, ${missing} missing refs, and ${stale} stale refs.`
      : 'Capability projection artifact is missing; provider did not resolve raw secrets.',
    context,
    artifact,
    next_action: missing + stale > 0 ? 'run_capability_preflight_with_refs_only' : 'continue_observation',
    detail: { configured_refs: configured, missing_refs: missing, stale_refs: stale },
  });
}

function residualsRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const residuals = arrayField(record, 'residuals');
  return row({
    id: 'narada-proper-residuals',
    label: 'Residuals requiring operator attention',
    state: artifact ? stateFromCount(residuals.length, 0) : 'unknown',
    basis: artifact ? `Residual projection contains ${residuals.length} bounded residuals.` : 'Residual projection artifact is missing.',
    context,
    artifact,
    next_action: residuals.length > 0 ? 'triage_residuals_through_governed_work' : 'continue_observation',
    detail: { residual_count: residuals.length },
  });
}

function workNextRow(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardRow {
  const record = asRecord(artifact?.data);
  const nextAction = stringField(record, 'next_action') ?? 'unknown';
  const reason = stringField(record, 'reason') ?? null;
  return row({
    id: 'narada-proper-work-next',
    label: 'Current governed next action',
    state: artifact ? (nextAction === 'idle' ? 'ok' : 'attention') : 'unknown',
    basis: artifact ? `Work-next projection reports next_action=${nextAction}${reason ? ` (${reason})` : ''}.` : 'Work-next projection artifact is missing.',
    context,
    artifact,
    next_action: nextAction === 'idle' ? 'continue_observation' : 'execute_returned_governed_work_packet',
    detail: { next_action: nextAction, reason },
  });
}

function row(input: {
  id: string;
  label: string;
  state: DashboardRowState;
  basis: string;
  context: NaradaProperProviderContext;
  artifact?: LoadedArtifact;
  next_action: string;
  detail: Record<string, unknown>;
}): DashboardRow {
  return {
    id: input.id,
    label: input.label,
    state: input.state,
    basis: input.basis,
    observed_at: input.artifact?.observed_at ?? input.context.generated_at,
    freshness: freshness(input.context, input.artifact),
    evidence_refs: [{ ref: input.artifact?.evidence_ref ?? `missing:${input.id}` }],
    next_action: input.next_action,
    detail: redactSecretLike(input.detail) as DashboardRow['detail'],
    authority_limits: DEFAULT_AUTHORITY_LIMITS,
  };
}

function freshness(context: NaradaProperProviderContext, artifact?: LoadedArtifact): DashboardFreshness {
  if (!artifact) return { status: 'missing', observed_at: context.generated_at, basis: 'artifact_missing' };
  return { status: 'fresh', observed_at: artifact.observed_at ?? context.generated_at, basis: 'caller_supplied_bounded_artifact' };
}

function stateFromCount(attentionCount: number, usefulCount: number): DashboardRowState {
  if (attentionCount > 0) return 'attention';
  if (usefulCount > 0) return 'ok';
  return 'info';
}

function mapStatus(status: string): DashboardRowState {
  if (['ready', 'ok', 'fresh', 'verified', 'locally_validated'].includes(status)) return 'ok';
  if (['blocked', 'failed', 'error'].includes(status)) return 'blocked';
  if (['stale', 'warning', 'attention'].includes(status)) return 'attention';
  return 'unknown';
}

function redactSecretLike(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretLike);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' && containsSecretMarker(value) ? '[redacted]' : value;
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
    if (containsSecretMarker(key)) {
      acc[`${key.replace(/secret|token|password|authorization|private[_-]?key|api[_-]?key/gi, 'redacted')}_redacted`] = true;
    } else {
      acc[key] = redactSecretLike(entry);
    }
    return acc;
  }, {});
}

function containsSecretMarker(value: string): boolean {
  return /secret|token|password|authorization|private[_-]?key|api[_-]?key/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' && record[key].trim() ? record[key] : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : null;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | null {
  return typeof record[key] === 'boolean' ? record[key] : null;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  return Array.isArray(record[key]) ? record[key] : [];
}
