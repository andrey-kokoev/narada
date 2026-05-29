/**
 * `narada sites`
 *
 * Site discovery and registry management commands.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, posix, resolve, win32 } from 'node:path';
import { hostname } from 'node:os';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  explainSiteRelation,
  makeSiteRelationRecord,
  parseCsv,
  readSiteRelationRegistry,
  siteRelationRegistryPath,
  validateSiteRelations,
  writeSiteRelationRegistry,
} from '../lib/site-relation-registry.js';
import { inspectDelegatedCliHealth } from '../lib/delegated-cli-health.js';
import { assessSiteReadiness } from '../lib/site-readiness.js';
import {
  CREATE_SITE_SUPPORTED_PRESETS,
  expandCreateSitePackageDescriptorsFromPackages,
  isCreateSiteSupportedPreset,
  selectCreateSiteTemplate,
  type CreateSitePackageDescriptor,
} from '../lib/create-site-template-catalog.js';

const execFileAsync = promisify(execFile);

export interface SitesOptions {
  format?: string;
  verbose?: boolean;
}

export interface SitesTaskLifecycleInitOptions extends SitesOptions {
  site?: string;
  dryRun?: boolean;
}

export interface SitesCreateOptions extends SitesOptions {
  config?: string;
  preset?: string;
  siteId?: string;
  root?: string;
  siteKind?: string;
  authorityLocus?: string;
  dryRun?: boolean;
  outputPlan?: string;
  executeLive?: boolean;
  liveAuthorityBasis?: string;
}

export interface SitesLiveCarrierOptions extends SitesOptions {
  carrier?: string;
  mode?: string;
  targetSiteRoot?: string;
  siteId?: string;
  authorityBasis?: string;
  sourceSiteRoot?: string;
  runtimeTarget?: string;
  mcpServerJson?: string;
  profileArtifactPath?: string;
  profileTarget?: string;
  dbVerified?: boolean;
  storageVerified?: boolean;
  dbInitVerified?: boolean;
  mcpRegistrationVerified?: boolean;
  profileCanPrecedeMcpRegistration?: boolean;
  mutationAuthorized?: boolean;
  handoffAsCheckpointTruth?: boolean;
  importSourceRuntimeState?: boolean;
  includeSecrets?: boolean;
  registerMcp?: boolean;
}

interface CreateSiteConfig {
  schema?: string;
  mode?: string;
  preset?: string;
  template_catalog?: {
    template_id?: string;
    template_components?: string[];
  };
  site?: {
    site_id?: string;
    site_kind?: string;
    authority_locus?: string;
    site_root?: string;
    workspace_root?: string;
    substrate?: string;
    execution_surface?: string;
    sync_posture?: string;
  };
  packages?: Array<Record<string, unknown>>;
  identity?: {
    named_agents?: Array<Record<string, unknown>>;
    role_assignments?: Array<Record<string, unknown>>;
    role_compatibility_identities?: Array<Record<string, unknown>>;
    claimed_identity_evidence?: Array<Record<string, unknown>>;
    mechanical_verification_basis?: Array<Record<string, unknown>>;
  };
  storage?: Record<string, unknown>;
  mcp?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  inbox?: Record<string, unknown>;
  task_lifecycle?: Record<string, unknown>;
  agent_context?: Record<string, unknown>;
  operator_surface?: Record<string, unknown>;
  windows_pwsh?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}

interface CreateSiteRefusal {
  code: string;
  message: string;
  path?: string;
  evidence?: unknown;
}

interface CreateSiteWarning {
  code: string;
  message: string;
}

export interface SitesLifecycleKindsOptions extends SitesOptions {}

export interface SitesLifecyclePreflightOptions extends SitesOptions {
  kind?: string;
  sourceSite?: string;
  targetSite?: string;
  authorityMode?: string;
}

export interface SitesLifecycleExecuteAbsorbOptions extends SitesOptions {
  cwd?: string;
  sourceSite?: string;
  targetSite?: string;
  authorityMode?: string;
  admittedMaterial?: string;
  evidenceRef?: string;
  retainedAuthority?: string;
  by?: string;
  execute?: boolean;
}

export interface SitesLineageEventsOptions extends SitesOptions {}

export interface SitesRelationRecordOptions extends SitesOptions {
  cwd?: string;
  kind?: string;
  sourceSite?: string;
  targetSite?: string;
  authorityEffect?: string;
  admittedMaterial?: string;
  evidenceRef?: string;
  lineageEventRef?: string;
  reciprocalRequired?: boolean;
  reciprocalRelationId?: string;
  by?: string;
}

export interface SitesRelationListOptions extends SitesOptions {
  cwd?: string;
  kind?: string;
  sourceSite?: string;
  targetSite?: string;
  status?: string;
  limit?: number;
}

export interface SitesRelationValidateOptions extends SitesOptions {
  cwd?: string;
}

export interface SitesRelationExplainOptions extends SitesOptions {
  cwd?: string;
  relationId?: string;
}

export interface SitesAgentBootstrapOptions extends SitesOptions {
  role?: string;
}

interface SiteListEntry {
  siteId: string;
  variant: string;
  substrate: string;
  health: string;
  lastCycle: string | null;
  failures: number;
}

export interface SiteDoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'declared_exception';
  message: string;
  remediation?: string;
}

const SITE_SUBDIRECTORIES = [
  'state',
  'messages',
  'tombstones',
  'views',
  'blobs',
  'tmp',
  'db',
  'logs',
  'traces',
] as const;

const CREATE_SITE_SOURCE_STATE_PATTERNS: Array<{ pattern: RegExp; code: string; reason: string }> = [
  { pattern: /(^|[\\/])\.ai[\\/]state[\\/]agent-context\.(sqlite|db)$/i, code: 'source_runtime_state_import_refused', reason: 'source agent-context database' },
  { pattern: /(^|[\\/])\.narada[\\/]checkpoints([\\/]|$)/i, code: 'source_runtime_state_import_refused', reason: 'source checkpoint history' },
  { pattern: /(^|[\\/])\.ai[\\/]checkpoints([\\/]|$)/i, code: 'source_runtime_state_import_refused', reason: 'source checkpoint history' },
  { pattern: /(^|[\\/])\.ai[\\/]task-lifecycle\.db(-shm|-wal)?$/i, code: 'source_runtime_state_import_refused', reason: 'source task lifecycle database' },
  { pattern: /(^|[\\/])\.ai[\\/]do-not-open[\\/]tasks([\\/]|$)/i, code: 'source_runtime_state_import_refused', reason: 'source task history' },
  { pattern: /(^|[\\/])\.ai[\\/]inbox(\.db|[\\/]|$)/i, code: 'source_runtime_state_import_refused', reason: 'source inbox state' },
  { pattern: /(^|[\\/])\.ai[\\/]agents[\\/]roster\.json$/i, code: 'source_runtime_state_import_refused', reason: 'source roster authority' },
  { pattern: /(^|[\\/])operator-surfaces([\\/]|$)/i, code: 'source_runtime_state_import_refused', reason: 'operator-surface runtime state' },
  { pattern: /^c:[\\/]programdata[\\/]narada[\\/]sites[\\/]pc[\\/]/i, code: 'source_runtime_state_import_refused', reason: 'PC-locus runtime state' },
  { pattern: /(^|[\\/])(secrets?|tokens?|credentials?)([\\/]|\.|$)/i, code: 'raw_secret_in_config_refused', reason: 'secret or credential path' },
];

const SITE_LIFECYCLE_KINDS = [
  {
    kind: 'clone',
    purpose: 'Create another Site embodiment from an existing Site while declaring whether mutation authority stays, migrates, or forwards.',
    sourceRequired: true,
    targetRequired: true,
    authorityModes: ['read_only', 'forwarding', 'authority_migration'],
  },
  {
    kind: 'fork',
    purpose: 'Create a divergent Site lineage with explicit provenance and independent future authority.',
    sourceRequired: true,
    targetRequired: true,
    authorityModes: ['new_authority'],
  },
  {
    kind: 'split',
    purpose: 'Extract a sub-locus from a Site with traceable provenance and explicit authority transfer or residual linkage.',
    sourceRequired: true,
    targetRequired: true,
    authorityModes: ['partial_transfer', 'residual_linkage'],
  },
  {
    kind: 'absorb',
    purpose: 'Admit sidecar or local Site knowledge, machinery, or trace into a broader Site or Narada proper.',
    sourceRequired: true,
    targetRequired: true,
    authorityModes: ['admission_review'],
  },
  {
    kind: 'migrate',
    purpose: 'Move Site authority or substrate while preserving identity, provenance, config, trace, and read-back confirmation.',
    sourceRequired: true,
    targetRequired: true,
    authorityModes: ['authority_migration'],
  },
  {
    kind: 're-instantiate',
    purpose: 'Rebuild a Site from template, durable trace, config, and evidence, then prove the originating case still runs.',
    sourceRequired: true,
    targetRequired: true,
    authorityModes: ['reconstruction_proof'],
  },
  {
    kind: 'archive',
    purpose: 'Retire a Site from active operation while preserving trace, provenance, and explicit non-authority posture.',
    sourceRequired: true,
    targetRequired: false,
    authorityModes: ['retired_non_authority'],
  },
] as const;

const SITE_LINEAGE_EVENTS = [
  {
    event: 'site.created',
    edge_type: 'origin',
    authority_effect: 'establishes_site_authority',
    description: 'A Site is first created or admitted as a runtime locus.',
  },
  {
    event: 'site.cloned',
    edge_type: 'clone',
    authority_effect: 'preserve_or_route_authority',
    description: 'A new Site embodiment is derived from a source Site.',
  },
  {
    event: 'site.forked',
    edge_type: 'fork',
    authority_effect: 'creates_independent_authority_lineage',
    description: 'A Site lineage intentionally diverges from its source.',
  },
  {
    event: 'site.split',
    edge_type: 'split',
    authority_effect: 'partial_transfer_or_residual_linkage',
    description: 'A sub-locus is extracted from a source Site.',
  },
  {
    event: 'site.absorbed',
    edge_type: 'absorption',
    authority_effect: 'admission_without_implicit_ownership',
    description: 'Sidecar or local Site material is admitted into a target Site or Narada proper.',
  },
  {
    event: 'site.migrated',
    edge_type: 'migration',
    authority_effect: 'authority_transfer',
    description: 'A Site authority or substrate changes locus through a cutover.',
  },
  {
    event: 'site.reinstantiated',
    edge_type: 're_instantiation',
    authority_effect: 'reconstruction_proof',
    description: 'A Site is rebuilt from template, trace, config, and evidence.',
  },
  {
    event: 'site.archived',
    edge_type: 'retirement',
    authority_effect: 'retired_non_authority',
    description: 'A Site is retired while preserving trace and non-authority posture.',
  },
  {
    event: 'site.authority_transferred',
    edge_type: 'authority',
    authority_effect: 'authority_transfer',
    description: 'Mutation authority for one or more classes moves between loci.',
  },
  {
    event: 'site.authority_refused',
    edge_type: 'authority',
    authority_effect: 'authority_refusal',
    description: 'A proposed authority move is explicitly refused or blocked.',
  },
  {
    event: 'site.subscribed',
    edge_type: 'subscription',
    authority_effect: 'influence_only',
    description: 'A Site subscribes to another Site signal stream without accepting mutation authority.',
  },
  {
    event: 'site.published',
    edge_type: 'publication',
    authority_effect: 'influence_only',
    description: 'A Site publishes a typed signal for possible governed admission elsewhere.',
  },
  {
    event: 'site.knowledge_admitted',
    edge_type: 'knowledge_admission',
    authority_effect: 'local_admission',
    description: 'A Site admits knowledge from another locus under its own authority.',
  },
  {
    event: 'site.tool_admitted',
    edge_type: 'tool_admission',
    authority_effect: 'local_admission',
    description: 'A Site admits a tool or tool binding under its own authority.',
  },
  {
    event: 'site.template_applied',
    edge_type: 'template',
    authority_effect: 'template_application',
    description: 'A Site applies a template while preserving local authority boundaries.',
  },
] as const;

type SiteLifecycleKind = (typeof SITE_LIFECYCLE_KINDS)[number];
type SiteLifecycleKindName = SiteLifecycleKind['kind'];

function findSiteLifecycleKind(kind: string | undefined): SiteLifecycleKind | undefined {
  return SITE_LIFECYCLE_KINDS.find((entry) => entry.kind === kind);
}

function siteLifecycleArtifacts(kind: SiteLifecycleKindName): string[] {
  const base = [
    'source_site_ref',
    'provenance_record',
    'authority_map',
    'trace_handoff',
    'read_back_confirmation',
  ];
  switch (kind) {
    case 'clone':
      return [...base, 'embodiment_policy'];
    case 'fork':
      return [...base, 'lineage_boundary'];
    case 'split':
      return [...base, 'extraction_manifest', 'residual_linkage'];
    case 'absorb':
      return [...base, 'admission_bundle', 're_instantiation_evidence'];
    case 'migrate':
      return [...base, 'migration_plan', 'cutover_confirmation'];
    case 're-instantiate':
      return [...base, 'template_ref', 'reconstruction_proof'];
    case 'archive':
      return ['source_site_ref', 'archive_manifest', 'authority_retirement_record', 'trace_preservation_record'];
  }
}

export async function sitesLineageEventsCommand(
  options: SitesLineageEventsOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const requiredFields = [
    'event_id',
    'event_type',
    'source_site_ref',
    'target_site_ref',
    'principal',
    'authority_effect',
    'evidence_refs',
    'occurred_at',
    'rollback_or_residual_posture',
  ];
  const events = SITE_LINEAGE_EVENTS.map((entry) => ({ ...entry }));

  if (fmt.getFormat() === 'human') {
    fmt.section('Site Lineage Event Vocabulary');
    fmt.table(
      [
        { key: 'event', label: 'Event', width: 28 },
        { key: 'edge_type', label: 'Edge', width: 20 },
        { key: 'authority_effect', label: 'Authority Effect', width: 30 },
      ],
      events,
    );
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      lineage_shape: 'event_log_with_graph_projection',
      required_fields: requiredFields,
      events,
    },
  };
}

function requireOption(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function normalizeSiteRelationError(error: unknown): { exitCode: ExitCode; result: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: { status: 'error', error: message },
  };
}

function relationHumanLines(title: string, rows: string[]): string {
  return [title, ...rows.map((row) => `- ${row}`)].join('\n');
}

export async function sitesRelationRecordCommand(
  options: SitesRelationRecordOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const record = makeSiteRelationRecord({
      relationKind: requireOption(options.kind, '--kind'),
      sourceSite: options.sourceSite ?? '',
      targetSite: options.targetSite ?? '',
      authorityEffect: options.authorityEffect,
      admittedMaterial: parseCsv(options.admittedMaterial),
      evidenceRefs: parseCsv(options.evidenceRef),
      lineageEventRefs: parseCsv(options.lineageEventRef),
      reciprocalRequired: options.reciprocalRequired ?? false,
      reciprocalRelationId: options.reciprocalRelationId,
      createdBy: options.by ?? '',
    });
    const registry = await readSiteRelationRegistry(cwd);
    registry.relations.push(record);
    const registryPath = await writeSiteRelationRegistry(cwd, registry);
    const result = {
      status: 'success',
      mutation_performed: true,
      authority_moved: false,
      config_mutated: false,
      registry_path: registryPath,
      relation: record,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(
        result,
        relationHumanLines('Site relation recorded', [
          `relation_id: ${record.relation_id}`,
          `kind: ${record.relation_kind}`,
          `edge: ${record.source_site_ref} -> ${record.target_site_ref}`,
          `authority_effect: ${record.authority_effect}`,
          'authority_moved: false',
        ]),
        (options.format ?? 'auto') as CliFormat,
      ),
    };
  } catch (error) {
    return normalizeSiteRelationError(error);
  }
}

export async function sitesRelationListCommand(
  options: SitesRelationListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readSiteRelationRegistry(cwd);
  const limit = options.limit ?? 20;
  const relations = registry.relations
    .filter((relation) => !options.kind || relation.relation_kind === options.kind)
    .filter((relation) => !options.sourceSite || relation.source_site_ref === options.sourceSite)
    .filter((relation) => !options.targetSite || relation.target_site_ref === options.targetSite)
    .filter((relation) => !options.status || relation.status === options.status)
    .slice(0, limit);
  const result = {
    status: 'success',
    mutation_performed: false,
    registry_path: siteRelationRegistryPath(cwd),
    count: relations.length,
    limit,
    relations,
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(
      result,
      relationHumanLines('Site relations', relations.map((relation) => `${relation.relation_id}: ${relation.relation_kind} ${relation.source_site_ref} -> ${relation.target_site_ref}`)),
      (options.format ?? 'auto') as CliFormat,
    ),
  };
}

export async function sitesRelationValidateCommand(
  options: SitesRelationValidateOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readSiteRelationRegistry(cwd);
  const issues = validateSiteRelations(registry);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const result = {
    status: errors.length === 0 ? 'success' : 'error',
    mutation_performed: false,
    registry_path: siteRelationRegistryPath(cwd),
    relation_count: registry.relations.length,
    valid: errors.length === 0,
    issues,
  };
  return {
    exitCode: errors.length === 0 ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(
      result,
      relationHumanLines(errors.length === 0 ? 'Site relation registry valid' : 'Site relation registry invalid', issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`)),
      (options.format ?? 'auto') as CliFormat,
    ),
  };
}

export async function sitesRelationExplainCommand(
  options: SitesRelationExplainOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const relationId = requireOption(options.relationId, '<relation-id>');
  const registry = await readSiteRelationRegistry(cwd);
  const explanation = explainSiteRelation(registry, relationId);
  if (!explanation.relation) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Site relation not found: ${relationId}` },
    };
  }
  const result = {
    status: explanation.blockers.length === 0 ? 'success' : 'error',
    mutation_performed: false,
    registry_path: siteRelationRegistryPath(cwd),
    ...explanation,
  };
  return {
    exitCode: explanation.blockers.length === 0 ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(
      result,
      relationHumanLines('Site relation explanation', [
        `relation_id: ${explanation.relation.relation_id}`,
        `authority_moving: ${String(explanation.authority_moving)}`,
        `evidence_only: ${String(explanation.evidence_only)}`,
        `reciprocal_satisfied: ${String(explanation.reciprocal_satisfied)}`,
        `blockers: ${explanation.blockers.length === 0 ? 'none' : explanation.blockers.join('; ')}`,
      ]),
      (options.format ?? 'auto') as CliFormat,
    ),
  };
}

async function openRegistry() {
  const {
    resolveRegistryDbPath,
    openRegistryDb,
    SiteRegistry,
  } = await import('@narada2/windows-site');
  const dbPath = resolveRegistryDbPath();
  const db = await openRegistryDb(dbPath);
  return new SiteRegistry(db);
}

export async function sitesListCommand(
  options: SitesOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const {
      getWindowsSiteStatus,
    } = await import('@narada2/windows-site');

    const sites = registry.listSites();
    const entries: SiteListEntry[] = [];
    for (const site of sites) {
      try {
        let health: { status: string; last_cycle_at: string | null; consecutive_failures: number };
        if (site.variant === 'linux-user' || site.variant === 'linux-system') {
          const mode = site.variant === 'linux-system' ? 'system' : 'user';
          const { getSiteHealth } = await import('@narada2/linux-site');
          const h = await getSiteHealth(site.siteId, mode);
          health = { status: h.status, last_cycle_at: h.last_cycle_at, consecutive_failures: h.consecutive_failures };
        } else {
          const status = await getWindowsSiteStatus(site.siteId, site.variant as import('@narada2/windows-site').WindowsSiteVariant);
          health = { status: status.health.status, last_cycle_at: status.health.last_cycle_at, consecutive_failures: status.health.consecutive_failures };
        }
        entries.push({
          siteId: site.siteId,
          variant: site.variant,
          substrate: site.substrate,
          health: health.status,
          lastCycle: health.last_cycle_at,
          failures: health.consecutive_failures,
        });
      } catch {
        entries.push({
          siteId: site.siteId,
          variant: site.variant,
          substrate: site.substrate,
          health: 'unknown',
          lastCycle: null,
          failures: 0,
        });
      }
    }

    // Also discover macOS sites
    try {
      const { discoverMacosSites, getMacosSiteStatus } = await import('@narada2/macos-site');
      const macosSites = discoverMacosSites();
      for (const site of macosSites) {
        // Avoid duplicates
        if (entries.some((e) => e.siteId === site.siteId)) continue;
        try {
          const status = await getMacosSiteStatus(site.siteId);
          entries.push({
            siteId: site.siteId,
            variant: 'macos',
            substrate: 'macos-native',
            health: status.health.status,
            lastCycle: status.health.last_cycle_at,
            failures: status.health.consecutive_failures,
          });
        } catch {
          entries.push({
            siteId: site.siteId,
            variant: 'macos',
            substrate: 'macos-native',
            health: 'unknown',
            lastCycle: null,
            failures: 0,
          });
        }
      }
    } catch {
      // macOS site package not available
    }

    if (fmt.getFormat() === 'human') {
      if (entries.length === 0) {
        fmt.message('No Sites registered. Run `narada sites discover` to scan.', 'info');
      } else {
        fmt.table(
          [
            { key: 'siteId', label: 'Site ID', width: 20 },
            { key: 'variant', label: 'Variant', width: 10 },
            { key: 'substrate', label: 'Substrate', width: 12 },
            { key: 'health', label: 'Health', width: 12 },
            { key: 'lastCycle', label: 'Last Cycle', width: 24 },
            { key: 'failures', label: 'Failures', width: 10 },
          ],
          entries.map((e) => ({
            siteId: e.siteId,
            variant: e.variant,
            substrate: e.substrate,
            health: e.health,
            lastCycle: e.lastCycle ?? 'never',
            failures: String(e.failures),
          })),
        );
      }
    }

    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', sites: entries } };
  } finally {
    registry.close();
  }
}

export async function sitesDiscoverCommand(
  options: SitesOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const discovered: Array<{ siteId: string; variant: string }> = [];

    for (const variant of ['native', 'wsl'] as const) {
      try {
        const sites = registry.discoverSites(variant);
        for (const site of sites) {
          discovered.push({ siteId: site.siteId, variant: site.variant });
        }
      } catch {
        // Skip variants that fail to scan
      }
    }

    // Discover macOS sites
    try {
      const { discoverMacosSites } = await import('@narada2/macos-site');
      const macosSites = discoverMacosSites();
      for (const site of macosSites) {
        if (!discovered.some((d) => d.siteId === site.siteId)) {
          discovered.push({ siteId: site.siteId, variant: 'macos' });
        }
      }
    } catch {
      // macOS site package not available
    }

    // Discover Linux sites
    try {
      const { listAllSites } = await import('@narada2/linux-site');
      const linuxSites = listAllSites();
      for (const site of linuxSites) {
        if (!discovered.some((d) => d.siteId === site.siteId)) {
          const variant = site.mode === 'system' ? 'linux-system' : 'linux-user';
          registry.registerSite({
            siteId: site.siteId,
            variant,
            siteRoot: site.siteRoot,
            substrate: 'linux',
            aimJson: null,
            controlEndpoint: null,
            lastSeenAt: null,
            createdAt: new Date().toISOString(),
          });
          discovered.push({ siteId: site.siteId, variant });
        }
      }
    } catch {
      // Linux site package not available
    }

    if (fmt.getFormat() === 'human') {
      if (discovered.length === 0) {
        fmt.message('No new Sites discovered.', 'info');
      } else {
        fmt.message(`Discovered ${discovered.length} Site(s):`, 'success');
        for (const site of discovered) {
          fmt.message(`  ${site.siteId} (${site.variant})`, 'info');
        }
      }
    }

    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', discovered } };
  } finally {
    registry.close();
  }
}

export async function sitesCreateCommand(
  options: SitesCreateOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const shorthand = buildCreateSiteConfigFromShorthand(options);
  if (!options.config && !shorthand) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'missing_config_or_shorthand',
        message: 'sites create requires --config <path> or --preset <preset> --site-id <id> --root <path>.',
      },
    };
  }
  let config: CreateSiteConfig;
  let configPath: string;
  try {
    if (options.config) {
      configPath = resolve(options.config);
      config = JSON.parse(await readFile(configPath, 'utf8')) as CreateSiteConfig;
    } else {
      configPath = '<inline:create-site-options>';
      config = shorthand!;
    }
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'config_parse_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const plan = buildCreateSiteDryRunPlan(config, configPath);
  if (options.dryRun && options.executeLive) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        ...plan,
        status: 'refused',
        refusals: [
          ...plan.refusals,
          {
            code: 'execute_live_requires_create_execution',
            message: 'Live carriers require create-site execution; remove --dry-run and provide --live-authority-basis.',
          },
        ],
      },
    };
  }
  if (!options.dryRun) {
    const created = await executeMinimalCreateSite(config, plan, configPath);
    if (!options.executeLive || created.exitCode !== ExitCode.SUCCESS) return created;
    return executeCreateSiteLiveCarriers(config, created, options, context);
  }

  if (options.outputPlan) {
    const outputPlanPath = resolve(options.outputPlan);
    plan.evidence.output_plan_path = outputPlanPath;
    plan.planned_files.push({
      path: outputPlanPath,
      purpose: 'explicit dry-run plan artifact',
      mutation: 'output_plan_only',
    });
    await writeFile(outputPlanPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  }

  return {
    exitCode: plan.refusals.length === 0 ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: plan,
  };
}

export async function sitesCreatePresetsCommand(
  _options: SitesOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const presets = CREATE_SITE_SUPPORTED_PRESETS.map((preset) => {
    const packages = packagesForCreateSitePreset(preset);
    const descriptors = expandCreateSitePackageDescriptorsFromPackages(packages);
    return {
      preset,
      template_id: `narada-proper.templates.site.${preset}.v0`,
      exposure_class: preset === 'minimal' ? 'mutating_guarded' : 'descriptor_only',
      package_components: packages.map((pkg) => String(pkg.name)),
      descriptor_components: descriptors.map((descriptor) => ({
        package_name: descriptor.package_name,
        posture: descriptor.posture,
        descriptors: descriptor.descriptors,
        denied_live_effects: descriptor.denied_live_effects,
      })),
      operational_commands: {
        dry_run: `narada sites create --preset ${preset} --site-id <id> --root <path> --dry-run --format json`,
        skeleton: `narada sites create --preset ${preset} --site-id <id> --root <path> --format json`,
        live: ['task-lifecycle', 'agent-memory', 'site-machinery'].includes(preset)
          ? `narada sites create --preset ${preset} --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`
          : null,
      },
      admission_boundary: {
        package_selection_grants_live_capability: false,
        source_state_imported: false,
        live_execution_requires_explicit_authority: true,
      },
    };
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      schema: 'narada.create_site.presets.v0',
      status: 'ok',
      presets,
      non_claims: [
        'source Site import/migration/lift',
        'implicit capability grants',
        'private MCP client config mutation',
        'real Windows profile mutation outside target Site artifacts',
        'PC/operator-surface mutation',
      ],
    },
  };
}

function buildCreateSiteConfigFromShorthand(options: SitesCreateOptions): CreateSiteConfig | null {
  if (!options.preset && !options.siteId && !options.root) return null;
  const preset = options.preset ?? 'minimal';
  if (!options.siteId || !options.root) return {
    schema: 'narada.create_site.options.v0',
    mode: options.dryRun ? 'dry_run' : 'execute',
    preset,
    site: {
      site_id: options.siteId,
      site_kind: options.siteKind ?? 'project',
      authority_locus: options.authorityLocus ?? 'project',
      site_root: options.root,
    },
    packages: packagesForCreateSitePreset(preset),
    identity: emptyCreateSiteIdentity(),
    storage: { intent: 'none' },
    mcp: { intent: 'none', surfaces: [] },
    capabilities: { policy: 'none', required: [], denied: [] },
    inbox: { enable: 'drop_only' },
    task_lifecycle: { enable: false },
    agent_context: { enable: false },
    operator_surface: { intent: 'none' },
    windows_pwsh: { profile: 'emit_example', path_style: 'windows' },
  };
  return createSiteConfigForPreset({
    preset,
    siteId: options.siteId,
    root: options.root,
    siteKind: options.siteKind ?? 'project',
    authorityLocus: options.authorityLocus ?? 'project',
    mode: options.dryRun ? 'dry_run' : 'execute',
  });
}

function createSiteConfigForPreset(input: {
  preset: string;
  siteId: string;
  root: string;
  siteKind: string;
  authorityLocus: string;
  mode: string;
}): CreateSiteConfig {
  const packages = packagesForCreateSitePreset(input.preset);
  const templateComponents = packages.map((pkg) => String(pkg.name));
  const config: CreateSiteConfig = {
    schema: 'narada.create_site.options.v0',
    mode: input.mode,
    preset: input.preset,
    template_catalog: {
      template_id: `narada-proper.templates.site.${input.preset}.v0`,
      template_components: templateComponents,
    },
    site: {
      site_id: input.siteId,
      site_kind: input.siteKind,
      authority_locus: input.authorityLocus,
      site_root: input.root,
      workspace_root: input.root,
      substrate: 'windows-native',
      execution_surface: 'windows_native',
      sync_posture: 'hybrid_capable_plain_folder',
    },
    packages,
    identity: emptyCreateSiteIdentity(),
    storage: { intent: 'none' },
    mcp: { intent: 'none', surfaces: [] },
    capabilities: { policy: 'none', required: [], denied: [] },
    inbox: { enable: 'drop_only' },
    task_lifecycle: { enable: false },
    agent_context: { enable: false },
    operator_surface: { intent: 'none' },
    windows_pwsh: { profile: 'emit_example', path_style: 'windows' },
    evidence: {
      template_refs: [`narada-proper.templates.site.${input.preset}.v0`, ...templateComponents.map((component) => `package:${component}`)],
      refused_imports: [],
    },
  };
  if (input.preset === 'task-lifecycle') {
    config.storage = { intent: 'descriptor_only', driver_preference: 'sqlite3-cli', mutation_mode: 'none' };
    config.mcp = { intent: 'descriptor_only', surfaces: ['site_task_lifecycle'] };
    config.capabilities = { policy: 'declare_required', required: ['task_lifecycle'], denied: ['source_task_db_import'] };
    config.inbox = { enable: 'canonical_envelope_intake' };
    config.task_lifecycle = { enable: 'descriptor_only', package: '@narada2/site-task-lifecycle' };
  } else if (input.preset === 'agent-memory') {
    config.storage = { intent: 'descriptor_only', driver_preference: 'sqlite3-cli', mutation_mode: 'none' };
    config.mcp = { intent: 'descriptor_only', surfaces: ['agent_context_memory'] };
    config.capabilities = { policy: 'declare_required', required: ['agent_context_memory'], denied: ['source_checkpoint_import'] };
    config.agent_context = { enable: 'descriptor_only', package: '@narada2/agent-context-memory' };
  } else if (input.preset === 'site-machinery') {
    config.capabilities = {
      policy: 'declare_required',
      required: ['canonical_inbox', 'site_config_awareness', 'site_lift_adoption'],
      denied: ['source_site_runtime_import', 'cross_site_mutation'],
    };
    config.inbox = { enable: 'canonical_envelope_intake' };
  }
  return config;
}

function packagesForCreateSitePreset(preset: string): Array<Record<string, unknown>> {
  if (preset === 'task-lifecycle') return [{ name: '@narada2/site-task-lifecycle' }];
  if (preset === 'agent-memory') return [{ name: '@narada2/agent-context-memory' }];
  if (preset === 'site-machinery') {
    return [
      { name: '@narada2/site-inbox' },
      { name: '@narada2/site-config' },
      { name: '@narada2/site-lift' },
    ];
  }
  return [];
}

function emptyCreateSiteIdentity(): NonNullable<CreateSiteConfig['identity']> {
  return {
    named_agents: [],
    role_assignments: [],
    role_compatibility_identities: [],
    claimed_identity_evidence: [],
    mechanical_verification_basis: [],
  };
}

async function executeCreateSiteLiveCarriers(
  config: CreateSiteConfig,
  created: { exitCode: ExitCode; result: unknown },
  options: SitesCreateOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.liveAuthorityBasis) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        ...(created.result as Record<string, unknown>),
        status: 'live_carrier_refused',
        live_carriers: [],
        refusals: [{
          code: 'live_authority_basis_required',
          message: 'Live carrier execution requires --live-authority-basis.',
        }],
      },
    };
  }

  const siteRoot = resolve(String(config.site!.site_root));
  const siteId = String(config.site!.site_id);
  const liveCarriers: unknown[] = [];
  const db = await sitesLiveCarrierCommand({
    carrier: 'site_local_db_init',
    mode: 'apply',
    targetSiteRoot: siteRoot,
    siteId,
    authorityBasis: options.liveAuthorityBasis,
    mutationAuthorized: true,
  }, context);
  liveCarriers.push(db.result);
  if (db.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, db.result);

  const storage = await sitesLiveCarrierCommand({
    carrier: 'site_local_storage_hydration',
    mode: 'apply',
    targetSiteRoot: siteRoot,
    siteId,
    authorityBasis: options.liveAuthorityBasis,
    dbInitVerified: true,
    mutationAuthorized: true,
  }, context);
  liveCarriers.push(storage.result);
  if (storage.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, storage.result);

  if (config.agent_context?.enable === 'descriptor_only') {
    const agentContext = await sitesLiveCarrierCommand({
      carrier: 'agent_context_memory_local_storage',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId,
      authorityBasis: options.liveAuthorityBasis,
      dbVerified: true,
      storageVerified: true,
      mutationAuthorized: true,
    }, context);
    liveCarriers.push(agentContext.result);
    if (agentContext.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, agentContext.result);
  }
  if (config.packages?.some((pkg) => String(pkg.name) === '@narada2/site-inbox')) {
    const siteInbox = await sitesLiveCarrierCommand({
      carrier: 'site_inbox_local_substrate',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId,
      authorityBasis: options.liveAuthorityBasis,
      dbVerified: true,
      storageVerified: true,
      mutationAuthorized: true,
    }, context);
    liveCarriers.push(siteInbox.result);
    if (siteInbox.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, siteInbox.result);
  }
  if (config.packages?.some((pkg) => String(pkg.name) === '@narada2/site-config')) {
    const siteConfig = await sitesLiveCarrierCommand({
      carrier: 'site_config_local_registry',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId,
      authorityBasis: options.liveAuthorityBasis,
      dbVerified: true,
      storageVerified: true,
      mutationAuthorized: true,
    }, context);
    liveCarriers.push(siteConfig.result);
    if (siteConfig.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, siteConfig.result);
  }
  if (config.packages?.some((pkg) => String(pkg.name) === '@narada2/site-lift')) {
    const siteLift = await sitesLiveCarrierCommand({
      carrier: 'site_lift_local_adoption',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId,
      authorityBasis: options.liveAuthorityBasis,
      dbVerified: true,
      storageVerified: true,
      mutationAuthorized: true,
    }, context);
    liveCarriers.push(siteLift.result);
    if (siteLift.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, siteLift.result);
  }

  const mcpSurfaces = arrayField(config.mcp?.surfaces).map(String);
  let mcpApplied = false;
  if (mcpSurfaces.length > 0 || config.mcp?.intent === 'descriptor_only') {
    const mcp = await sitesLiveCarrierCommand({
      carrier: 'site_mcp_registration_transport',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId,
      authorityBasis: options.liveAuthorityBasis,
      dbVerified: true,
      storageVerified: true,
      runtimeTarget: 'codex',
      mcpServerJson: JSON.stringify(mcpSurfaces.map((surface) => ({
        name: surface,
        transport: 'stdio',
        command: 'narada-mcp',
        args: ['--site-root', siteRoot, '--surface', surface],
      }))),
      mutationAuthorized: true,
    }, context);
    liveCarriers.push(mcp.result);
    if (mcp.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, mcp.result);
    mcpApplied = true;
  }

  if (config.windows_pwsh?.profile && config.windows_pwsh.profile !== 'none') {
    const profile = await sitesLiveCarrierCommand({
      carrier: 'windows_profile_site_binding',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId,
      authorityBasis: options.liveAuthorityBasis,
      mcpRegistrationVerified: mcpApplied,
      profileCanPrecedeMcpRegistration: !mcpApplied,
      mutationAuthorized: true,
    }, context);
    liveCarriers.push(profile.result);
    if (profile.exitCode !== ExitCode.SUCCESS) return createLiveCarrierFailure(created, liveCarriers, profile.result);
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      ...(created.result as Record<string, unknown>),
      status: 'created_live_carriers_applied',
      live_carriers: liveCarriers,
      evidence: {
        ...((created.result as { evidence?: Record<string, unknown> }).evidence ?? {}),
        live_carrier_execution_completed: true,
        source_state_imported: false,
      },
      non_claims: [
        ...(((created.result as { non_claims?: string[] }).non_claims ?? [])
          .filter((claim) => ![
            'DB init execution',
            'MCP registration execution',
            'runtime hydration execution',
          ].includes(claim))),
        'private MCP client config mutation',
        'real Windows profile mutation outside the target Site',
      ],
    },
  };
}

function createLiveCarrierFailure(
  created: { exitCode: ExitCode; result: unknown },
  liveCarriers: unknown[],
  failedCarrier: unknown,
): { exitCode: ExitCode; result: unknown } {
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: {
      ...(created.result as Record<string, unknown>),
      status: 'live_carrier_refused',
      live_carriers: liveCarriers,
      failed_carrier: failedCarrier,
      recovery_hint: 'Inspect live_carriers results and rerun the refused carrier after resolving its gate.',
    },
  };
}

export async function sitesLiveCarrierCommand(
  options: SitesLiveCarrierOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const missing = [
    ['carrier', options.carrier],
    ['target_site_root', options.targetSiteRoot],
    ['site_id', options.siteId],
    ['authority_basis', options.authorityBasis],
  ].filter(([, value]) => typeof value !== 'string' || value.length === 0);
  if (missing.length > 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        schema: 'narada.site_live_carrier.result.v0',
        status: 'refused',
        refusals: missing.map(([key]) => `${key}_required`),
      },
    };
  }

  const args = buildLiveCarrierArgs(options);
  try {
    const { stdout } = await execFileAsync(process.execPath, [siteLiveCarrierToolPath(), ...args], {
      maxBuffer: 1024 * 1024,
    });
    const result = JSON.parse(stdout) as { status?: string };
    return {
      exitCode: result.status === 'refused' ? ExitCode.INVALID_CONFIG : ExitCode.SUCCESS,
      result,
    };
  } catch (error) {
    const stdout = typeof (error as { stdout?: unknown }).stdout === 'string'
      ? (error as { stdout: string }).stdout
      : '';
    const stderr = typeof (error as { stderr?: unknown }).stderr === 'string'
      ? (error as { stderr: string }).stderr
      : '';
    const parsed = parseLiveCarrierOutput(stdout) ?? parseLiveCarrierOutput(stderr);
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: parsed ?? {
        schema: 'narada.site_live_carrier.result.v0',
        status: 'refused',
        refusals: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

function siteLiveCarrierToolPath(): string {
  return fileURLToPath(new URL('../../../../../tools/site-init/site-live-carriers.mjs', import.meta.url));
}

function buildLiveCarrierArgs(options: SitesLiveCarrierOptions): string[] {
  const args = [
    '--carrier', String(options.carrier),
    '--mode', options.mode ?? 'plan',
    '--target-site-root', String(options.targetSiteRoot),
    '--site-id', String(options.siteId),
    '--authority-basis', String(options.authorityBasis),
  ];
  appendOptionalArg(args, '--source-site-root', options.sourceSiteRoot);
  appendOptionalArg(args, '--runtime-target', options.runtimeTarget);
  appendOptionalArg(args, '--mcp-server-json', options.mcpServerJson);
  appendOptionalArg(args, '--profile-artifact-path', options.profileArtifactPath);
  appendOptionalArg(args, '--profile-target', options.profileTarget);
  appendFlag(args, '--db-verified', options.dbVerified);
  appendFlag(args, '--storage-verified', options.storageVerified);
  appendFlag(args, '--db-init-verified', options.dbInitVerified);
  appendFlag(args, '--mcp-registration-verified', options.mcpRegistrationVerified);
  appendFlag(args, '--profile-can-precede-mcp-registration', options.profileCanPrecedeMcpRegistration);
  appendFlag(args, '--mutation-authorized', options.mutationAuthorized);
  appendFlag(args, '--handoff-as-checkpoint-truth', options.handoffAsCheckpointTruth);
  appendFlag(args, '--import-source-runtime-state', options.importSourceRuntimeState);
  appendFlag(args, '--include-secrets', options.includeSecrets);
  appendFlag(args, '--register-mcp', options.registerMcp);
  return args;
}

function appendOptionalArg(args: string[], flag: string, value: string | undefined): void {
  if (value) args.push(flag, value);
}

function appendFlag(args: string[], flag: string, value: boolean | undefined): void {
  if (value) args.push(flag);
}

function parseLiveCarrierOutput(output: string): unknown | null {
  if (!output.trim()) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function buildCreateSiteDryRunPlan(config: CreateSiteConfig, configPath: string): Record<string, any> {
  const refusals: CreateSiteRefusal[] = [];
  const warnings: CreateSiteWarning[] = [];
  const preset = config.preset ?? 'minimal';
  const packageDescriptors = expandCreateSitePackageDescriptors(config);

  if (config.schema !== 'narada.create_site.options.v0') {
    refusals.push({
      code: 'invalid_config_schema',
      message: 'Expected schema narada.create_site.options.v0.',
      evidence: config.schema,
    });
  }
  if (!isCreateSiteSupportedPreset(preset)) {
    refusals.push({
      code: preset === 'full-operator-surface-aware-user-site'
        ? 'preset_requires_unadmitted_operator_surface'
        : 'unsupported_preset',
      message: preset === 'full-operator-surface-aware-user-site'
        ? 'The full operator-surface-aware preset is fixture-only in this first implementation slice.'
        : `Unsupported descriptor-only preset: ${preset}`,
      evidence: preset,
    });
  }
  for (const required of ['site_id', 'site_kind', 'authority_locus', 'site_root']) {
    if (!config.site?.[required as keyof NonNullable<CreateSiteConfig['site']>]) {
      refusals.push({ code: 'missing_site_coordinate', message: `Missing site.${required}.` });
    }
  }

  refusals.push(...findCreateSiteDeniedInputRefs(config));
  refusals.push(...findCreateSiteLiveCapabilityRefusals(config));
  refusals.push(...findCreateSiteIdentityRefusals(config));
  for (const descriptor of packageDescriptors) {
    if (descriptor.posture === 'unknown_package_refused') {
      refusals.push({
        code: 'unknown_package_refused',
        message: 'Only Narada proper create-site template components can be expanded by this dry-run command.',
        evidence: descriptor.package_name,
      });
    }
  }

  if ((config.operator_surface?.pc_locus_required as boolean | undefined) === true) {
    refusals.push({
      code: 'pc_locus_authority_missing',
      message: 'create site does not assume PC-locus authority; PC setup requires separate admission.',
    });
  }
  if (packageDescriptors.some((descriptor) => descriptor.package_name === '@narada2/site-task-lifecycle')
    && config.task_lifecycle?.enable !== 'descriptor_only') {
    warnings.push({
      code: 'task_lifecycle_package_selected_without_descriptor_enablement',
      message: 'The site-task-lifecycle package contributes descriptors only in this slice.',
    });
  }
  if (packageDescriptors.some((descriptor) => descriptor.package_name === '@narada2/agent-context-memory')
    && config.agent_context?.enable !== 'descriptor_only') {
    warnings.push({
      code: 'agent_context_package_selected_without_descriptor_enablement',
      message: 'The agent-context-memory package contributes descriptors only in this slice.',
    });
  }

  const selectedTemplate = selectCreateSiteTemplate(preset, config.template_catalog, packageDescriptors);
  const requiredLocalAdmissions = buildCreateSiteRequiredAdmissions(config, packageDescriptors);
  const plannedFiles = buildCreateSitePlannedFiles(config, packageDescriptors);

  return {
    schema: 'narada.create_site.dry_run_plan.v0',
    status: refusals.length === 0 ? 'planned' : 'refused',
    command: 'narada sites create',
    mode: 'dry_run',
    config_path: configPath,
    selected_preset: preset,
    selected_template: selectedTemplate,
    site: config.site ?? {},
    package_descriptors: packageDescriptors,
    required_local_admissions: requiredLocalAdmissions,
    planned_files: plannedFiles,
    refusals: dedupeRefusals(refusals),
    warnings,
    evidence: {
      template_refs: arrayField(config.evidence?.template_refs),
      source_refs_rejected_as_normal_inputs: arrayField(config.evidence?.invalid_source_site_inputs),
      dry_run_only: true,
      package_selection_grants_live_capability: false,
      source_state_imported: false,
    },
    non_claims: [
      'filesystem Site creation',
      'local adapter admission',
      'DB init execution',
      'MCP registration execution',
      'runtime hydration execution',
      'capability or secret grants',
      'operator-surface or PC-locus runtime mutation',
      'migration/lift/import from existing Sites',
    ],
  };
}

function expandCreateSitePackageDescriptors(config: CreateSiteConfig): CreateSitePackageDescriptor[] {
  return expandCreateSitePackageDescriptorsFromPackages(config.packages);
}

function findCreateSiteDeniedInputRefs(value: unknown): CreateSiteRefusal[] {
  const strings = collectStrings(value);
  const refusals: CreateSiteRefusal[] = [];
  for (const candidate of strings) {
    const comparable = candidate.replaceAll('/', '\\');
    const denied = CREATE_SITE_SOURCE_STATE_PATTERNS.find(({ pattern }) => pattern.test(comparable));
    if (denied) {
      refusals.push({
        code: denied.code,
        message: `${denied.reason} is not a valid create-site input; use a separate migration/lift/import path.`,
        path: candidate,
      });
    }
  }
  return dedupeRefusals(refusals);
}

function findCreateSiteLiveCapabilityRefusals(config: CreateSiteConfig): CreateSiteRefusal[] {
  const refusals: CreateSiteRefusal[] = [];
  if (config.storage?.intent === 'local_adapter_admitted' || config.storage?.mutation_mode === 'execute_with_admitted_adapter') {
    refusals.push({
      code: 'live_adapter_admission_missing',
      message: 'create-site dry-run cannot admit or execute a storage adapter.',
    });
  }
  if (config.mcp?.intent === 'local_registration_admitted') {
    refusals.push({
      code: 'live_mcp_registration_admission_missing',
      message: 'create-site dry-run cannot perform live MCP registration.',
    });
  }
  if (config.agent_context?.enable === 'local_adapter_admitted' || config.agent_context?.checkpoint_policy === 'local_persistence_admitted') {
    refusals.push({
      code: 'runtime_hydration_admission_missing',
      message: 'agent-context persistence or hydration requires separate local admission.',
    });
  }
  if (config.capabilities?.policy === 'admit_local') {
    refusals.push({
      code: 'package_selection_does_not_grant_live_capability',
      message: 'Capability grants require separate admission; package/template selection is descriptor-only.',
    });
  }
  if (config.windows_pwsh?.profile === 'admit_profile_write') {
    refusals.push({
      code: 'live_profile_write_admission_missing',
      message: 'Windows PowerShell profile writes require separate local admission and --execute posture.',
    });
  }
  return refusals;
}

function findCreateSiteIdentityRefusals(config: CreateSiteConfig): CreateSiteRefusal[] {
  const identity = config.identity;
  if (!identity) return [];
  const refusals: CreateSiteRefusal[] = [];
  const mechanicalBasis = identity.mechanical_verification_basis ?? [];
  if (((identity.named_agents ?? []).length > 0 || (identity.role_compatibility_identities ?? []).length > 0)
    && mechanicalBasis.length === 0) {
    refusals.push({
      code: 'mechanical_verification_basis_missing',
      message: 'Named agent or role compatibility options require explicit mechanical verification basis.',
    });
  }
  for (const compatibility of identity.role_compatibility_identities ?? []) {
    if (!compatibility.admission_ref) {
      refusals.push({
        code: 'role_compatibility_admission_missing',
        message: 'Role-name compatibility identities require an explicit admission ref.',
        evidence: compatibility,
      });
    }
  }
  for (const claim of identity.claimed_identity_evidence ?? []) {
    if (claim.authority === true) {
      refusals.push({
        code: 'claimed_identity_not_authority',
        message: 'Claimed identity is data, not authority.',
        evidence: claim,
      });
    }
  }
  return refusals;
}

function buildCreateSiteRequiredAdmissions(
  config: CreateSiteConfig,
  packageDescriptors: CreateSitePackageDescriptor[],
): Array<Record<string, unknown>> {
  const admissions: Array<Record<string, unknown>> = [
    { admission: 'filesystem_creation', status: 'not_admitted_in_dry_run' },
  ];
  if (config.storage?.intent && config.storage.intent !== 'none') {
    admissions.push({ admission: 'local_storage_adapter', status: 'separate_admission_required' });
  }
  if (config.task_lifecycle?.enable) {
    admissions.push({ admission: 'task_lifecycle_db_init_and_mutation', status: 'separate_admission_required' });
  }
  if (config.agent_context?.enable) {
    admissions.push({ admission: 'agent_context_storage_and_hydration', status: 'separate_admission_required' });
  }
  if (config.mcp?.intent && config.mcp.intent !== 'none') {
    admissions.push({ admission: 'live_mcp_registration', status: 'separate_admission_required' });
  }
  if (packageDescriptors.some((descriptor) => descriptor.package_name === '@narada2/site-inbox')) {
    admissions.push({ admission: 'site_inbox_local_substrate_and_publication', status: 'separate_admission_required' });
  }
  if (packageDescriptors.some((descriptor) => descriptor.package_name === '@narada2/site-config')) {
    admissions.push({ admission: 'site_config_registry_probe_execution', status: 'separate_admission_required' });
  }
  if (packageDescriptors.some((descriptor) => descriptor.package_name === '@narada2/site-lift')) {
    admissions.push({ admission: 'site_lift_adoption_materialization', status: 'separate_admission_required' });
  }
  if (packageDescriptors.length > 0) {
    admissions.push({ admission: 'package_descriptor_selection', status: 'included_in_dry_run' });
  }
  return admissions;
}

function buildCreateSitePlannedFiles(
  config: CreateSiteConfig,
  packageDescriptors: CreateSitePackageDescriptor[] = [],
): Array<Record<string, unknown>> {
  const siteRoot = config.site?.site_root ?? '<site-root>';
  const files: Array<Record<string, unknown>> = [
    { path: `${siteRoot}\\config.json`, purpose: 'Compatibility projection of Site governance coordinates; .narada/site.json is authority seed', mutation: 'planned_only_projection' },
    { path: `${siteRoot}\\AGENTS.md`, purpose: 'Site-local agent execution contract', mutation: 'planned_only' },
    { path: `${siteRoot}\\.narada\\site.json`, purpose: 'Site authority seed coordinates', mutation: 'planned_only' },
    { path: `${siteRoot}\\.narada\\lineage\\events\\site-created.json`, purpose: 'Append-only Site origin/build lineage event', mutation: 'planned_only' },
    { path: `${siteRoot}\\.narada\\README.md`, purpose: 'Site-local Narada substrate orientation', mutation: 'planned_only' },
    { path: `${siteRoot}\\.narada\\admission\\admission-ledger.jsonl`, purpose: 'Site-local admission ledger', mutation: 'planned_only' },
    { path: `${siteRoot}\\.narada\\inbox\\README.md`, purpose: 'Site-local intake placeholder', mutation: 'planned_only' },
  ];
  if (config.task_lifecycle?.enable) {
    files.push({ path: `${siteRoot}\\.ai\\site-task-lifecycle-admission.json`, purpose: 'Task lifecycle local admission manifest', mutation: 'requires_separate_admission' });
  }
  if (config.agent_context?.enable) {
    files.push({ path: `${siteRoot}\\.ai\\agent-context-memory-admission.json`, purpose: 'Agent context local admission manifest', mutation: 'requires_separate_admission' });
  }
  for (const descriptor of packageDescriptors.filter((entry) => entry.posture === 'descriptor_only')) {
    const safeName = descriptor.package_name.replace('@narada2/', '').replace(/[^a-z0-9_.-]/gi, '-');
    files.push({
      path: `${siteRoot}\\.narada\\admission\\package-slices\\${safeName}.json`,
      purpose: `${descriptor.package_name} descriptor package slice`,
      mutation: 'descriptor_materialization_only',
    });
  }
  return files;
}

async function executeMinimalCreateSite(
  config: CreateSiteConfig,
  dryRunPlan: Record<string, any>,
  configPath: string,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const executionRefusals = [
    ...dryRunPlan.refusals,
    ...findCreateSiteExecutionRefusals(config, dryRunPlan.package_descriptors ?? []),
  ];
  if (executionRefusals.length > 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        ...dryRunPlan,
        schema: 'narada.create_site.execution_result.v0',
        status: 'refused',
        mode: 'execute',
        refusals: dedupeRefusals(executionRefusals),
        evidence: {
          ...dryRunPlan.evidence,
          dry_run_only: false,
          filesystem_creation_attempted: false,
          source_state_imported: false,
        },
        non_claims: executionNonClaims(),
      },
    };
  }

  const siteRoot = resolve(String(config.site!.site_root));
  const plannedWrites = minimalCreateSiteWrites(
    config,
    siteRoot,
    configPath,
    dryRunPlan.package_descriptors ?? [],
  );
  const collision = await findCreateSiteCollision(siteRoot, plannedWrites.map((write) => write.path));
  if (collision) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        ...dryRunPlan,
        schema: 'narada.create_site.execution_result.v0',
        status: 'refused',
        mode: 'execute',
        refusals: [{
          code: 'create_site_collision_refused',
          message: 'Minimal create-site execution refuses to write into a non-empty Site root or overwrite existing files.',
          path: collision,
        }],
        evidence: {
          ...dryRunPlan.evidence,
          dry_run_only: false,
          filesystem_creation_attempted: false,
          source_state_imported: false,
        },
        non_claims: executionNonClaims(),
      },
    };
  }

  for (const write of plannedWrites) {
    await mkdir(write.dir, { recursive: true });
    await writeFile(write.path, write.content, { encoding: 'utf8', flag: 'wx' });
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      schema: 'narada.create_site.execution_result.v0',
      status: 'created',
      command: 'narada sites create',
      mode: 'execute',
      config_path: configPath,
      selected_preset: config.preset ?? 'minimal',
      selected_template: dryRunPlan.selected_template,
      site: {
        ...config.site,
        site_root: siteRoot,
      },
      created_files: plannedWrites.map((write) => ({
        path: write.path,
        purpose: write.purpose,
      })),
      refusals: [],
      warnings: dryRunPlan.warnings,
      evidence: {
        template_refs: arrayField(config.evidence?.template_refs),
        filesystem_creation_attempted: true,
        filesystem_creation_completed: true,
        lineage_event_refs: plannedWrites
          .filter((write) => write.purpose === 'Append-only Site origin/build lineage event')
          .map((write) => `path:${write.path}`),
        package_selection_grants_live_capability: false,
        source_state_imported: false,
      },
      non_claims: executionNonClaims(),
    },
  };
}

function findCreateSiteExecutionRefusals(
  config: CreateSiteConfig,
  packageDescriptors: CreateSitePackageDescriptor[],
): CreateSiteRefusal[] {
  const refusals: CreateSiteRefusal[] = [];
  if (packageDescriptors.some((descriptor) => descriptor.posture === 'unknown_package_refused')) {
    refusals.push({
      code: 'unknown_package_refused',
      message: 'Unknown packages cannot be materialized as create-site descriptor artifacts.',
    });
  }
  if (config.storage?.intent && !['none', 'descriptor_only'].includes(String(config.storage.intent))) {
    refusals.push({
      code: 'storage_execution_not_admitted',
      message: 'Storage adapter setup is not admitted in create-site descriptor materialization.',
    });
  }
  if (config.mcp?.intent && !['none', 'descriptor_only'].includes(String(config.mcp.intent))) {
    refusals.push({
      code: 'mcp_execution_not_admitted',
      message: 'Live MCP registration is not admitted in create-site descriptor materialization.',
    });
  }
  if (config.task_lifecycle?.enable && ![false, 'descriptor_only'].includes(config.task_lifecycle.enable as false | string)) {
    refusals.push({
      code: 'task_lifecycle_execution_not_admitted',
      message: 'Task lifecycle live setup is a separate admission after descriptor materialization.',
    });
  }
  if (config.agent_context?.enable && ![false, 'descriptor_only'].includes(config.agent_context.enable as false | string)) {
    refusals.push({
      code: 'agent_context_execution_not_admitted',
      message: 'Agent context memory live setup is a separate admission after descriptor materialization.',
    });
  }
  if (config.capabilities?.policy && !['none', 'declare_required'].includes(String(config.capabilities.policy))) {
    refusals.push({
      code: 'capability_grant_execution_not_admitted',
      message: 'Capability grants are not admitted in create-site descriptor materialization.',
    });
  }
  if (config.operator_surface?.intent && !['none', 'declare_relation'].includes(String(config.operator_surface.intent))) {
    refusals.push({
      code: 'operator_surface_execution_not_admitted',
      message: 'Operator-surface runtime setup is not admitted in create-site descriptor materialization.',
    });
  }
  if (config.windows_pwsh?.profile && !['emit_example', 'none'].includes(String(config.windows_pwsh.profile))) {
    refusals.push({
      code: 'windows_profile_execution_not_admitted',
      message: 'Windows PowerShell profile mutation is not admitted in minimal Site skeleton creation.',
    });
  }
  return refusals;
}

async function findCreateSiteCollision(siteRoot: string, plannedFiles: string[]): Promise<string | null> {
  if (existsSync(siteRoot)) {
    const entries = await readdir(siteRoot);
    if (entries.length > 0) {
      return siteRoot;
    }
  }
  return plannedFiles.find((path) => existsSync(path)) ?? null;
}

function minimalCreateSiteWrites(
  config: CreateSiteConfig,
  siteRoot: string,
  configPath: string,
  packageDescriptors: CreateSitePackageDescriptor[],
): Array<{ path: string; dir: string; purpose: string; content: string }> {
  const siteId = String(config.site!.site_id);
  const siteKind = String(config.site!.site_kind);
  const authorityLocus = String(config.site!.authority_locus);
  const createdAt = new Date().toISOString();
  const templateId = config.template_catalog?.template_id ?? 'narada-proper.templates.site.minimal.v0';
  const lineageEventId = `site-created-${randomUUID()}`;
  const lineageEventRelativePath = join('.narada', 'lineage', 'events', `${lineageEventId}.json`);
  const lineageEventRef = `lineage:${lineageEventId}`;
  const siteJson = {
    schema: 'narada.site.seed.v0',
    site_id: siteId,
    site_name: siteId,
    locus: authorityLocus,
    site_kind: siteKind,
    repo_root: siteRoot,
    site_root: join(siteRoot, '.narada'),
    seed_state: 'greenfield_minimal_site_created',
    created_from: {
      kind: 'narada_proper_template_catalog',
      template_id: templateId,
      config_path: configPath,
    },
    origin: {
      lineage_event_ref: lineageEventRef,
      lineage_event_path: lineageEventRelativePath,
    },
    admission_state: {
      seed_decision: 'admit_minimal_greenfield_site_skeleton',
      runtime_state_imported: false,
      package_selection_grants_live_capability: false,
    },
  };
  const governanceConfig = {
    schema: 'narada.create_site.materialized_config.v0',
    projection_posture: 'compatibility_projection',
    authority_source: '.narada/site.json',
    authority_effect: 'derived_from_site_seed_not_authority_seed',
    created_at: createdAt,
    site: {
      ...config.site,
      site_root: siteRoot,
    },
    preset: config.preset ?? 'minimal',
    template_catalog: config.template_catalog ?? {
      template_id: templateId,
      template_components: [],
    },
    origin: {
      lineage_event_ref: lineageEventRef,
      lineage_event_path: lineageEventRelativePath,
    },
    non_claims: executionNonClaims(),
  };
  const lineageEvent = {
    schema: 'narada.site.lineage.event.v0',
    event_id: lineageEventId,
    event_type: 'site.created',
    edge_type: 'origin',
    source_site_ref: 'narada-proper:template-catalog',
    target_site_ref: siteId,
    builder_site_ref: 'narada-proper',
    built_site_ref: siteId,
    build_method: 'narada sites create',
    authority_effect: 'establishes_site_authority',
    authority_basis: 'admit_minimal_greenfield_site_skeleton',
    operator_principal: null,
    agent_principal: 'narada sites create',
    builder_runtime: {
      command: 'narada sites create',
      execution_surface: config.site?.execution_surface ?? null,
      substrate: config.site?.substrate ?? null,
    },
    source_material: {
      kind: 'narada_proper_template_catalog',
      template_id: templateId,
      config_path: configPath,
      package_descriptors: packageDescriptors.map((descriptor) => descriptor.package_name),
    },
    evidence_refs: arrayField(config.evidence?.template_refs),
    residuals: [],
    occurred_at: createdAt,
    rollback_or_residual_posture: 'delete_greenfield_site_root_before_use_or_record_site.archived_after_use',
    source_state_imported: false,
    authority_transferred: false,
  };
  const ledgerEvent = {
    schema: 'narada.admission.event.v0',
    event: 'seed_created',
    site_id: siteId,
    decision: 'admit_minimal_greenfield_site_skeleton',
    source: 'narada sites create',
    template_ref: templateId,
    lineage_event_ref: lineageEventRef,
    source_state_imported: false,
    recorded_at: createdAt,
  };
  const writes: Array<{ path: string; dir: string; purpose: string; content: string }> = [
    {
      path: join(siteRoot, 'config.json'),
      dir: siteRoot,
      purpose: 'Compatibility projection of Site governance coordinates',
      content: `${JSON.stringify(governanceConfig, null, 2)}\n`,
    },
    {
      path: join(siteRoot, 'AGENTS.md'),
      dir: siteRoot,
      purpose: 'Site-local agent execution contract',
      content: renderMinimalSiteAgentsMd(siteId, siteKind, authorityLocus),
    },
    {
      path: join(siteRoot, '.narada', 'site.json'),
      dir: join(siteRoot, '.narada'),
      purpose: 'Site authority seed coordinates',
      content: `${JSON.stringify(siteJson, null, 2)}\n`,
    },
    {
      path: join(siteRoot, '.narada', 'lineage', 'events', `${lineageEventId}.json`),
      dir: join(siteRoot, '.narada', 'lineage', 'events'),
      purpose: 'Append-only Site origin/build lineage event',
      content: `${JSON.stringify(lineageEvent, null, 2)}\n`,
    },
    {
      path: join(siteRoot, '.narada', 'README.md'),
      dir: join(siteRoot, '.narada'),
      purpose: 'Site-local Narada substrate orientation',
      content: renderMinimalNaradaReadme(siteId),
    },
    {
      path: join(siteRoot, '.narada', 'admission', 'admission-ledger.jsonl'),
      dir: join(siteRoot, '.narada', 'admission'),
      purpose: 'Site-local admission ledger',
      content: `${JSON.stringify(ledgerEvent)}\n`,
    },
    {
      path: join(siteRoot, '.narada', 'inbox', 'README.md'),
      dir: join(siteRoot, '.narada', 'inbox'),
      purpose: 'Site-local intake placeholder',
      content: renderMinimalInboxReadme(siteId),
    },
  ];
  for (const descriptor of packageDescriptors.filter((entry) => entry.posture === 'descriptor_only')) {
    const safeName = descriptor.package_name.replace('@narada2/', '').replace(/[^a-z0-9_.-]/gi, '-');
    writes.push({
      path: join(siteRoot, '.narada', 'admission', 'package-slices', `${safeName}.json`),
      dir: join(siteRoot, '.narada', 'admission', 'package-slices'),
      purpose: `${descriptor.package_name} descriptor admission artifact`,
      content: `${JSON.stringify({
        schema: 'narada.create_site.package_slice_admission.v0',
        site_id: siteId,
        package_name: descriptor.package_name,
        posture: descriptor.posture,
        template_component: descriptor.template_component,
        descriptors: descriptor.descriptors,
        denied_live_effects: descriptor.denied_live_effects,
        live_execution_admitted: false,
        source_state_imported: false,
        created_from: {
          kind: 'narada_proper_template_catalog',
          config_path: configPath,
        },
      }, null, 2)}\n`,
    });
  }
  const mcpSurfaces = arrayField(config.mcp?.surfaces);
  if (config.mcp?.intent === 'descriptor_only' && mcpSurfaces.length > 0) {
    for (const surface of mcpSurfaces) {
      const surfaceName = String(surface);
      writes.push({
        path: join(siteRoot, '.narada', 'mcp', 'descriptors', `${surfaceName}.json`),
        dir: join(siteRoot, '.narada', 'mcp', 'descriptors'),
        purpose: `${surfaceName} MCP descriptor`,
        content: `${JSON.stringify({
          schema: 'narada.create_site.mcp_descriptor.v0',
          site_id: siteId,
          surface: surfaceName,
          intent: 'descriptor_only',
          live_registration_admitted: false,
          source_state_imported: false,
        }, null, 2)}\n`,
      });
    }
  }
  if (config.capabilities?.policy === 'declare_required') {
    writes.push({
      path: join(siteRoot, '.narada', 'capabilities', 'capability-policy.json'),
      dir: join(siteRoot, '.narada', 'capabilities'),
      purpose: 'Descriptor-only capability policy declaration',
      content: `${JSON.stringify({
        schema: 'narada.create_site.capability_policy.v0',
        site_id: siteId,
        policy: 'declare_required',
        required: arrayField(config.capabilities.required),
        denied: arrayField(config.capabilities.denied),
        live_grants_admitted: false,
        source_state_imported: false,
      }, null, 2)}\n`,
    });
  }
  return writes;
}

function renderMinimalSiteAgentsMd(siteId: string, siteKind: string, authorityLocus: string): string {
  return `# AGENTS.md - ${siteId}

This is a greenfield Narada Site created from the Narada proper template catalog.

Site coordinates:
- site_id: ${siteId}
- site_kind: ${siteKind}
- authority_locus: ${authorityLocus}

Local rules:
- Treat this Site root as the mutation locus only after local authority admission.
- Do not import runtime state, databases, task history, inbox history, checkpoint history, rosters, operator-surface runtime, PC state, secrets, or credentials from another Site.
- Package selections provide contracts/descriptors only until local adapter, DB, MCP, hydration, and capability-grant executions are separately admitted.
- Claimed identity is data, not authority; mechanical verification basis must be explicit before role compatibility is admitted.
`;
}

function renderMinimalNaradaReadme(siteId: string): string {
  return `# ${siteId} Narada Site

This directory is the minimal Narada substrate for this greenfield Site.

Created capabilities:
- Site seed coordinates
- Admission ledger
- Manual inbox placeholder

Not created:
- local databases
- MCP registrations
- runtime hydration
- capability grants
- operator-surface or PC-locus bindings
`;
}

function renderMinimalInboxReadme(siteId: string): string {
  return `# ${siteId} Inbox

This is a placeholder for future Site-local intake.

Incoming material is pending evidence until this Site admits, defers, or rejects it locally. Do not treat copied packets or references from another Site as local truth.
`;
}

function executionNonClaims(): string[] {
  return [
    'local adapter admission',
    'DB init execution',
    'DB mutation',
    'MCP registration execution',
    'runtime hydration execution',
    'capability or credential grants',
    'operator-surface or PC-locus runtime mutation',
    'package slice live execution',
    'migration/lift/import from existing Sites',
  ];
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectStrings(entry));
  }
  return [];
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dedupeRefusals(refusals: CreateSiteRefusal[]): CreateSiteRefusal[] {
  const seen = new Set<string>();
  return refusals.filter((refusal) => {
    const key = `${refusal.code}\n${refusal.path ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function sitesTaskLifecycleInitCommand(
  options: SitesTaskLifecycleInitOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  if (!options.site) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: '--site is required' },
    };
  }

  const sitePath = resolve(options.site);
  const aiPath = join(sitePath, '.ai');
  const dbPath = join(aiPath, 'task-lifecycle.db');
  const existed = existsSync(dbPath);

  if (!options.dryRun) {
    await mkdir(aiPath, { recursive: true });
    const store = openTaskLifecycleStore(sitePath);
    try {
      const rows = store.db
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all() as Array<{ name: string }>;
      const tableNames = rows.map((row) => row.name);
      const result = {
        status: 'success',
        site_path: sitePath,
        db_path: dbPath,
        created: !existed,
        tables_initialized: tableNames,
      };
      if (fmt.getFormat() === 'human') {
        fmt.message(`Task lifecycle initialized: ${dbPath}`, 'success');
        fmt.kv('Site', sitePath);
        fmt.kv('Created', String(!existed));
        fmt.kv('Tables', String(tableNames.length));
      }
      return { exitCode: ExitCode.SUCCESS, result };
    } finally {
      store.db.close();
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'dry_run',
      site_path: sitePath,
      db_path: dbPath,
      created: !existed,
      tables_initialized: [],
    },
  };
}

export async function sitesAgentBootstrapCommand(
  siteIdOrRoot: string,
  options: SitesAgentBootstrapOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const role = normalizeBootstrapRole(options.role);
  if (!role) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: `Unsupported agent role: "${options.role ?? ''}"`,
        allowed_roles: ['architect', 'builder', 'observer'],
        mutation_performed: false,
      },
    };
  }

  try {
    const resolvedSite = await resolveSiteRootForBootstrap(siteIdOrRoot);
    const agentsText = await readFile(resolvedSite.agentsPath, 'utf8');
    let config: Record<string, unknown> | null = null;
    if (existsSync(resolvedSite.configPath)) {
      const rawConfig = await readFile(resolvedSite.configPath, 'utf8');
      config = JSON.parse(rawConfig) as Record<string, unknown>;
    }

    const sectionTitle = bootstrapSectionTitle(role);
    const bootstrapText = extractMarkdownSection(agentsText, sectionTitle);
    if (!bootstrapText) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `AGENTS.md does not contain section: ${sectionTitle}`,
          role,
          site_root: resolvedSite.siteRoot,
          agents_path: resolvedSite.agentsPath,
          mutation_performed: false,
        },
      };
    }

    const configSiteId = typeof config?.site_id === 'string' ? config.site_id : null;
    const result = {
      status: 'success',
      mutation_performed: false,
      role,
      site_id: resolvedSite.siteId ?? configSiteId,
      site_root: resolvedSite.siteRoot,
      config_path: existsSync(resolvedSite.configPath) ? resolvedSite.configPath : null,
      agents_path: resolvedSite.agentsPath,
      section_title: sectionTitle,
      bootstrap_text: bootstrapText,
    };

    if (fmt.getFormat() === 'human') {
      fmt.section(`Site Agent Bootstrap — ${role}`);
      fmt.kv('Mutation Performed', 'false');
      if (result.site_id) {
        fmt.kv('Site', result.site_id);
      }
      fmt.kv('Site Root', result.site_root);
      fmt.kv('Source', result.agents_path);
      fmt.section(sectionTitle);
      fmt.message(bootstrapText, 'info');
    }

    return { exitCode: ExitCode.SUCCESS, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: message,
        mutation_performed: false,
      },
    };
  }
}

export async function sitesLifecycleKindsCommand(
  options: SitesLifecycleKindsOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const kinds = SITE_LIFECYCLE_KINDS.map((entry) => ({
    kind: entry.kind,
    purpose: entry.purpose,
    source_required: entry.sourceRequired,
    target_required: entry.targetRequired,
    authority_modes: [...entry.authorityModes],
    artifacts: siteLifecycleArtifacts(entry.kind),
  }));

  if (fmt.getFormat() === 'human') {
    fmt.section('Site Lifecycle Transformation Kinds');
    fmt.table(
      [
        { key: 'kind', label: 'Kind', width: 16 },
        { key: 'source_required', label: 'Source', width: 8 },
        { key: 'target_required', label: 'Target', width: 8 },
        { key: 'authority_modes', label: 'Authority Modes', width: 36 },
      ],
      kinds.map((entry) => ({
        kind: entry.kind,
        source_required: entry.source_required ? 'yes' : 'no',
        target_required: entry.target_required ? 'yes' : 'no',
        authority_modes: entry.authority_modes.join(', '),
      })),
    );
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      kinds,
    },
  };
}

export async function sitesLifecyclePreflightCommand(
  options: SitesLifecyclePreflightOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const kind = findSiteLifecycleKind(options.kind);
  if (!kind) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: `Unsupported Site lifecycle transformation: "${options.kind ?? ''}"`,
        allowed_kinds: SITE_LIFECYCLE_KINDS.map((entry) => entry.kind),
      },
    };
  }

  const checks: SiteDoctorCheck[] = [];
  addCheck(
    checks,
    'source_site_declared',
    options.sourceSite || !kind.sourceRequired ? 'pass' : 'fail',
    options.sourceSite ? `Source Site: ${options.sourceSite}` : 'Source Site is required',
    `Provide --source-site <site-id-or-path> for ${kind.kind}`,
  );
  addCheck(
    checks,
    'target_site_declared',
    options.targetSite || !kind.targetRequired ? 'pass' : 'fail',
    options.targetSite ? `Target Site: ${options.targetSite}` : kind.targetRequired ? 'Target Site is required' : 'Target Site is not required',
    `Provide --target-site <site-id-or-path> for ${kind.kind}`,
  );
  addCheck(
    checks,
    'authority_mode_declared',
    options.authorityMode ? 'pass' : 'fail',
    options.authorityMode ? `Authority mode: ${options.authorityMode}` : 'Authority mode is required',
    `Choose one of: ${kind.authorityModes.join(', ')}`,
  );
  addCheck(
    checks,
    'authority_mode_supported',
    options.authorityMode && (kind.authorityModes as readonly string[]).includes(options.authorityMode) ? 'pass' : 'fail',
    options.authorityMode
      ? `Authority mode ${options.authorityMode} ${((kind.authorityModes as readonly string[]).includes(options.authorityMode)) ? 'is supported' : 'is not supported for this transformation'}`
      : 'Authority mode was not provided',
    `Choose one of: ${kind.authorityModes.join(', ')}`,
  );

  const failed = checks.filter((check) => check.status === 'fail');
  const ready = failed.length === 0;
  const result = {
    status: ready ? 'ready' : 'blocked',
    mutation_performed: false,
    kind: kind.kind,
    purpose: kind.purpose,
    source_site: options.sourceSite ?? null,
    target_site: options.targetSite ?? null,
    authority_mode: options.authorityMode ?? null,
    required_artifacts: siteLifecycleArtifacts(kind.kind),
    checks,
    next_step: ready
      ? 'Create a governed transformation plan artifact before any Site filesystem, registry, config, inbox, task, or authority mutation.'
      : 'Resolve failed checks before creating a transformation plan.',
  };

  if (fmt.getFormat() === 'human') {
    fmt.section(`Site Lifecycle Preflight — ${kind.kind}`);
    fmt.kv('Status', result.status);
    fmt.kv('Mutation Performed', 'false');
    for (const check of checks) {
      const prefix = check.status === 'pass' ? '[pass]' : '[fail]';
      fmt.message(`${prefix} ${check.name}: ${check.message}`, check.status === 'pass' ? 'success' : 'error');
      if (check.remediation && options.verbose) {
        fmt.message(`  remediation: ${check.remediation}`, 'info');
      }
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result,
  };
}

export async function sitesLifecycleExecuteAbsorbCommand(
  options: SitesLifecycleExecuteAbsorbOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const sourceSite = requireOption(options.sourceSite, '--source-site');
    const targetSite = requireOption(options.targetSite, '--target-site');
    const by = requireOption(options.by, '--by');
    const authorityMode = options.authorityMode ?? 'admission_review';
    if (authorityMode !== 'admission_review') {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          error: `Site absorb v0 only supports authority mode admission_review, got: ${authorityMode}`,
          mutation_performed: false,
          supported_authority_modes: ['admission_review'],
        },
      };
    }

    const now = new Date().toISOString();
    const transformationId = `site_absorb_${randomUUID()}`;
    const admittedMaterial = parseCsv(options.admittedMaterial);
    const evidenceRefs = parseCsv(options.evidenceRef);
    const retainedAuthority = parseCsv(options.retainedAuthority);
    const plan = {
      transformation_id: transformationId,
      kind: 'absorb',
      source_site_ref: sourceSite,
      target_site_ref: targetSite,
      authority_mode: authorityMode,
      authority_moved: false,
      config_mutated: false,
      admitted_material: admittedMaterial,
      evidence_refs: evidenceRefs,
      retained_authority: retainedAuthority,
      required_artifacts: siteLifecycleArtifacts('absorb'),
      created_by: by,
      created_at: now,
      v0_boundary: 'writes plan, lineage event, and relation records only; no Site config mutation or authority transfer',
    };
    const lineageEvent = {
      event_id: `lineage_${randomUUID()}`,
      event_type: 'site.absorbed',
      source_site_ref: sourceSite,
      target_site_ref: targetSite,
      principal: by,
      authority_effect: 'admission_without_implicit_ownership',
      evidence_refs: evidenceRefs,
      occurred_at: now,
      rollback_or_residual_posture: 'relation records may be superseded; no authority was transferred by v0 execution',
      transformation_id: transformationId,
    };

    const planPath = join(resolve(cwd), '.ai', 'site-lifecycle', 'plans', `${transformationId}.json`);
    const lineagePath = join(resolve(cwd), '.ai', 'site-lineage-events', `${lineageEvent.event_id}.json`);
    const execute = options.execute ?? false;
    let relationIds: string[] = [];

    if (execute) {
      await mkdir(join(resolve(cwd), '.ai', 'site-lifecycle', 'plans'), { recursive: true });
      await mkdir(join(resolve(cwd), '.ai', 'site-lineage-events'), { recursive: true });
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
      await writeFile(lineagePath, `${JSON.stringify(lineageEvent, null, 2)}\n`, 'utf8');

      const registry = await readSiteRelationRegistry(cwd);
      const forward = makeSiteRelationRecord({
        relationKind: 'absorbed',
        sourceSite,
        targetSite,
        authorityEffect: 'admission_without_implicit_ownership',
        admittedMaterial,
        evidenceRefs,
        lineageEventRefs: [lineageEvent.event_id],
        reciprocalRequired: true,
        createdBy: by,
      });
      const reverse = makeSiteRelationRecord({
        relationKind: 'absorbed_by',
        sourceSite: targetSite,
        targetSite: sourceSite,
        authorityEffect: 'admission_without_implicit_ownership',
        admittedMaterial,
        evidenceRefs,
        lineageEventRefs: [lineageEvent.event_id],
        reciprocalRequired: false,
        reciprocalRelationId: forward.relation_id,
        createdBy: by,
      });
      forward.reciprocal_relation_id = reverse.relation_id;
      registry.relations.push(forward, reverse);
      await writeSiteRelationRegistry(cwd, registry);
      relationIds = [forward.relation_id, reverse.relation_id];
    }

    const result = {
      status: execute ? 'success' : 'dry_run',
      mutation_performed: execute,
      plan,
      lineage_event: lineageEvent,
      plan_path: planPath,
      lineage_event_path: lineagePath,
      relation_registry_path: siteRelationRegistryPath(cwd),
      relation_ids: relationIds,
      read_back_confirmed: execute
        ? existsSync(planPath) && existsSync(lineagePath) && relationIds.length === 2
        : false,
      authority_moved: false,
      config_mutated: false,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(
        result,
        [
          execute ? 'Site absorb v0 executed' : 'Dry run - Site absorb v0 plan',
          `source_site: ${sourceSite}`,
          `target_site: ${targetSite}`,
          `authority_mode: ${authorityMode}`,
          `mutation_performed: ${String(execute)}`,
          `authority_moved: false`,
          `config_mutated: false`,
          `plan_path: ${planPath}`,
          `lineage_event_path: ${lineagePath}`,
        ],
        (options.format ?? 'auto') as CliFormat,
      ),
    };
  } catch (error) {
    return normalizeSiteRelationError(error);
  }
}

export async function sitesShowCommand(
  siteId: string,
  options: SitesOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const site = registry.getSite(siteId);
    if (!site) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Site not found: ${siteId}` },
      };
    }

    const {
      getWindowsSiteStatus,
    } = await import('@narada2/windows-site');

    let health = null;
    try {
      if (site.variant === 'linux-user' || site.variant === 'linux-system') {
        const mode = site.variant === 'linux-system' ? 'system' : 'user';
        const { getSiteHealth } = await import('@narada2/linux-site');
        health = await getSiteHealth(siteId, mode);
      } else {
        health = (await getWindowsSiteStatus(siteId, site.variant as import('@narada2/windows-site').WindowsSiteVariant)).health;
      }
    } catch {
      // health stays null
    }

    const result = {
      siteId: site.siteId,
      variant: site.variant,
      siteRoot: site.siteRoot,
      substrate: site.substrate,
      aimJson: site.aimJson,
      controlEndpoint: site.controlEndpoint,
      lastSeenAt: site.lastSeenAt,
      createdAt: site.createdAt,
      health: health
        ? {
            status: health.status,
            lastCycleAt: health.last_cycle_at,
            lastCycleDurationMs: health.last_cycle_duration_ms,
            consecutiveFailures: health.consecutive_failures,
            message: health.message,
            updatedAt: health.updated_at,
          }
        : null,
    };

    if (fmt.getFormat() === 'human') {
      fmt.section(`Site — ${siteId}`);
      fmt.kv('Variant', site.variant);
      fmt.kv('Site Root', site.siteRoot);
      fmt.kv('Substrate', site.substrate);
      fmt.kv('Aim', site.aimJson ?? '-');
      fmt.kv('Last Seen', site.lastSeenAt ?? 'never');
      fmt.kv('Created', site.createdAt);
      if (health) {
        fmt.section('Health');
        fmt.kv('Status', health.status);
        fmt.kv('Last Cycle', health.last_cycle_at ?? 'never');
        fmt.kv('Consecutive Failures', String(health.consecutive_failures));
        fmt.kv('Message', health.message);
      }
    }

    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', site: result } };
  } finally {
    registry.close();
  }
}

export async function sitesRemoveCommand(
  siteId: string,
  options: SitesOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const removed = registry.removeSite(siteId);
    if (!removed) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Site not found: ${siteId}` },
      };
    }

    if (fmt.getFormat() === 'human') {
      fmt.message(`Removed ${siteId} from registry (Site files were NOT deleted).`, 'success');
    }

    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', removed: siteId } };
  } finally {
    registry.close();
  }
}

// ---------------------------------------------------------------------------
// Site doctor
// ---------------------------------------------------------------------------

export interface SitesDoctorOptions extends SitesOptions {
  root?: string;
  authorityLocus?: string;
  kind?: string;
}

export interface SitesReconcileAgentCliWrapperOptions extends SitesOptions {
  root?: string;
  apply?: boolean;
}

export interface SitesReconcileToolSurfaceManifestOptions extends SitesOptions {
  root?: string;
  apply?: boolean;
}

export interface SitesAuditToolSurfaceDuplicatesOptions extends SitesOptions {
  root?: string | string[];
  limit?: number;
}

const AGENT_CLI_WRAPPER_RELATIVE_PATH = join('tools', 'operator-surface-carriers', 'Start-AgentCliSession.ps1');
const AGENT_CLI_WRAPPER_TEMPLATE_HASH_PLACEHOLDER = '__NARADA_TEMPLATE_HASH__';
const AGENT_CLI_WRAPPER_TEMPLATE_HASH_LINE = /^# narada_template_hash: .*$/m;
let legacyToolSurfaceEntries: Map<string, Record<string, unknown>> | null = null;

function addCheck(
  checks: SiteDoctorCheck[],
  name: string,
  status: SiteDoctorCheck['status'],
  message: string,
  remediation?: string,
): void {
  checks.push({ name, status, message, remediation });
}

function siteDoctorMessageKind(status: SiteDoctorCheck['status']): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'error';
  if (status === 'declared_exception') return 'info';
  return 'warning';
}

function siteDoctorPrefix(status: SiteDoctorCheck['status']): string {
  if (status === 'pass') return '[pass]';
  if (status === 'fail') return '[fail]';
  if (status === 'declared_exception') return '[declared_exception]';
  return '[warn]';
}

function containedSiteRootFromInput(root: string): string {
  const resolved = resolve(root);
  if (existsSync(join(resolved, 'config.json')) || resolved.toLowerCase().endsWith(`${win32.sep}.narada`) || resolved.toLowerCase().endsWith('/.narada')) {
    return resolved;
  }
  return clientSiteRootFromWorkspace(resolved);
}

function workspaceRootFromContainedInput(inputRoot: string, siteRoot: string): string {
  const resolved = resolve(inputRoot);
  if (normalizeNativePath(resolved) === normalizeNativePath(siteRoot) && basename(siteRoot).toLowerCase() === '.narada') {
    return dirname(siteRoot);
  }
  return resolved;
}

function configSiteField(config: Record<string, unknown>, field: string): unknown {
  const nested = config.site && typeof config.site === 'object' ? config.site as Record<string, unknown> : null;
  return config[field] ?? nested?.[field];
}

function configSyncPosture(config: Record<string, unknown>): string | undefined {
  const sync = config.sync && typeof config.sync === 'object' ? config.sync as { posture?: string } : null;
  const nested = config.site && typeof config.site === 'object' ? config.site as { sync_posture?: string } : null;
  return sync?.posture ?? nested?.sync_posture;
}

function addDelegatedCliEmbodimentCheck(checks: SiteDoctorCheck[], siteRoot: string): void {
  const health = inspectDelegatedCliHealth(siteRoot);
  addCheck(
    checks,
    'delegated_cli_embodiment_loadable',
    health.status,
    health.detail,
    health.ok ? undefined : 'Repair the delegated Narada CLI embodiment referenced by Site-local package scripts, then rerun Site doctor.',
  );
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizeAgentCliWrapperTemplateText(text: string): string {
  return text
    .replace(AGENT_CLI_WRAPPER_TEMPLATE_HASH_LINE, `# narada_template_hash: ${AGENT_CLI_WRAPPER_TEMPLATE_HASH_PLACEHOLDER}`)
    .trimEnd();
}

function agentCliWrapperTemplatePath(): string {
  return fileURLToPath(new URL('../../../../../packages/agent-cli/templates/Start-AgentCliSession.ps1', import.meta.url));
}

async function loadAgentCliWrapperTemplate(): Promise<{
  templatePath: string;
  normalizedText: string;
  normalizedHash: string;
  renderedText: string;
}> {
  const templatePath = agentCliWrapperTemplatePath();
  const templateText = await readFile(templatePath, 'utf8');
  const normalizedText = normalizeAgentCliWrapperTemplateText(templateText);
  const normalizedHash = sha256Text(normalizedText);
  return {
    templatePath,
    normalizedText,
    normalizedHash,
    renderedText: `${normalizedText.replace(AGENT_CLI_WRAPPER_TEMPLATE_HASH_PLACEHOLDER, normalizedHash)}\n`,
  };
}

async function inspectAgentCliWrapper(siteRoot: string): Promise<{
  wrapperPath: string;
  exists: boolean;
  current: boolean;
  existingHash: string | null;
  templatePath: string;
  templateHash: string;
  hasTemplateEvidence: boolean;
}> {
  const wrapperPath = join(siteRoot, AGENT_CLI_WRAPPER_RELATIVE_PATH);
  const template = await loadAgentCliWrapperTemplate();
  if (!existsSync(wrapperPath)) {
    return {
      wrapperPath,
      exists: false,
      current: false,
      existingHash: null,
      templatePath: template.templatePath,
      templateHash: template.normalizedHash,
      hasTemplateEvidence: false,
    };
  }
  const wrapperText = await readFile(wrapperPath, 'utf8');
  const normalizedWrapper = normalizeAgentCliWrapperTemplateText(wrapperText);
  const existingHash = sha256Text(normalizedWrapper);
  const hasTemplateEvidence = wrapperText.includes('narada_template_source: @narada2/agent-cli')
    && wrapperText.includes('narada_template_id:')
    && wrapperText.includes('narada_template_version:')
    && wrapperText.includes('narada_template_hash:');
  return {
    wrapperPath,
    exists: true,
    current: hasTemplateEvidence && existingHash === template.normalizedHash,
    existingHash,
    templatePath: template.templatePath,
    templateHash: template.normalizedHash,
    hasTemplateEvidence,
  };
}

async function listFilesRecursive(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.includes('node_modules') || entry.name === '.git' || entry.name === 'dist' || entry.name === '.cache') {
          continue;
        }
        await walk(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  await walk(root);
  return files;
}

function slashRelative(root: string, absolute: string): string {
  return win32.relative(root, absolute).replace(/\\/g, '/');
}

function isExecutableToolPath(pathValue: string): boolean {
  return /\.(mjs|js|cjs|ts|tsx|ps1|cmd|bat|py)$/i.test(pathValue);
}

async function loadLegacyToolSurfaceEntries(): Promise<Map<string, Record<string, unknown>>> {
  if (legacyToolSurfaceEntries) return legacyToolSurfaceEntries;
  const manifestPath = fileURLToPath(new URL('../../../../../packages/site-tool-surface-legacy/manifest.json', import.meta.url));
  const entries = new Map<string, Record<string, unknown>>();
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { files?: Array<Record<string, unknown>> };
    for (const file of manifest.files ?? []) {
      const pathValue = String(file.path ?? '').replace(/\\/g, '/');
      if (pathValue) {
        entries.set(pathValue, file);
      }
    }
  }
  legacyToolSurfaceEntries = entries;
  return entries;
}

async function desiredToolSurfaceEntry(siteRoot: string, filePath: string): Promise<Record<string, unknown>> {
  const relativePath = slashRelative(siteRoot, filePath);
  const text = await readFile(filePath, 'utf8');
  const hash = sha256Text(text);
  const allowedRootRefs = ['NARADA_USER_SITE_ROOT', 'NARADA_SITE_ROOT', 'NARADA_WORKSPACE_ROOT', 'NARADA_PC_SITE_ROOT', 'NARADA_PROPER_ROOT'];
  if (text.includes('narada_template_id: narada.agent_cli.windows_wrapper')) {
    const version = /^# narada_template_version: (.+)$/m.exec(text)?.[1]?.trim() ?? '';
    const templateHash = /^# narada_template_hash: (.+)$/m.exec(text)?.[1]?.trim() ?? '';
    return {
      path: relativePath,
      class: 'generated_wrapper',
      owner: 'narada-proper',
      surface: 'agent-cli',
      package: '@narada2/agent-cli',
      version,
      hash: templateHash,
      allowed_root_refs: allowedRootRefs,
    };
  }
  if (text.includes('legacy_session_launcher_retired')) {
    return {
      path: relativePath,
      class: 'retired_refusal',
      owner: 'site',
      surface: 'legacy-launcher',
      package: '',
      version: '',
      hash,
      allowed_root_refs: allowedRootRefs,
    };
  }
  if (/(\.test\.(mjs|js|ts|tsx|ps1|py)$|[\\/](tests?|__tests__)[\\/]|[\\/]test-[^\\/]+\.(mjs|js|ts|tsx|ps1|py)$|[\\/]Test-[^\\/]+\.(mjs|js|ts|tsx|ps1|py)$)/i.test(relativePath)) {
    return {
      path: relativePath,
      class: 'test_surface',
      owner: 'site',
      surface: 'test',
      package: '',
      version: '',
      hash,
      allowed_root_refs: allowedRootRefs,
    };
  }
  const legacyEntry = (await loadLegacyToolSurfaceEntries()).get(relativePath);
  if (legacyEntry) {
    return {
      path: relativePath,
      class: 'legacy_package_mirror',
      owner: 'narada-proper',
      surface: legacyEntry.surface ?? 'legacy-tool-surface',
      package: '@narada2/site-tool-surface-legacy',
      version: '0.0.0',
      hash,
      allowed_root_refs: allowedRootRefs,
    };
  }
  const surface = relativePath.startsWith('tools/agent-start/')
    ? 'agent-start'
    : relativePath.startsWith('tools/task-lifecycle/')
      ? 'task-lifecycle'
      : relativePath.startsWith('tools/typed-mcp/')
        ? 'typed-mcp'
        : relativePath.startsWith('tools/operator-surface-carriers/')
          ? 'operator-surface'
          : relativePath.startsWith('tools/window-surface-overlay/')
            ? 'window-surface-overlay'
            : 'site-tools';
  return {
    path: relativePath,
    class: 'site_owned',
    owner: 'site',
    surface,
    package: '',
    version: '',
    hash,
    reason: 'transitional site-owned executable pending package cutover review',
    review_at: '2026-06-30',
    allowed_root_refs: allowedRootRefs,
  };
}

async function buildToolSurfaceManifest(siteRoot: string): Promise<Record<string, unknown>> {
  const toolRoot = join(siteRoot, 'tools');
  const files = (await listFilesRecursive(toolRoot)).filter(isExecutableToolPath);
  const entries = await Promise.all(files.map((file) => desiredToolSurfaceEntry(siteRoot, file)));
  entries.sort((a, b) => String(a.path ?? '').localeCompare(String(b.path ?? '')));
  return {
    schema: 'narada.site_tool_surface.manifest.v1',
    site_root: siteRoot,
    tool_root: toolRoot,
    generated_at: new Date().toISOString(),
    entries,
  };
}

async function readSiteToolSurfaceManifest(siteRoot: string): Promise<{
  manifestPath: string;
  manifest: { entries?: Array<Record<string, unknown>> } | null;
  error?: string;
}> {
  const manifestPath = join(siteRoot, 'site-tool-surface.manifest.json');
  if (!existsSync(manifestPath)) {
    return { manifestPath, manifest: null, error: 'manifest_missing' };
  }
  try {
    return {
      manifestPath,
      manifest: JSON.parse(await readFile(manifestPath, 'utf8')) as { entries?: Array<Record<string, unknown>> },
    };
  } catch (err) {
    return {
      manifestPath,
      manifest: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalizeRootsOption(root: string | string[] | undefined): string[] {
  const raw = Array.isArray(root) ? root : root ? [root] : ['.'];
  return raw
    .flatMap((value) => value.split(';'))
    .map((value) => value.trim())
    .filter(Boolean);
}

function chooseDuplicateCutoverCandidates(groups: Array<{
  hash: string;
  surface: string | null;
  count: number;
  sites: string[];
  entries: Array<Record<string, unknown>>;
}>): Array<{
  surface: string | null;
  duplicate_group_count: number;
  duplicate_entry_count: number;
  representative_paths: string[];
}> {
  const bySurface = new Map<string, {
    surface: string | null;
    duplicate_group_count: number;
    duplicate_entry_count: number;
    representative_paths: Set<string>;
  }>();
  for (const group of groups) {
    const key = group.surface ?? 'site-tools';
    const existing = bySurface.get(key) ?? {
      surface: group.surface,
      duplicate_group_count: 0,
      duplicate_entry_count: 0,
      representative_paths: new Set<string>(),
    };
    existing.duplicate_group_count += 1;
    existing.duplicate_entry_count += group.count;
    for (const entry of group.entries.slice(0, 3)) {
      existing.representative_paths.add(String(entry.path ?? ''));
    }
    bySurface.set(key, existing);
  }
  return [...bySurface.values()]
    .sort((a, b) => b.duplicate_entry_count - a.duplicate_entry_count || b.duplicate_group_count - a.duplicate_group_count)
    .map((candidate) => ({
      surface: candidate.surface,
      duplicate_group_count: candidate.duplicate_group_count,
      duplicate_entry_count: candidate.duplicate_entry_count,
      representative_paths: [...candidate.representative_paths].filter(Boolean).slice(0, 5),
    }));
}

function chooseSiteOwnedBurdenCandidates(entries: Array<Record<string, unknown> & { site_root: string }>): Array<{
  surface: string | null;
  site_count: number;
  entry_count: number;
  representative_paths: string[];
}> {
  const bySurface = new Map<string, {
    surface: string | null;
    sites: Set<string>;
    entry_count: number;
    representative_paths: Set<string>;
  }>();
  for (const entry of entries) {
    const key = String(entry.surface ?? '') || 'site-tools';
    const existing = bySurface.get(key) ?? {
      surface: String(entry.surface ?? '') || null,
      sites: new Set<string>(),
      entry_count: 0,
      representative_paths: new Set<string>(),
    };
    existing.sites.add(entry.site_root);
    existing.entry_count += 1;
    existing.representative_paths.add(String(entry.path ?? ''));
    bySurface.set(key, existing);
  }
  return [...bySurface.values()]
    .sort((a, b) => b.entry_count - a.entry_count || b.sites.size - a.sites.size)
    .map((candidate) => ({
      surface: candidate.surface,
      site_count: candidate.sites.size,
      entry_count: candidate.entry_count,
      representative_paths: [...candidate.representative_paths].filter(Boolean).slice(0, 5),
    }));
}

async function addSiteToolSurfaceChecks(checks: SiteDoctorCheck[], siteRoot: string): Promise<void> {
  const manifestPath = join(siteRoot, 'site-tool-surface.manifest.json');
  const toolsRoot = join(siteRoot, 'tools');
  const toolFiles = (await listFilesRecursive(toolsRoot)).filter(isExecutableToolPath);
  if (!existsSync(manifestPath)) {
    addCheck(
      checks,
      'site_tool_surface_manifest',
      toolFiles.length === 0 ? 'pass' : 'fail',
      toolFiles.length === 0
        ? 'No executable Site-local tool surfaces require a manifest'
        : `Missing site-tool-surface.manifest.json for ${toolFiles.length} executable tool file(s)`,
      'Generate or reconcile site-tool-surface.manifest.json from Narada proper before launching Site-local tools.',
    );
    return;
  }

  addCheck(checks, 'site_tool_surface_manifest', 'pass', `Tool surface manifest exists: ${manifestPath}`);
  let manifest: { entries?: Array<Record<string, unknown>>; site_root?: string } | null = null;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { entries?: Array<Record<string, unknown>>; site_root?: string };
    addCheck(checks, 'site_tool_surface_manifest_parse', 'pass', 'Tool surface manifest parses as JSON');
  } catch (err) {
    addCheck(checks, 'site_tool_surface_manifest_parse', 'fail', `Tool surface manifest is invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const entryByPath = new Map(entries.map((entry) => [String(entry.path ?? '').replace(/\\/g, '/'), entry]));
  const missing = toolFiles
    .map((file) => slashRelative(siteRoot, file))
    .filter((relative) => !entryByPath.has(relative));
  addCheck(
    checks,
    'site_tool_surface_coverage',
    missing.length === 0 ? 'pass' : 'fail',
    missing.length === 0
      ? `${toolFiles.length} executable tool surface(s) are declared`
      : `${missing.length} executable tool surface(s) are undeclared: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}`,
  );

  const validClasses = new Set(['canonical_package', 'legacy_package_mirror', 'generated_wrapper', 'site_owned', 'retired_refusal', 'runtime_state', 'test_surface']);
  const invalidClasses = entries.filter((entry) => !validClasses.has(String(entry.class ?? '')));
  addCheck(
    checks,
    'site_tool_surface_classes',
    invalidClasses.length === 0 ? 'pass' : 'fail',
    invalidClasses.length === 0 ? 'All manifest entries use known ownership classes' : `${invalidClasses.length} manifest entries use unknown ownership classes`,
  );

  const generatedWrappers = entries.filter((entry) => entry.class === 'generated_wrapper');
  const generatedMissingEvidence = generatedWrappers.filter((entry) => !entry.package || !entry.version || !entry.hash);
  addCheck(
    checks,
    'generated_wrapper_evidence',
    generatedMissingEvidence.length === 0 ? 'pass' : 'fail',
    generatedMissingEvidence.length === 0
      ? `${generatedWrappers.length} generated wrapper(s) carry package/version/hash evidence`
      : `${generatedMissingEvidence.length} generated wrapper(s) lack package/version/hash evidence`,
  );

  const agentCliWrapperPath = join(siteRoot, 'tools', 'operator-surface-carriers', 'Start-AgentCliSession.ps1');
  if (existsSync(agentCliWrapperPath)) {
    const wrapper = await inspectAgentCliWrapper(siteRoot);
    addCheck(
      checks,
      'agent_cli_package_wrapper',
      wrapper.current ? 'pass' : 'fail',
      wrapper.current
        ? `agent-cli wrapper matches @narada2/agent-cli template hash ${wrapper.templateHash}`
        : `agent-cli wrapper is stale or lacks package template evidence; existing_hash=${wrapper.existingHash ?? 'missing'} expected_hash=${wrapper.templateHash}`,
      'Run narada sites reconcile agent-cli-wrapper --root <site-root-or-workspace> --apply.',
    );
  } else if (generatedWrappers.some((entry) => entry.surface === 'agent-cli')) {
    addCheck(checks, 'agent_cli_package_wrapper', 'fail', 'Manifest declares an agent-cli generated wrapper, but Start-AgentCliSession.ps1 is missing');
  }

  const siteOwned = entries.filter((entry) => entry.class === 'site_owned');
  const weakSiteOwned = siteOwned.filter((entry) => !entry.owner || !entry.surface || (!entry.reason && !entry.review_at && !entry.expires_at));
  addCheck(
    checks,
    'site_owned_surface_declarations',
    weakSiteOwned.length === 0 ? 'pass' : 'declared_exception',
    weakSiteOwned.length === 0
      ? `${siteOwned.length} site-owned surface(s) include ownership metadata`
      : `${weakSiteOwned.length} site-owned surface(s) are declared but lack reason/review metadata`,
    'Add owner, scope/surface, reason, and review_at or expires_at to site_owned entries.',
  );
}

async function addMcpFreshnessChecks(checks: SiteDoctorCheck[], siteRoot: string): Promise<void> {
  const tmpRoot = join(siteRoot, '.ai', 'tmp');
  const legacyBaseline = join(tmpRoot, 'mcp-baseline.json');
  const perSurfaceBaselines = join(tmpRoot, 'mcp-baselines');
  const restartRequests = join(tmpRoot, 'mcp-restart-requests');
  const restartEvidence = join(tmpRoot, 'mcp-restart-evidence');

  const baselineFiles = (await listFilesRecursive(perSurfaceBaselines)).filter((file) => file.endsWith('.json'));
  if (baselineFiles.length > 0) {
    addCheck(checks, 'mcp_freshness_markers', 'pass', `${baselineFiles.length} per-surface MCP baseline marker(s) present`);
  } else if (existsSync(legacyBaseline)) {
    addCheck(
      checks,
      'mcp_freshness_markers',
      'warn',
      'Legacy Site-wide MCP baseline exists without per-surface baseline markers',
      'Migrate to .ai/tmp/mcp-baselines/<surface-key>.json keyed by canonical_site_root + surface_id + server_entrypoint.',
    );
  } else {
    addCheck(checks, 'mcp_freshness_markers', 'warn', 'No per-surface MCP baseline markers found');
  }

  const requestFiles = (await listFilesRecursive(restartRequests)).filter((file) => file.endsWith('.json'));
  if (requestFiles.length === 0) {
    addCheck(checks, 'mcp_restart_pressure', 'pass', 'No active per-surface MCP restart request markers found');
    return;
  }

  const evidenceFiles = (await listFilesRecursive(restartEvidence)).filter((file) => file.endsWith('.json') || file.endsWith('.jsonl'));
  addCheck(
    checks,
    'mcp_restart_pressure',
    evidenceFiles.length > 0 ? 'warn' : 'fail',
    evidenceFiles.length > 0
      ? `${requestFiles.length} restart request marker(s) present with ${evidenceFiles.length} evidence artifact(s); verify disposition`
      : `${requestFiles.length} restart request marker(s) present without restart-pressure acknowledgement evidence`,
    'Write durable reconciliation evidence before claiming restart pressure is acknowledged or cleared.',
  );
}

export async function sitesReconcileAgentCliWrapperCommand(
  options: SitesReconcileAgentCliWrapperOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const inputRoot = resolve(options.root ?? '.');
  const siteRoot = containedSiteRootFromInput(inputRoot);
  const wrapper = await inspectAgentCliWrapper(siteRoot);
  const template = await loadAgentCliWrapperTemplate();
  const mutationNeeded = !wrapper.current;
  if (options.apply && mutationNeeded) {
    await mkdir(dirname(wrapper.wrapperPath), { recursive: true });
    await writeFile(wrapper.wrapperPath, template.renderedText, 'utf8');
  }

  const after = options.apply ? await inspectAgentCliWrapper(siteRoot) : wrapper;
  const result = {
    schema: 'narada.site_agent_cli_wrapper_reconcile.v1',
    status: after.current ? 'current' : options.apply ? 'failed' : 'stale',
    mutation_attempted: options.apply === true,
    mutation_performed: options.apply === true && mutationNeeded,
    site_root: siteRoot,
    wrapper_path: after.wrapperPath,
    wrapper_exists: after.exists,
    wrapper_current: after.current,
    existing_hash: after.existingHash,
    expected_template_hash: after.templateHash,
    template_path: after.templatePath,
  };
  const lines = [
    `agent-cli wrapper: ${result.status}`,
    `site_root: ${siteRoot}`,
    `wrapper_path: ${after.wrapperPath}`,
    `expected_template_hash: ${after.templateHash}`,
    `existing_hash: ${after.existingHash ?? 'missing'}`,
    `mutation_performed: ${String(result.mutation_performed)}`,
  ];
  return {
    exitCode: after.current || !options.apply ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, lines, (options.format ?? 'auto') as CliFormat),
  };
}

export async function sitesReconcileToolSurfaceManifestCommand(
  options: SitesReconcileToolSurfaceManifestOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const inputRoot = resolve(options.root ?? '.');
  const siteRoot = containedSiteRootFromInput(inputRoot);
  const manifestPath = join(siteRoot, 'site-tool-surface.manifest.json');
  const existingText = existsSync(manifestPath) ? await readFile(manifestPath, 'utf8') : '';
  const manifest = await buildToolSurfaceManifest(siteRoot);
  let nextText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existingText) {
    try {
      const existing = JSON.parse(existingText) as Record<string, unknown>;
      const existingComparable = { ...existing, generated_at: '<ignored>' };
      const nextComparable = { ...manifest, generated_at: '<ignored>' };
      if (JSON.stringify(existingComparable) === JSON.stringify(nextComparable)) {
        nextText = existingText;
      }
    } catch {
      // Invalid existing JSON should be replaced by the generated manifest when --apply is present.
    }
  }
  const mutationNeeded = existingText !== nextText;
  if (options.apply && mutationNeeded) {
    await writeFile(manifestPath, nextText, 'utf8');
  }
  const result = {
    schema: 'narada.site_tool_surface_manifest_reconcile.v1',
    status: mutationNeeded ? options.apply ? 'repaired' : 'stale' : 'current',
    mutation_attempted: options.apply === true,
    mutation_performed: options.apply === true && mutationNeeded,
    site_root: siteRoot,
    manifest_path: manifestPath,
    entry_count: Array.isArray(manifest.entries) ? manifest.entries.length : 0,
    site_owned_count: Array.isArray(manifest.entries) ? manifest.entries.filter((entry) => entry.class === 'site_owned').length : 0,
    test_surface_count: Array.isArray(manifest.entries) ? manifest.entries.filter((entry) => entry.class === 'test_surface').length : 0,
  };
  const lines = [
    `tool-surface manifest: ${result.status}`,
    `site_root: ${siteRoot}`,
    `manifest_path: ${manifestPath}`,
    `entries: ${result.entry_count}`,
    `site_owned: ${result.site_owned_count}`,
    `test_surface: ${result.test_surface_count}`,
    `mutation_performed: ${String(result.mutation_performed)}`,
  ];
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, lines, (options.format ?? 'auto') as CliFormat),
  };
}

export async function sitesAuditToolSurfaceDuplicatesCommand(
  options: SitesAuditToolSurfaceDuplicatesOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoots = normalizeRootsOption(options.root)
    .map((root) => containedSiteRootFromInput(root))
    .filter((root, index, roots) => roots.findIndex((candidate) => normalizeNativePath(candidate) === normalizeNativePath(root)) === index);
  const manifests = await Promise.all(siteRoots.map(async (siteRoot) => ({
    siteRoot,
    ...await readSiteToolSurfaceManifest(siteRoot),
  })));
  const entriesByHash = new Map<string, Array<Record<string, unknown> & { site_root: string; manifest_path: string }>>();
  const siteOwnedEntries: Array<Record<string, unknown> & { site_root: string; manifest_path: string }> = [];
  for (const record of manifests) {
    for (const entry of record.manifest?.entries ?? []) {
      if (entry.class !== 'site_owned') continue;
      siteOwnedEntries.push({ ...entry, site_root: record.siteRoot, manifest_path: record.manifestPath });
      const hash = String(entry.hash ?? '').trim();
      if (!hash) continue;
      const enriched = { ...entry, site_root: record.siteRoot, manifest_path: record.manifestPath };
      entriesByHash.set(hash, [...(entriesByHash.get(hash) ?? []), enriched]);
    }
  }
  const duplicateGroups = [...entriesByHash.entries()]
    .map(([hash, entries]) => {
      const sites = [...new Set(entries.map((entry) => normalizeNativePath(entry.site_root)))];
      return {
        hash,
        surface: String(entries[0]?.surface ?? '') || null,
        count: entries.length,
        site_count: sites.length,
        sites: [...new Set(entries.map((entry) => entry.site_root))],
        entries: entries.map((entry) => ({
          site_root: entry.site_root,
          path: entry.path,
          surface: entry.surface,
          owner: entry.owner,
          reason: entry.reason,
          review_at: entry.review_at,
        })),
      };
    })
    .filter((group) => group.site_count > 1)
    .sort((a, b) => b.count - a.count || String(a.surface ?? '').localeCompare(String(b.surface ?? '')));
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : 20;
  const candidates = chooseDuplicateCutoverCandidates(duplicateGroups);
  const manifestErrors = manifests.filter((record) => record.error).map((record) => ({
    site_root: record.siteRoot,
    manifest_path: record.manifestPath,
    error: record.error,
  }));
  const result = {
    schema: 'narada.site_tool_surface_duplicate_audit.v1',
    status: manifestErrors.length > 0 ? 'manifest_errors' : duplicateGroups.length > 0 ? 'duplicates_found' : 'passed',
    mutation_attempted: false,
    site_roots: siteRoots,
    site_count: siteRoots.length,
    duplicate_group_count: duplicateGroups.length,
    duplicate_entry_count: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
    site_owned_entry_count: siteOwnedEntries.length,
    manifest_errors: manifestErrors,
    cutover_candidates: candidates.slice(0, limit),
    site_owned_burden_candidates: chooseSiteOwnedBurdenCandidates(siteOwnedEntries).slice(0, limit),
    duplicate_groups: duplicateGroups.slice(0, limit),
    duplicate_groups_truncated: duplicateGroups.length > limit,
  };
  const lines = [
    `tool-surface duplicate audit: ${result.status}`,
    `sites: ${siteRoots.length}`,
    `duplicate_groups: ${result.duplicate_group_count}`,
    `duplicate_entries: ${result.duplicate_entry_count}`,
    `site_owned_entries: ${result.site_owned_entry_count}`,
    ...(
      result.cutover_candidates.length > 0
        ? result.cutover_candidates.slice(0, 5).map((candidate) =>
          `duplicate candidate: ${candidate.surface ?? 'site-tools'} (${candidate.duplicate_entry_count} entries, ${candidate.duplicate_group_count} groups)`)
        : result.site_owned_burden_candidates.slice(0, 5).map((candidate) =>
          `burden candidate: ${candidate.surface ?? 'site-tools'} (${candidate.entry_count} entries, ${candidate.site_count} sites)`)
    ),
  ];
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, lines, (options.format ?? 'auto') as CliFormat),
  };
}

function normalizeNativePath(pathValue: string): string {
  return win32.normalize(pathValue).replace(/[\\/]+$/, '').toLowerCase();
}

function normalizeGitRemoteUrl(url: string): string {
  return url.trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
}

async function runGit(siteRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: siteRoot, windowsHide: true });
  return stdout.trim();
}

async function runGh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, { windowsHide: true });
  return stdout.trim();
}

async function sitesClientDoctorCommand(
  siteId: string,
  options: SitesDoctorOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const checks: SiteDoctorCheck[] = [];
  const inputRoot = resolve(options.root ?? '.');
  const siteRoot = containedSiteRootFromInput(inputRoot);
  const workspaceRoot = workspaceRootFromContainedInput(inputRoot, siteRoot);
  const configPath = join(siteRoot, 'config.json');
  let config: Record<string, unknown> | null = null;

  if (existsSync(siteRoot)) {
    addCheck(checks, 'client_site_root_exists', 'pass', `Client Site root exists: ${siteRoot}`);
  } else {
    addCheck(checks, 'client_site_root_exists', 'fail', `Client Site root is missing: ${siteRoot}`, 'Run narada sites bootstrap-client --workspace <path> --execute');
  }

  const misplacedGovernance = ['config.json', 'AGENTS.md', 'README.md', '.ai']
    .map((entry) => join(workspaceRoot, entry))
    .filter((pathValue) => existsSync(pathValue));
  addCheck(
    checks,
    'client_workspace_containment',
    misplacedGovernance.length === 0 ? 'pass' : 'warn',
    misplacedGovernance.length === 0
      ? `Visible workspace root is free of Narada governance artifacts; Site root is ${siteRoot}`
      : `Visible workspace root contains Narada-looking governance artifacts outside .narada: ${misplacedGovernance.join(', ')}`,
    'Move Narada governance under <workspace>/.narada or explicitly admit the root-level artifacts.',
  );

  if (existsSync(configPath)) {
    addCheck(checks, 'config_exists', 'pass', `Config exists: ${configPath}`);
    try {
      config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
      addCheck(checks, 'config_parse', 'pass', 'Config parses as JSON');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addCheck(checks, 'config_parse', 'fail', `Config is not valid JSON: ${message}`);
    }
  } else {
    addCheck(checks, 'config_exists', 'fail', `Config is missing: ${configPath}`, 'Run narada sites bootstrap-client --workspace <path> --execute');
  }

  if (config) {
    const configSiteId = configSiteField(config, 'site_id');
    const configSiteKind = configSiteField(config, 'site_kind');
    const configWorkspaceRoot = configSiteField(config, 'workspace_root');
    const posture = configSyncPosture(config);
    addCheck(
      checks,
      'config_site_id',
      configSiteId === siteId ? 'pass' : 'fail',
      configSiteId === siteId ? `Config site_id matches ${siteId}` : `Config site_id is ${String(configSiteId)}, expected ${siteId}`,
    );
    addCheck(
      checks,
      'site_kind',
      configSiteKind === 'client_service' ? 'pass' : 'fail',
      configSiteKind === 'client_service' ? 'Site kind is client_service' : `Site kind is ${String(configSiteKind)}, expected client_service`,
    );
    addCheck(
      checks,
      'workspace_root',
      normalizeNativePath(String(configWorkspaceRoot)) === normalizeNativePath(workspaceRoot) ? 'pass' : 'warn',
      normalizeNativePath(String(configWorkspaceRoot)) === normalizeNativePath(workspaceRoot) ? `Workspace root matches ${workspaceRoot}` : `Workspace root is ${String(configWorkspaceRoot)}, inspected root is ${workspaceRoot}`,
    );
    const sync = config.sync as { posture?: string; onedrive_safe?: boolean } | undefined;
    addCheck(
      checks,
      'durability_posture',
      posture === 'onedrive_non_git' || posture === 'local_non_git' ? 'pass' : 'fail',
      posture ? `Sync posture is ${posture}` : 'Sync posture is missing',
      'Use onedrive_non_git or local_non_git for client Site bootstrap',
    );
    if (workspaceRoot.toLowerCase().includes('onedrive')) {
      addCheck(
        checks,
        'onedrive_non_git_posture',
        posture === 'onedrive_non_git' && (sync?.onedrive_safe === true || config.site) ? 'pass' : 'fail',
        posture === 'onedrive_non_git' ? 'OneDrive workspace has explicit non-Git posture' : 'OneDrive workspace should use onedrive_non_git posture',
      );
    }
  }

  for (const directory of CLIENT_SITE_DIRECTORIES) {
    const pathValue = join(siteRoot, directory);
    addCheck(
      checks,
      `dir_${directory.replace(/[^a-z0-9]+/gi, '_')}`,
      existsSync(pathValue) ? 'pass' : 'fail',
      existsSync(pathValue) ? `Directory exists: ${pathValue}` : `Directory is missing: ${pathValue}`,
    );
  }

  for (const file of CLIENT_SITE_GUIDANCE_FILES) {
    const pathValue = join(siteRoot, file);
    addCheck(
      checks,
      `file_${file.replace(/[^a-z0-9]+/gi, '_')}`,
      existsSync(pathValue) ? 'pass' : 'fail',
      existsSync(pathValue) ? `File exists: ${pathValue}` : `File is missing: ${pathValue}`,
    );
  }

  addDelegatedCliEmbodimentCheck(checks, siteRoot);
  await addSiteToolSurfaceChecks(checks, siteRoot);
  await addMcpFreshnessChecks(checks, siteRoot);

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');
  const health = failed.length > 0 ? 'failed' : warned.length > 0 ? 'warning' : 'passed';

  if (fmt.getFormat() === 'human') {
    fmt.section(`Client Site Doctor - ${siteId}`);
    fmt.kv('Workspace', workspaceRoot);
    fmt.kv('Site Root', siteRoot);
    fmt.kv('Health', health);
    for (const check of checks) {
      fmt.message(`${siteDoctorPrefix(check.status)} ${check.name}: ${check.message}`, siteDoctorMessageKind(check.status));
      if (check.remediation && options.verbose) {
        fmt.message(`  remediation: ${check.remediation}`, 'info');
      }
    }
  }

  return {
    exitCode: failed.length > 0 ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: {
      status: health,
      siteId,
      site_kind: 'client_service',
      workspace_root: workspaceRoot,
      site_root: siteRoot,
      readiness: await assessSiteReadiness({ site: siteRoot, role: 'architect' }),
      checks,
    },
  };
}

async function sitesProjectDoctorCommand(
  siteId: string,
  options: SitesDoctorOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const checks: SiteDoctorCheck[] = [];
  const inputRoot = resolve(options.root ?? '.');
  const siteRoot = containedSiteRootFromInput(inputRoot);
  const workspaceRoot = workspaceRootFromContainedInput(inputRoot, siteRoot);
  const configPath = join(siteRoot, 'config.json');
  let config: Record<string, unknown> | null = null;

  addCheck(
    checks,
    'project_workspace_exists',
    existsSync(workspaceRoot) ? 'pass' : 'fail',
    existsSync(workspaceRoot) ? `Project workspace exists: ${workspaceRoot}` : `Project workspace is missing: ${workspaceRoot}`,
  );
  addCheck(
    checks,
    'project_git_root',
    existsSync(join(workspaceRoot, '.git')) ? 'pass' : 'warn',
    existsSync(join(workspaceRoot, '.git')) ? 'Project workspace has a .git directory' : 'Project workspace has no .git directory; git_backed_project_repo posture may be wrong',
  );
  addCheck(
    checks,
    'project_site_root_exists',
    existsSync(siteRoot) ? 'pass' : 'fail',
    existsSync(siteRoot) ? `Project Site root exists: ${siteRoot}` : `Project Site root is missing: ${siteRoot}`,
    'Run narada sites bootstrap-project --workspace <path> --execute',
  );

  if (existsSync(configPath)) {
    addCheck(checks, 'config_exists', 'pass', `Config exists: ${configPath}`);
    try {
      config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
      addCheck(checks, 'config_parse', 'pass', 'Config parses as JSON');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addCheck(checks, 'config_parse', 'fail', `Config is not valid JSON: ${message}`);
    }
  } else {
    addCheck(checks, 'config_exists', 'fail', `Config is missing: ${configPath}`, 'Run narada sites bootstrap-project --workspace <path> --execute');
  }

  if (config) {
    const configSiteId = configSiteField(config, 'site_id');
    const configSiteKind = configSiteField(config, 'site_kind');
    const configWorkspaceRoot = configSiteField(config, 'workspace_root');
    const posture = configSyncPosture(config);
    addCheck(
      checks,
      'config_site_id',
      configSiteId === siteId ? 'pass' : 'fail',
      configSiteId === siteId ? `Config site_id matches ${siteId}` : `Config site_id is ${String(configSiteId)}, expected ${siteId}`,
    );
    addCheck(
      checks,
      'site_kind',
      configSiteKind === 'project' ? 'pass' : 'fail',
      configSiteKind === 'project' ? 'Site kind is project' : `Site kind is ${String(configSiteKind)}, expected project`,
    );
    addCheck(
      checks,
      'workspace_root',
      normalizeNativePath(String(configWorkspaceRoot)) === normalizeNativePath(workspaceRoot) ? 'pass' : 'warn',
      normalizeNativePath(String(configWorkspaceRoot)) === normalizeNativePath(workspaceRoot) ? `Workspace root matches ${workspaceRoot}` : `Workspace root is ${String(configWorkspaceRoot)}, inspected root is ${workspaceRoot}`,
    );
    addCheck(
      checks,
      'project_sync_posture',
      posture === 'git_backed_project_repo' ? 'pass' : 'fail',
      posture ? `Sync posture is ${posture}` : 'Sync posture is missing',
      'Use git_backed_project_repo for contained project Site bootstrap',
    );
  }

  for (const directory of CLIENT_SITE_DIRECTORIES) {
    const pathValue = join(siteRoot, directory);
    addCheck(
      checks,
      `dir_${directory.replace(/[^a-z0-9]+/gi, '_')}`,
      existsSync(pathValue) ? 'pass' : 'fail',
      existsSync(pathValue) ? `Directory exists: ${pathValue}` : `Directory is missing: ${pathValue}`,
    );
  }

  for (const file of CLIENT_SITE_GUIDANCE_FILES) {
    const pathValue = join(siteRoot, file);
    addCheck(
      checks,
      `file_${file.replace(/[^a-z0-9]+/gi, '_')}`,
      existsSync(pathValue) ? 'pass' : 'fail',
      existsSync(pathValue) ? `File exists: ${pathValue}` : `File is missing: ${pathValue}`,
    );
  }

  addDelegatedCliEmbodimentCheck(checks, siteRoot);
  await addSiteToolSurfaceChecks(checks, siteRoot);
  await addMcpFreshnessChecks(checks, siteRoot);

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');
  const health = failed.length > 0 ? 'failed' : warned.length > 0 ? 'warning' : 'passed';

  if (fmt.getFormat() === 'human') {
    fmt.section(`Project Site Doctor - ${siteId}`);
    fmt.kv('Workspace', workspaceRoot);
    fmt.kv('Site Root', siteRoot);
    fmt.kv('Health', health);
    for (const check of checks) {
      fmt.message(`${siteDoctorPrefix(check.status)} ${check.name}: ${check.message}`, siteDoctorMessageKind(check.status));
      if (check.remediation && options.verbose) {
        fmt.message(`  remediation: ${check.remediation}`, 'info');
      }
    }
  }

  return {
    exitCode: failed.length > 0 ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: {
      status: health,
      siteId,
      site_kind: 'project',
      workspace_root: workspaceRoot,
      site_root: siteRoot,
      readiness: await assessSiteReadiness({ site: siteRoot, role: 'architect' }),
      checks,
    },
  };
}

export async function sitesDoctorCommand(
  siteId: string,
  options: SitesDoctorOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (options.kind === 'client') {
    return sitesClientDoctorCommand(siteId, options);
  }
  if (options.kind === 'project') {
    return sitesProjectDoctorCommand(siteId, options);
  }

  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const checks: SiteDoctorCheck[] = [];
  const validSyncPostures = new Set([
    'local_only',
    'cloud_synced_folder',
    'git_backed',
    'hybrid',
    'hybrid_capable_plain_folder',
  ]);

  let siteRoot = options.root;
  let config: Record<string, unknown> | null = null;
  let authorityLocus = options.authorityLocus;

  try {
    const {
      resolveWindowsSiteRootByLocus,
      resolveRegistryDbPathByLocus,
      openRegistryDb,
      SiteRegistry,
    } = await import('@narada2/windows-site');

    if (!siteRoot) {
      siteRoot = resolveWindowsSiteRootByLocus({
        siteId,
        variant: 'native',
        authorityLocus: (authorityLocus ?? 'user') as 'user' | 'pc',
      });
    }

    if (existsSync(siteRoot)) {
      addCheck(checks, 'root_exists', 'pass', `Site root exists: ${siteRoot}`);
    } else {
      addCheck(checks, 'root_exists', 'fail', `Site root is missing: ${siteRoot}`, `Run narada sites init ${siteId} --substrate windows-native --authority-locus ${authorityLocus ?? 'user'}`);
    }

    const configPath = win32.join(siteRoot, 'config.json');
    if (existsSync(configPath)) {
      addCheck(checks, 'config_exists', 'pass', `Config exists: ${configPath}`);
      try {
        config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
        addCheck(checks, 'config_parse', 'pass', 'Config parses as JSON');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addCheck(checks, 'config_parse', 'fail', `Config is not valid JSON: ${message}`);
      }
    } else {
      addCheck(checks, 'config_exists', 'fail', `Config is missing: ${configPath}`, `Run narada sites init ${siteId} --substrate windows-native --authority-locus ${authorityLocus ?? 'user'}`);
    }

    if (config) {
      const configSiteId = config.site_id;
      if (configSiteId === siteId) {
        addCheck(checks, 'config_site_id', 'pass', `Config site_id matches ${siteId}`);
      } else {
        addCheck(checks, 'config_site_id', 'fail', `Config site_id is ${String(configSiteId)}, expected ${siteId}`);
      }

      const locus = config.locus as { authority_locus?: string } | undefined;
      authorityLocus = authorityLocus ?? locus?.authority_locus;
      if (locus?.authority_locus === 'user' || locus?.authority_locus === 'pc') {
        addCheck(checks, 'authority_locus', 'pass', `Authority locus is ${locus.authority_locus}`);
      } else {
        addCheck(checks, 'authority_locus', 'warn', 'Config does not declare a Windows authority locus', 'Add locus.authority_locus as user or pc');
      }

      const origin = config.origin as { lineage_event_ref?: string; lineage_event_path?: string } | undefined;
      const lineagePath = origin?.lineage_event_path
        ? win32.isAbsolute(origin.lineage_event_path)
          ? origin.lineage_event_path
          : win32.join(siteRoot, origin.lineage_event_path)
        : null;
      if (origin?.lineage_event_ref && lineagePath && existsSync(lineagePath)) {
        addCheck(checks, 'origin_lineage_event', 'pass', `Origin lineage event exists: ${origin.lineage_event_ref}`);
      } else {
        addCheck(
          checks,
          'origin_lineage_event',
          'warn',
          'Site config does not reference a readable origin/build lineage event',
          'Create Sites through narada sites create or record a site.created lineage event and project its ref into config.origin',
        );
      }

      if (locus?.authority_locus === 'user') {
        const expectedRoot = resolveWindowsSiteRootByLocus({
          siteId,
          variant: 'native',
          authorityLocus: 'user',
        });
        if (
          normalizeNativePath(String(config.site_root)) === normalizeNativePath(expectedRoot)
          && normalizeNativePath(siteRoot) === normalizeNativePath(expectedRoot)
        ) {
          addCheck(checks, 'user_root_policy', 'pass', `User-locus root follows policy: ${expectedRoot}`);
        } else {
          addCheck(checks, 'user_root_policy', 'fail', `User-locus root should be ${expectedRoot}; config=${String(config.site_root)} root=${siteRoot}`);
        }

        const sync = config.sync as {
          posture?: string;
          git?: {
            remote_kind?: string;
            owner?: string;
            repo?: string;
            visibility?: string;
            remote_url?: string;
            remote_status?: string;
          };
        } | undefined;
        if (sync?.posture && validSyncPostures.has(sync.posture)) {
          addCheck(checks, 'sync_posture', 'pass', `Sync posture is ${sync.posture}`);
        } else {
          addCheck(checks, 'sync_posture', 'fail', 'User-locus Site has no valid sync posture', 'Set sync.posture to local_only, cloud_synced_folder, git_backed, hybrid, or hybrid_capable_plain_folder');
        }

        if (sync?.posture === 'git_backed') {
          const gitMetadata = sync.git;
          const gitDir = win32.join(siteRoot, '.git');
          if (existsSync(gitDir)) {
            addCheck(checks, 'git_root_exists', 'pass', `Git metadata exists: ${gitDir}`);
          } else {
            addCheck(checks, 'git_root_exists', 'fail', `Git metadata is missing: ${gitDir}`, 'Initialize Git at the Site root or change sync.posture');
          }

          try {
            const insideWorkTree = await runGit(siteRoot, ['rev-parse', '--is-inside-work-tree']);
            if (insideWorkTree === 'true') {
              addCheck(checks, 'git_work_tree', 'pass', 'Site root is inside a Git work tree');
            } else {
              addCheck(checks, 'git_work_tree', 'fail', 'Site root is not inside a Git work tree');
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            addCheck(checks, 'git_work_tree', 'fail', `Cannot inspect Git work tree: ${message}`);
          }

          try {
            const upstream = await runGit(siteRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
            addCheck(checks, 'git_upstream', 'pass', `Current branch tracks ${upstream}`);
          } catch {
            addCheck(checks, 'git_upstream', 'fail', 'Current branch has no upstream', 'Run git push -u origin <branch>');
          }

          try {
            const status = await runGit(siteRoot, ['status', '--porcelain']);
            if (status.length === 0) {
              addCheck(checks, 'git_working_tree_clean', 'pass', 'Git working tree is clean');
            } else {
              addCheck(checks, 'git_working_tree_clean', 'warn', 'Git working tree has uncommitted changes');
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            addCheck(checks, 'git_working_tree_clean', 'warn', `Cannot inspect Git status: ${message}`);
          }

          if (gitMetadata?.remote_url) {
            try {
              const originUrl = await runGit(siteRoot, ['config', '--get', 'remote.origin.url']);
              if (normalizeGitRemoteUrl(originUrl) === normalizeGitRemoteUrl(gitMetadata.remote_url)) {
                addCheck(checks, 'git_remote_url', 'pass', 'Git origin matches sync.git.remote_url');
              } else {
                addCheck(checks, 'git_remote_url', 'fail', `Git origin is ${originUrl}, expected ${gitMetadata.remote_url}`);
              }
            } catch {
              addCheck(checks, 'git_remote_url', 'fail', 'Git origin remote is missing', 'Set remote.origin.url or update sync.git.remote_url');
            }
          } else {
            addCheck(checks, 'git_remote_url', 'fail', 'sync.git.remote_url is missing for git_backed Site');
          }

          if (gitMetadata?.remote_status === 'active') {
            addCheck(checks, 'git_remote_status', 'pass', 'sync.git.remote_status is active');
          } else {
            addCheck(checks, 'git_remote_status', 'warn', `sync.git.remote_status is ${gitMetadata?.remote_status ?? 'missing'}`);
          }

          if (gitMetadata?.remote_kind === 'github' && gitMetadata.owner && gitMetadata.repo && gitMetadata.remote_status === 'active') {
            try {
              const repoJson = await runGh(['repo', 'view', `${gitMetadata.owner}/${gitMetadata.repo}`, '--json', 'isPrivate,url']);
              const repo = JSON.parse(repoJson) as { isPrivate?: boolean; url?: string };
              if (repo.isPrivate === true) {
                addCheck(checks, 'github_repo_private', 'pass', `GitHub repo is private: ${repo.url ?? `${gitMetadata.owner}/${gitMetadata.repo}`}`);
              } else {
                addCheck(checks, 'github_repo_private', 'warn', `GitHub repo is not private: ${repo.url ?? `${gitMetadata.owner}/${gitMetadata.repo}`}`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              addCheck(checks, 'github_repo_reachable', 'warn', `Cannot verify GitHub repo with gh: ${message}`);
            }
          }
        }
      }
    }

    const resolvedLocus = authorityLocus === 'pc' ? 'pc' : 'user';
    const registryPath = resolveRegistryDbPathByLocus({
      variant: 'native',
      authorityLocus: resolvedLocus,
    });
    if (existsSync(registryPath)) {
      addCheck(checks, 'registry_db_exists', 'pass', `Registry DB exists: ${registryPath}`);
      try {
        const db = await openRegistryDb(registryPath);
        const registry = new SiteRegistry(db);
        try {
          const registered = registry.getSite(siteId);
          if (registered) {
            addCheck(checks, 'registry_entry', 'pass', `Registry has Site ${siteId}`);
            if (normalizeNativePath(registered.siteRoot) === normalizeNativePath(siteRoot)) {
              addCheck(checks, 'registry_root_match', 'pass', 'Registry root matches Site root');
            } else {
              addCheck(checks, 'registry_root_match', 'fail', `Registry root is ${registered.siteRoot}, expected ${siteRoot}`);
            }
          } else {
            addCheck(checks, 'registry_entry', 'fail', `Registry DB does not contain ${siteId}`, 'Run narada sites discover or re-run sites init for this Site');
          }
        } finally {
          registry.close();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addCheck(checks, 'registry_readable', 'fail', `Registry DB is not readable: ${message}`);
      }
    } else {
      addCheck(checks, 'registry_db_exists', 'fail', `Registry DB is missing: ${registryPath}`, 'Run narada sites init or registry discovery for this locus');
    }

    const lifecycleDbPath = win32.join(siteRoot, '.ai', 'tasks', 'task-lifecycle.db');
    if (existsSync(lifecycleDbPath)) {
      addCheck(checks, 'task_lifecycle_db_exists', 'pass', `Task lifecycle DB exists: ${lifecycleDbPath}`);
      try {
        const { Database } = await import('@narada2/control-plane');
        const db = new Database(lifecycleDbPath);
        try {
          const rows = db.prepare("select name from sqlite_master where type = 'table' and name in ('task_lifecycle', 'task_number_sequence')").all() as Array<{ name: string }>;
          const names = new Set(rows.map((row) => row.name));
          if (names.has('task_lifecycle') && names.has('task_number_sequence')) {
            addCheck(checks, 'task_lifecycle_schema', 'pass', 'Task lifecycle schema is installed');
          } else {
            addCheck(checks, 'task_lifecycle_schema', 'fail', 'Task lifecycle DB is missing required tables');
          }
        } finally {
          db.close();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addCheck(checks, 'task_lifecycle_schema', 'fail', `Task lifecycle DB is not readable: ${message}`);
      }
    } else {
      addCheck(checks, 'task_lifecycle_db_exists', 'fail', `Task lifecycle DB is missing: ${lifecycleDbPath}`, 'Run narada sites init with current Windows User Site bootstrap');
    }
    if (siteRoot) {
      await addSiteToolSurfaceChecks(checks, siteRoot);
      await addMcpFreshnessChecks(checks, siteRoot);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addCheck(checks, 'doctor_runtime', 'fail', `Site doctor failed: ${message}`);
  }

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');
  const health = failed.length > 0 ? 'failed' : warned.length > 0 ? 'warning' : 'passed';

  if (fmt.getFormat() === 'human') {
    fmt.section(`Site Doctor — ${siteId}`);
    fmt.kv('Root', siteRoot ?? '-');
    fmt.kv('Health', health);
    for (const check of checks) {
      fmt.message(`${siteDoctorPrefix(check.status)} ${check.name}: ${check.message}`, siteDoctorMessageKind(check.status));
      if (check.remediation && options.verbose) {
        fmt.message(`  remediation: ${check.remediation}`, 'info');
      }
    }
  }

  return {
    exitCode: failed.length > 0 ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: {
      status: health,
      siteId,
      siteRoot,
      readiness: siteRoot ? await assessSiteReadiness({ site: siteRoot, role: 'architect' }) : null,
      checks,
    },
  };
}

// ---------------------------------------------------------------------------
// Site init
// ---------------------------------------------------------------------------

export interface SitesInitOptions extends SitesOptions {
  substrate?: string;
  operation?: string;
  root?: string;
  authorityLocus?: string;
  sync?: string;
  executionSurface?: string;
  dryRun?: boolean;
}

export interface SitesBootstrapClientOptions extends SitesOptions {
  workspace?: string;
  siteId?: string;
  sync?: string;
  execute?: boolean;
}

export interface SitesBootstrapProjectOptions extends SitesOptions {
  workspace?: string;
  siteId?: string;
  sync?: string;
  execute?: boolean;
}

export interface SitesBootstrapWindowsOptions extends SitesOptions {
  userSiteId?: string;
  pcSiteId?: string;
  sync?: string;
  executionSurface?: string;
  execute?: boolean;
}

interface WindowsOnboardingCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  authority_locus: 'windows_user' | 'windows_pc' | 'narada_proper';
  detail: string;
  unblock_command?: string;
  command_resolution?: {
    status: 'found' | 'missing' | 'ambiguous' | 'unknown';
    command: string | null;
    candidates: string[];
    probe: string;
  };
  semantic_readiness?: {
    status: 'ready' | 'not_ready' | 'unknown';
    reason: string;
  };
}

type WindowsToolCommandResolution = NonNullable<WindowsOnboardingCheck['command_resolution']>;

const CLIENT_SITE_DIRECTORIES = [
  'chapters',
  'tasks',
  'decisions',
  'kb',
  'observations',
  'friction',
  'requests',
  join('.ai', 'inbox-drop'),
  join('.ai', 'inbox-envelopes'),
] as const;

const CLIENT_SITE_GUIDANCE_FILES = [
  'README.md',
  'AGENTS.md',
  join('.ai', 'inbox-drop', '.gitkeep'),
  join('.ai', 'inbox-envelopes', '.gitkeep'),
] as const;

function clientSiteIdFromWorkspace(workspaceRoot: string): string {
  const base = workspaceRoot.split(/[\\/]+/).filter(Boolean).at(-1) ?? 'client-site';
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client-site';
}

function clientSiteRootFromWorkspace(workspaceRoot: string): string {
  return join(workspaceRoot, '.narada');
}

type BootstrapRole = 'architect' | 'builder' | 'observer';

function normalizeBootstrapRole(role?: string): BootstrapRole | null {
  if (role === 'architect' || role === 'builder' || role === 'observer') {
    return role;
  }
  return null;
}

function bootstrapSectionTitle(role: BootstrapRole): string {
  if (role === 'architect') return 'Architect Thread Bootstrap';
  if (role === 'builder') return 'Builder Thread Bootstrap';
  return 'Observer Thread Bootstrap';
}

function extractMarkdownSection(markdown: string, sectionTitle: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${sectionTitle}`);
  if (start === -1) {
    return null;
  }

  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) {
      break;
    }
    body.push(line);
  }

  return body.join('\n').trim();
}

async function resolveSiteRootForBootstrap(siteIdOrRoot: string): Promise<{
  siteId: string | null;
  siteRoot: string;
  configPath: string;
  agentsPath: string;
}> {
  const directRoot = resolve(siteIdOrRoot);
  const directAgentsPath = join(directRoot, 'AGENTS.md');
  if (existsSync(directAgentsPath)) {
    return {
      siteId: null,
      siteRoot: directRoot,
      configPath: join(directRoot, 'config.json'),
      agentsPath: directAgentsPath,
    };
  }

  const containedRoot = join(directRoot, '.narada');
  const containedAgentsPath = join(containedRoot, 'AGENTS.md');
  if (existsSync(containedAgentsPath)) {
    return {
      siteId: null,
      siteRoot: containedRoot,
      configPath: join(containedRoot, 'config.json'),
      agentsPath: containedAgentsPath,
    };
  }

  const registry = await openRegistry();
  try {
    const site = registry.getSite(siteIdOrRoot);
    if (site) {
      return {
        siteId: site.siteId,
        siteRoot: site.siteRoot,
        configPath: join(site.siteRoot, 'config.json'),
        agentsPath: join(site.siteRoot, 'AGENTS.md'),
      };
    }
  } finally {
    registry.close();
  }

  throw new Error(`Site not found or missing AGENTS.md: ${siteIdOrRoot}`);
}

function siteAgentsContract(args: {
  siteId: string;
  siteKind: string;
  workspaceRoot?: string;
  siteRoot: string;
  authorityLocus?: string;
  syncPosture?: string;
  ownershipSummary: string;
  nonAuthoritySummary: string;
  extraRules?: string[];
}): string {
  const lines = [
    `# AGENTS.md - ${args.siteId} ${args.siteKind} Site`,
    '',
    '## Common Site Identity',
    '',
    'You are either `architect`, `builder`, or `observer`, as assigned by the Operator.',
    'The human is `Operator`.',
    'The Site value-producing inhabitant role is `resident` unless the Site config declares a narrower domain name.',
    'This Site is governed by Narada law.',
    '',
    '## Target Locus',
    '',
    ...(args.workspaceRoot ? [`workspace_root: ${args.workspaceRoot}`] : []),
    `site_root: ${args.siteRoot}`,
    `site_kind: ${args.siteKind}`,
    ...(args.authorityLocus ? [`authority_locus: ${args.authorityLocus}`] : []),
    ...(args.syncPosture ? [`sync_posture: ${args.syncPosture}`] : []),
    '',
    '## Site Authority',
    '',
    args.ownershipSummary,
    '',
    args.nonAuthoritySummary,
    '',
    '## Site Participant Roles',
    '',
    '- `resident` lives in or uses the Site to produce the Site\'s intended value. Resident is not a synonym for Operator authority.',
    '- `architect` specifies topology, doctrine fit, acceptance criteria, and review posture.',
    '- `builder` executes approved construction work and reports evidence.',
    '- `observer` watches Narada law, Aim, authority-boundary, and inhabited-evolution coherence without building or lifecycle-reviewing tasks.',
    '- Additional roles require explicit Site config and capability/admission rules before use.',
    '- A declared role, runtime, or embodiment does not grant capability, mutation authority, or evidence admission by itself.',
    '',
    '## Operator Surface Self-Binding',
    '',
    'If this thread is inhabiting an Operator Surface, first attempt:',
    '',
    '```bash',
    'narada operator-surface bind-focused --as self',
    '```',
    '',
    'If Narada proper returns a runtime-locus deferral, route the deferred binding to the owning User/PC/runtime Site. Do not guess volatile window, process, terminal, API-thread, or MCP-client identity.',
    '',
    'Operator Surface labels are observations, not addressable bindings. Identity admission proves that a durable identity exists; it does not prove that input can be sent. Cross-Site message routing must use an explicit Site-qualified recipient such as `<site>.builder`, or a bare role only inside a declared current Site plane.',
    '',
    '## Architect Thread Bootstrap',
    '',
    'You are `architect`.',
    '',
    '- Interpret Operator pressure into governed work packages.',
    '- Preserve Narada doctrine, topology, authority boundaries, and Site-local law.',
    '- Draft or refine specs, acceptance criteria, task shape, and review posture.',
    '- Inspect task, inbox, lifecycle, and evidence posture before proposing construction.',
    '- Do not become builder merely because execution is convenient.',
    '- Do not grant yourself Operator authority or admit consequences outside the configured evidence path.',
    '',
    'Default first actions: read this contract, identify the target locus, inspect current task/inbox/evidence posture, formulate or refine the governed work package, and name acceptance criteria before construction.',
    '',
    '## Builder Thread Bootstrap',
    '',
    'You are `builder`.',
    '',
    '- Execute approved local work packages within their accepted scope.',
    '- Choose means and methods inside the approved spec.',
    '- Run verification and preserve evidence before reporting completion.',
    '- Report changed files, verification, residuals, blockers, and field conditions.',
    '- Do not silently redesign doctrine, widen scope, or expand the active role set.',
    '- Do not admit or close your own work without evidence and the configured review path.',
    '',
    'Default first actions: read this contract, confirm the assigned task and acceptance criteria, inspect the minimum implementation context needed, execute the approved work, verify, and report evidence.',
    '',
    '## Observer Thread Bootstrap',
    '',
    'You are `observer`.',
    '',
    '- Observe whether Site work preserves Narada law, Aim, authority boundaries, and inhabited-evolution discipline.',
    '- Run only read-only coherence, inbox, workboard, evidence, and doctrine inspection commands unless the Operator grants a bounded mutation path.',
    '- Submit bounded observations, proposals, or appeal/grievance filings when you detect incoherence.',
    '- Do not build, assign, implement, review, accept, reject, close, or mutate tasks.',
    '- Do not silently repair the incoherence you observe.',
    '',
    'Default first actions: read this contract, identify the target locus, inspect current inbox/workboard/coherence posture in read-only mode, and report or route bounded findings without lifecycle review.',
    '',
    '## Standing Rules',
    '',
    '- Treat this file as the Site-local execution contract for fresh Architect, Builder, and Observer threads.',
    '- Do not infer authority from the current shell, clone, process, MCP facade, path, or convenience surface.',
    '- Do not mutate outside the declared authority locus without a governed crossing.',
    '- Use canonical inbox, task, lifecycle, command, evidence, and publication surfaces instead of direct state edits.',
    '- Intelligence proposes and constructs; authority admits consequence.',
    '- If blocked, record an observation, residual, or task proposal instead of inventing authority.',
    '- Keep Narada proper doctrine, User Site memory, PC recovery authority, client artifacts, project code, and external capabilities separate unless explicitly admitted.',
    ...(args.extraRules ?? []),
    '',
    '## Intake',
    '',
    '- Use `.ai/inbox-drop` for human-authored inbound messages.',
    '- Use `.ai/inbox-envelopes` for canonical exported envelopes.',
    '- Incoming material is inert until admitted by this Site authority.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function siteGovernanceCoordinates(args: {
  siteId: string;
  siteKind: 'client_service' | 'project';
  workspaceRoot: string;
  siteRoot: string;
  syncPosture: string;
}): Record<string, unknown> {
  return {
    governing_law_source: {
      source_site_id: 'narada-proper',
      law_artifacts: [
        'AGENTS.md',
        'SEMANTICS.md',
        'docs/product/site-factorization.md',
        'docs/product/site-bootstrap-contract.md',
      ],
      mode: 'inherited',
      admission: 'declared',
    },
    law_admission_mode: 'local_overlay',
    authority_locus: {
      locus_kind: args.siteKind,
      authority_site_id: args.siteId,
      mutation_policy: 'direct_only_at_locus',
    },
    embodiments: [
      {
        embodiment_id: 'contained-site-root',
        role: 'authority',
        root: args.siteRoot,
        substrate: 'filesystem',
        mutation_policy: 'may_mutate_at_authority_locus',
      },
      {
        embodiment_id: 'visible-workspace',
        role: 'read_only',
        root: args.workspaceRoot,
        substrate: 'filesystem',
        mutation_policy: 'read_only',
      },
    ],
    site_participant_roles: [
      {
        role_id: 'resident',
        role_class: 'resident',
        status: 'active',
        purpose: 'Use the Site to produce its intended value and surface lived operational friction.',
        runtime_kind: 'human',
        authority_posture: 'value_use',
      },
      {
        role_id: 'architect',
        role_class: 'architect',
        status: 'active',
        purpose: 'Specify governed work, preserve topology and doctrine, and frame review posture.',
        runtime_kind: 'codex_cli',
        authority_posture: 'specification',
      },
      {
        role_id: 'builder',
        role_class: 'builder',
        status: 'active',
        purpose: 'Execute approved local construction work packages and report verification evidence.',
        runtime_kind: 'codex_cli',
        authority_posture: 'construction',
      },
    ],
    operator_surfaces: [],
    session_bindings: [],
    mutation_evidence_locus: {
      kind: args.syncPosture === 'git_backed_project_repo' ? 'git' : 'filesystem',
      path: args.siteRoot,
      required: true,
    },
    inbox_sources: [
      {
        source_id: 'canonical-file-drop',
        kind: 'file_drop',
        path: join(args.siteRoot, '.ai', 'inbox-drop'),
        admission: 'inert_until_promoted',
      },
    ],
    outbox_targets: [
      {
        target_id: 'canonical-envelope-export',
        kind: 'git_export',
        authority: 'handoff_only',
      },
    ],
    effect_authority_policy: 'metadata_only',
    capability_grants: [],
    doctrine_imports: [],
    lineage_source: {
      kind: 'operator_declaration',
      path: join(args.siteRoot, 'config.json'),
    },
    readiness_phase: 'bootstrap',
    operator_identity: {
      principal_id: 'operator',
      role: 'Operator',
    },
    agent_identity_contract: {
      default_agent_name: 'architect',
      operator_label: 'Operator',
      contract_path: join(args.siteRoot, 'AGENTS.md'),
      compatibility: 'legacy shorthand for agent_role_contracts.architect',
    },
    agent_role_contracts: {
      admitted_roles: ['architect', 'builder', 'observer'],
      architect: {
        role_id: 'architect',
        bootstrap_contract: {
          path: join(args.siteRoot, 'AGENTS.md'),
          section: 'Architect Thread Bootstrap',
        },
        default_first_actions: [
          'read_site_contract',
          'identify_target_locus',
          'inspect_task_inbox_evidence_posture',
          'formulate_or_refine_spec_and_acceptance_criteria',
        ],
        authority_limits: [
          'does_not_inherit_operator_authority',
          'does_not_execute_by_convenience',
          'uses_sanctioned_mutation_surfaces_only',
        ],
        handoff_obligations: [
          'produce_governed_work_package',
          'name_acceptance_criteria',
          'review_or_admit_only_through_configured_evidence_path',
        ],
      },
      builder: {
        role_id: 'builder',
        bootstrap_contract: {
          path: join(args.siteRoot, 'AGENTS.md'),
          section: 'Builder Thread Bootstrap',
        },
        default_first_actions: [
          'read_site_contract',
          'confirm_assigned_task_and_acceptance_criteria',
          'inspect_minimum_required_implementation_context',
          'execute_approved_work_package',
          'run_verification',
        ],
        authority_limits: [
          'does_not_redesign_by_convenience',
          'does_not_admit_own_work_without_evidence',
          'does_not_expand_active_role_set',
        ],
        handoff_obligations: [
          'report_changed_files',
          'report_verification',
          'report_residuals_and_blockers',
          'return_field_conditions_to_architect_or_operator',
        ],
      },
      observer: {
        role_id: 'observer',
        bootstrap_contract: {
          path: join(args.siteRoot, 'AGENTS.md'),
          section: 'Observer Thread Bootstrap',
        },
        default_first_actions: [
          'read_site_contract',
          'identify_target_locus',
          'inspect_inbox_workboard_coherence_posture_read_only',
          'report_or_route_bounded_findings_without_lifecycle_review',
        ],
        authority_limits: [
          'does_not_build',
          'does_not_lifecycle_review_tasks',
          'does_not_assign_or_close_tasks',
          'does_not_mutate_implementation_state',
        ],
        handoff_obligations: [
          'submit_observation_proposal_or_appeal_when_incoherence_is_detected',
          'keep_observation_distinct_from_task_review',
          'route_construction_need_to_architect_or_builder_path',
        ],
      },
    },
    local_overlays: [
      {
        overlay_id: 'site-local-agents-contract',
        path: join(args.siteRoot, 'AGENTS.md'),
        admission: 'site_local',
      },
    ],
    federation_policy: {
      posture: 'receive_only',
      admission: 'local_admission_required',
    },
  };
}

function clientSiteConfig(args: {
  siteId: string;
  workspaceRoot: string;
  siteRoot: string;
  sync: string;
}): Record<string, unknown> {
  return {
    site_id: args.siteId,
    site_kind: 'client_service',
    workspace_root: args.workspaceRoot,
    site_root: args.siteRoot,
    config_path: join(args.siteRoot, 'config.json'),
    locus: {
      authority_locus: 'client_service',
      visible_workspace_root: args.workspaceRoot,
      governance_root: args.siteRoot,
    },
    sync: {
      posture: args.sync,
      git_initialized: false,
      onedrive_safe: args.sync === 'onedrive_non_git' || args.workspaceRoot.toLowerCase().includes('onedrive'),
    },
    inbox: {
      drop_dir: join(args.siteRoot, '.ai', 'inbox-drop'),
      envelope_export_dir: join(args.siteRoot, '.ai', 'inbox-envelopes'),
      adapter: 'canonical_file_drop',
    },
    durability: {
      visible_workspace_preserved: true,
      runtime_state_git_ignored: true,
      empty_directory_markers: '.gitkeep',
    },
    governance: siteGovernanceCoordinates({
      siteId: args.siteId,
      siteKind: 'client_service',
      workspaceRoot: args.workspaceRoot,
      siteRoot: args.siteRoot,
      syncPosture: args.sync,
    }),
  };
}

function projectSiteConfig(args: {
  siteId: string;
  workspaceRoot: string;
  siteRoot: string;
  sync: string;
}): Record<string, unknown> {
  return {
    site_id: args.siteId,
    site_kind: 'project',
    workspace_root: args.workspaceRoot,
    site_root: args.siteRoot,
    config_path: join(args.siteRoot, 'config.json'),
    locus: {
      authority_locus: 'project',
      project_workspace_root: args.workspaceRoot,
      governance_root: args.siteRoot,
    },
    sync: {
      posture: args.sync,
      git_initialized: args.sync === 'git_backed_project_repo',
      repository_root: args.workspaceRoot,
    },
    inbox: {
      drop_dir: join(args.siteRoot, '.ai', 'inbox-drop'),
      envelope_export_dir: join(args.siteRoot, '.ai', 'inbox-envelopes'),
      adapter: 'canonical_file_drop',
    },
    durability: {
      visible_workspace_preserved: true,
      governance_contained_in_dot_narada: true,
      project_artifacts_external_until_admitted: true,
    },
    governance: siteGovernanceCoordinates({
      siteId: args.siteId,
      siteKind: 'project',
      workspaceRoot: args.workspaceRoot,
      siteRoot: args.siteRoot,
      syncPosture: args.sync,
    }),
  };
}

const VALID_SUBSTRATES = [
  'windows-native',
  'windows-wsl',
  'macos',
  'linux-user',
  'linux-system',
];

const VALID_EXECUTION_SURFACES = [
  'windows_native',
  'wsl_assisted',
  'wsl_native',
  'linux_user',
  'linux_system',
  'macos_native',
] as const;

type ExecutionSurface = (typeof VALID_EXECUTION_SURFACES)[number];
type ExecutorRuntime = 'windows' | 'wsl' | 'linux' | 'macos' | 'other';

function detectExecutorRuntime(): ExecutorRuntime {
  const override = process.env.NARADA_EXECUTOR_RUNTIME;
  if (override === 'windows' || override === 'wsl' || override === 'linux' || override === 'macos' || override === 'other') {
    return override;
  }
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return 'wsl';
  if (process.platform === 'linux') return 'linux';
  return 'other';
}

function inferExecutionSurface(args: {
  substrate: string;
  authorityLocus?: string;
  explicit?: string;
}): {
  surface?: ExecutionSurface;
  executorRuntime: ExecutorRuntime;
  inferred: boolean;
  targetAuthorityLocus: string | null;
  rationale: string;
  error?: string;
} {
  const executorRuntime = detectExecutorRuntime();
  const targetAuthorityLocus =
    args.substrate === 'windows-native' || args.substrate === 'windows-wsl'
      ? `windows_${args.authorityLocus === 'pc' ? 'pc' : 'user'}`
      : args.substrate;

  if (args.explicit) {
    if (!VALID_EXECUTION_SURFACES.includes(args.explicit as ExecutionSurface)) {
      return {
        executorRuntime,
        inferred: false,
        targetAuthorityLocus,
        rationale: 'Explicit execution surface was invalid.',
        error: `Unsupported execution surface: "${args.explicit}". Valid surfaces: ${VALID_EXECUTION_SURFACES.join(', ')}`,
      };
    }
    return {
      surface: args.explicit as ExecutionSurface,
      executorRuntime,
      inferred: false,
      targetAuthorityLocus,
      rationale: `Execution surface explicitly set to ${args.explicit}.`,
    };
  }

  if ((args.substrate === 'windows-native' || args.substrate === 'windows-wsl') && executorRuntime === 'wsl') {
    return {
      surface: 'wsl_assisted',
      executorRuntime,
      inferred: true,
      targetAuthorityLocus,
      rationale: `Detected WSL executor targeting ${targetAuthorityLocus}; defaulting execution_surface=wsl_assisted while preserving target authority locus.`,
    };
  }

  if (args.substrate === 'windows-native' || args.substrate === 'windows-wsl') {
    return {
      surface: 'windows_native',
      executorRuntime,
      inferred: true,
      targetAuthorityLocus,
      rationale: `Executor runtime ${executorRuntime} targeting ${targetAuthorityLocus}; defaulting execution_surface=windows_native.`,
    };
  }

  if (args.substrate === 'linux-user' && executorRuntime === 'wsl') {
    return {
      surface: 'wsl_native',
      executorRuntime,
      inferred: true,
      targetAuthorityLocus,
      rationale: 'Detected WSL executor targeting a Linux/WSL user Site; defaulting execution_surface=wsl_native, not wsl_assisted.',
    };
  }

  if (args.substrate === 'linux-user') {
    return {
      surface: 'linux_user',
      executorRuntime,
      inferred: true,
      targetAuthorityLocus,
      rationale: `Executor runtime ${executorRuntime} targeting linux-user Site; defaulting execution_surface=linux_user.`,
    };
  }

  if (args.substrate === 'linux-system') {
    return {
      surface: executorRuntime === 'wsl' ? 'wsl_native' : 'linux_system',
      executorRuntime,
      inferred: true,
      targetAuthorityLocus,
      rationale: executorRuntime === 'wsl'
        ? 'Detected WSL executor targeting a Linux/WSL system Site; defaulting execution_surface=wsl_native, not wsl_assisted.'
        : `Executor runtime ${executorRuntime} targeting linux-system Site; defaulting execution_surface=linux_system.`,
    };
  }

  return {
    surface: 'macos_native',
    executorRuntime,
    inferred: true,
    targetAuthorityLocus,
    rationale: `Executor runtime ${executorRuntime} targeting macOS Site; defaulting execution_surface=macos_native.`,
  };
}

function windowsPathToWslPath(pathValue: string): string | null {
  const match = pathValue.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return null;
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/[\\/]+/g, '/');
  return `/mnt/${drive}/${rest}`;
}

function buildExecutionRecord(args: {
  execution: ReturnType<typeof inferExecutionSurface>;
  siteRoot: string;
  authorityLocus?: string;
}): Record<string, unknown> {
  const wslPath = args.execution.surface === 'wsl_assisted'
    ? windowsPathToWslPath(args.siteRoot)
    : null;
  return {
    surface: args.execution.surface,
    inferred: args.execution.inferred,
    executor_runtime: args.execution.executorRuntime,
    executor_root: resolve('.'),
    target_authority_locus: args.execution.targetAuthorityLocus,
    target_root: args.siteRoot,
    path_translation: args.execution.surface === 'wsl_assisted'
      ? {
          kind: wslPath ? 'windows_drive_to_wsl_mount' : 'unavailable',
          windows_path: args.siteRoot,
          wsl_path: wslPath,
        }
      : {
          kind: 'not_required',
          windows_path: null,
          wsl_path: null,
        },
    permission_posture: args.execution.targetAuthorityLocus === 'windows_pc'
      ? 'pc_locus_programdata_write_required'
      : args.execution.targetAuthorityLocus === 'windows_user'
        ? 'user_locus_profile_write_required'
        : 'substrate_local_write_required',
    mutation_evidence_locus: args.execution.surface === 'wsl_assisted'
      ? 'executor_wsl_repo_and_target_windows_site'
      : 'executor_local_site',
    rationale: args.execution.rationale,
  };
}

function inferWindowsUserProfileFromSiteRoot(siteRoot: string): string {
  const normalized = win32.normalize(siteRoot);
  const suffix = `${win32.sep}Narada`;
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : '';
}

export async function sitesInitCommand(
  siteId: string,
  options: SitesInitOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const substrate = options.substrate;

  // Validate substrate
  if (!substrate || !VALID_SUBSTRATES.includes(substrate)) {
    const validList = VALID_SUBSTRATES.join(', ');
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: `Unsupported substrate: "${substrate ?? ''}". Valid substrates: ${validList}`,
        remediation: `Choose one of: ${validList}`,
      },
    };
  }

  const dryRun = !!options.dryRun;
  const intervalMinutes = 5;
  const lockTtlMs = 310_000;
  const ceilingMs = 300_000;
  const validAuthorityLoci = ['user', 'pc'];
  const validSyncPostures = ['local_only', 'cloud_synced_folder', 'git_backed', 'hybrid', 'hybrid_capable_plain_folder'];
  const execution = inferExecutionSurface({
    substrate,
    authorityLocus: options.authorityLocus,
    explicit: options.executionSurface,
  });

  if (execution.error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: execution.error,
        remediation: `Choose one of: ${VALID_EXECUTION_SURFACES.join(', ')}`,
      },
    };
  }

  // Resolve site root and config per substrate
  let siteRoot: string;
  let configPath: string;
  let configContent: Record<string, unknown>;

  try {
    if (substrate === 'windows-native' || substrate === 'windows-wsl') {
      const variant = substrate === 'windows-native' ? 'native' : 'wsl';
      const {
        resolveWindowsSiteRootByLocus,
      } = await import('@narada2/windows-site');
      const authorityLocus = options.authorityLocus ?? 'user';
      if (!validAuthorityLoci.includes(authorityLocus)) {
        return {
          exitCode: ExitCode.INVALID_CONFIG,
          result: {
            status: 'error',
            error: `Unsupported authority locus: "${authorityLocus}". Valid loci: ${validAuthorityLoci.join(', ')}`,
            remediation: `Choose one of: ${validAuthorityLoci.join(', ')}`,
          },
        };
      }
      const syncPosture = options.sync ?? (authorityLocus === 'user' ? 'hybrid_capable_plain_folder' : undefined);
      if (syncPosture && !validSyncPostures.includes(syncPosture)) {
        return {
          exitCode: ExitCode.INVALID_CONFIG,
          result: {
            status: 'error',
            error: `Unsupported sync posture: "${syncPosture}". Valid postures: ${validSyncPostures.join(', ')}`,
            remediation: `Choose one of: ${validSyncPostures.join(', ')}`,
          },
        };
      }

      siteRoot = options.root ?? resolveWindowsSiteRootByLocus({
        siteId,
        variant,
        authorityLocus: authorityLocus as 'user' | 'pc',
      });
      const pathLib = variant === 'native' ? win32 : posix;
      configPath = pathLib.join(siteRoot, 'config.json');

      if (!dryRun) {
        await mkdir(siteRoot, { recursive: true });
        for (const subdir of SITE_SUBDIRECTORIES) {
          await mkdir(pathLib.join(siteRoot, subdir), { recursive: true });
        }
        await mkdir(join(siteRoot, '.ai'), { recursive: true });
        await mkdir(pathLib.join(siteRoot, '.ai', 'tasks'), { recursive: true });
        const taskStore = openTaskLifecycleStore(siteRoot);
        taskStore.db.close();
      }

      configContent = {
        site_id: siteId,
        variant,
        substrate,
        site_root: siteRoot,
        config_path: configPath,
        locus: authorityLocus === 'user'
          ? {
              authority_locus: 'user',
              principal: {
                windows_user_profile: process.env.USERPROFILE ?? inferWindowsUserProfileFromSiteRoot(siteRoot),
                username: process.env.USERNAME ?? process.env.USER ?? '',
              },
            }
          : {
              authority_locus: 'pc',
              machine: {
                hostname: process.env.COMPUTERNAME ?? '',
              },
              root_posture: variant === 'native' ? 'machine_owned' : 'user_owned_pc_site_prototype',
            },
        ...(syncPosture ? {
          sync: {
            posture: syncPosture,
            git_initialized: false,
            cloud_sync: 'external_if_configured',
          },
        } : {}),
        execution: buildExecutionRecord({ execution, siteRoot, authorityLocus }),
        cycle_interval_minutes: intervalMinutes,
        lock_ttl_ms: lockTtlMs,
        ceiling_ms: ceilingMs,
      };

      if (!dryRun) {
        await writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n', 'utf8');
        await writeFile(pathLib.join(siteRoot, 'AGENTS.md'), siteAgentsContract({
          siteId,
          siteKind: authorityLocus === 'pc' ? 'pc' : 'user',
          siteRoot,
          authorityLocus,
          syncPosture,
          ownershipSummary: authorityLocus === 'pc'
            ? 'This Site owns PC-locus governance, machine/session recovery memory, local diagnostics, recovery tools, and PC-scoped observations inside `site_root`.'
            : 'This Site owns user-locus governance, Operator memory, preferences, user-scoped tool policy, inbox intake, observations, decisions, tasks, chapters, KB, and requests inside `site_root`.',
          nonAuthoritySummary: authorityLocus === 'pc'
            ? 'This Site does not own Operator personal memory, project governance, Narada proper doctrine, or external capabilities unless explicitly admitted through governed crossings.'
            : 'This Site does not own PC recovery authority, project governance, Narada proper doctrine, client artifacts, or external capabilities unless explicitly admitted through governed crossings.',
        }), 'utf8');

        // Register in Windows SiteRegistry
        const registry = await openRegistry();
        try {
          registry.registerSite({
            siteId,
            variant,
            siteRoot,
            substrate: substrate === 'windows-native' ? 'windows-native' : 'windows-wsl',
            aimJson: options.operation ?? null,
            controlEndpoint: null,
            lastSeenAt: null,
            createdAt: new Date().toISOString(),
          });
        } finally {
          registry.close();
        }
      }
    } else if (substrate === 'macos') {
      const {
        resolveSiteRoot,
        ensureSiteDir,
        siteConfigPath,
      } = await import('@narada2/macos-site');

      siteRoot = options.root ?? resolveSiteRoot(siteId);
      configPath = siteConfigPath(siteId);

      if (!dryRun) {
        await ensureSiteDir(siteId);
        await mkdir(siteRoot, { recursive: true });
      }

      configContent = {
        site_id: siteId,
        site_root: siteRoot,
        config_path: configPath,
        execution: buildExecutionRecord({ execution, siteRoot }),
        cycle_interval_minutes: intervalMinutes,
        lock_ttl_ms: lockTtlMs,
        ceiling_ms: ceilingMs,
      };

      if (!dryRun) {
        await writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n', 'utf8');
        await writeFile(join(siteRoot, 'AGENTS.md'), siteAgentsContract({
          siteId,
          siteKind: 'macos',
          siteRoot,
          authorityLocus: 'macos',
          ownershipSummary: 'This Site owns macOS-locus governance, local runtime memory, inbox intake, observations, decisions, tasks, chapters, KB, and requests inside `site_root`.',
          nonAuthoritySummary: 'This Site does not own Narada proper doctrine, other Sites, project code, or external capabilities unless explicitly admitted through governed crossings.',
        }), 'utf8');
      }
    } else {
      // linux-user or linux-system
      const mode = substrate === 'linux-user' ? 'user' : 'system';
      const {
        resolveSiteRoot,
        ensureSiteDir,
        siteConfigPath,
      } = await import('@narada2/linux-site');

      siteRoot = options.root ?? resolveSiteRoot(siteId, mode);
      configPath = siteConfigPath(siteId, mode);

      if (!dryRun) {
        await ensureSiteDir(siteId, mode);
        await mkdir(siteRoot, { recursive: true });
      }

      configContent = {
        site_id: siteId,
        mode,
        site_root: siteRoot,
        config_path: configPath,
        execution: buildExecutionRecord({ execution, siteRoot }),
        cycle_interval_minutes: intervalMinutes,
        lock_ttl_ms: lockTtlMs,
        ceiling_ms: ceilingMs,
      };

      if (!dryRun) {
        await writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n', 'utf8');
        await writeFile(join(siteRoot, 'AGENTS.md'), siteAgentsContract({
          siteId,
          siteKind: mode === 'user' ? 'linux-user' : 'linux-system',
          siteRoot,
          authorityLocus: mode,
          ownershipSummary: mode === 'user'
            ? 'This Site owns Linux user-locus governance, local runtime memory, inbox intake, observations, decisions, tasks, chapters, KB, and requests inside `site_root`.'
            : 'This Site owns Linux system-locus governance, system runtime memory, inbox intake, observations, decisions, tasks, chapters, KB, and requests inside `site_root`.',
          nonAuthoritySummary: 'This Site does not own Narada proper doctrine, other Sites, project code, or external capabilities unless explicitly admitted through governed crossings.',
        }), 'utf8');

        // Register in SiteRegistry
        const registry = await openRegistry();
        try {
          registry.registerSite({
            siteId,
            variant: mode === 'user' ? 'linux-user' : 'linux-system',
            siteRoot,
            substrate: 'linux',
            aimJson: options.operation ?? null,
            controlEndpoint: null,
            lastSeenAt: null,
            createdAt: new Date().toISOString(),
          });
        } finally {
          registry.close();
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to initialize Site: ${message}` },
    };
  }

  // Output
  if (fmt.getFormat() === 'human') {
    fmt.message(dryRun ? 'Dry run — no changes made' : `Initialized Site: ${siteId}`, 'success');
    fmt.kv('Substrate', substrate);
    fmt.kv('Site Root', siteRoot!);
    fmt.kv('Config Path', configPath!);
    if ('locus' in configContent!) {
      const locus = configContent!.locus as { authority_locus?: string };
      fmt.kv('Authority Locus', locus.authority_locus ?? '-');
    }
    if ('sync' in configContent!) {
      const sync = configContent!.sync as { posture?: string };
      fmt.kv('Sync Posture', sync.posture ?? '-');
    }
    if ('execution' in configContent!) {
      const surface = configContent!.execution as { surface?: string; rationale?: string };
      fmt.kv('Execution Surface', surface.surface ?? '-');
      fmt.message(surface.rationale ?? 'Execution surface was not inferred.', 'info');
    }
    if (options.operation) {
      fmt.kv('Operation', options.operation);
    }
    fmt.section('Next steps');
    fmt.message(`1. Set credentials: export NARADA_${siteId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_GRAPH_ACCESS_TOKEN="..."`, 'info');
    fmt.message(`2. Validate:      narada doctor --site ${siteId}`, 'info');
    fmt.message(`3. First Cycle:    narada cycle --site ${siteId}`, 'info');
    fmt.message(`4. Enable supervisor: narada sites enable ${siteId}`, 'info');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      siteId,
      substrate,
      siteRoot: siteRoot!,
      configPath: configPath!,
      dryRun,
      config: configContent!,
      nextSteps: [
        `narada doctor --site ${siteId}`,
        `narada cycle --site ${siteId}`,
        `narada sites enable ${siteId}`,
      ],
    },
  };
}

export async function sitesBootstrapClientCommand(
  options: SitesBootstrapClientOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const workspaceRoot = resolve(options.workspace ?? '.');
  const siteId = options.siteId ?? clientSiteIdFromWorkspace(workspaceRoot);
  const siteRoot = clientSiteRootFromWorkspace(workspaceRoot);
  const sync = options.sync ?? (workspaceRoot.toLowerCase().includes('onedrive') ? 'onedrive_non_git' : 'local_non_git');
  const execute = options.execute === true;
  if (sync !== 'onedrive_non_git' && sync !== 'local_non_git') {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: `Unsupported client sync posture: "${sync}". Valid postures: onedrive_non_git, local_non_git`,
      },
    };
  }
  const config = clientSiteConfig({ siteId, workspaceRoot, siteRoot, sync });
  const directories = CLIENT_SITE_DIRECTORIES.map((directory) => join(siteRoot, directory));
  const files = [
    {
      path: join(siteRoot, 'config.json'),
      kind: 'config',
    },
    {
      path: join(siteRoot, 'README.md'),
      kind: 'guidance',
    },
    {
      path: join(siteRoot, 'AGENTS.md'),
      kind: 'guidance',
    },
    {
      path: join(siteRoot, '.ai', 'inbox-drop', '.gitkeep'),
      kind: 'empty-directory-marker',
    },
    {
      path: join(siteRoot, '.ai', 'inbox-envelopes', '.gitkeep'),
      kind: 'empty-directory-marker',
    },
  ];

  if (execute) {
    await mkdir(siteRoot, { recursive: true });
    for (const directory of directories) {
      await mkdir(directory, { recursive: true });
    }
    await writeFile(join(siteRoot, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
    await writeFile(
      join(siteRoot, 'README.md'),
      [
        `# ${siteId} Client Site`,
        '',
        'Contained Narada governance for client-service work rooted at:',
        '',
        workspaceRoot,
        '',
        `Use \`narada sites doctor ${siteId} --kind client --root ${workspaceRoot}\` to validate this Site.`,
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(join(siteRoot, 'AGENTS.md'), siteAgentsContract({
      siteId,
      siteKind: 'client',
      workspaceRoot,
      siteRoot,
      authorityLocus: 'client_service',
      syncPosture: sync,
      ownershipSummary: 'This Site owns client-service governance, construction memory, inbox intake, observations, decisions, tasks, chapters, KB, and requests inside `site_root`.',
      nonAuthoritySummary: 'Client/business artifacts outside `site_root` are not Narada knowledge, evidence, or authority unless explicitly admitted through a governed intake path.',
      extraRules: ['- Do not initialize Git or external sync for this Site unless the Operator explicitly changes the durability posture.'],
    }), 'utf8');
    await writeFile(join(siteRoot, '.ai', 'inbox-drop', '.gitkeep'), '', 'utf8');
    await writeFile(join(siteRoot, '.ai', 'inbox-envelopes', '.gitkeep'), '', 'utf8');
  }

  const result = {
    status: execute ? 'success' : 'dry_run',
    mutation_performed: execute,
    plan_kind: 'client_site_bootstrap',
    site_id: siteId,
    workspace_root: workspaceRoot,
    site_root: siteRoot,
    sync_posture: sync,
    directories,
    files,
    config,
    validation_commands: [
      `narada sites doctor ${siteId} --kind client --root ${workspaceRoot}`,
      `narada inbox ingest-files --from ${join(siteRoot, '.ai', 'inbox-drop')}`,
    ],
  };

  if (fmt.getFormat() === 'human') {
    fmt.message(execute ? 'Bootstrapped client Site' : 'Dry run - client Site bootstrap plan', 'success');
    fmt.kv('Site', siteId);
    fmt.kv('Workspace', workspaceRoot);
    fmt.kv('Site Root', siteRoot);
    fmt.kv('Sync Posture', sync);
    fmt.kv('Mutation', execute ? 'executed' : 'not executed');
    fmt.section('Validation');
    for (const command of result.validation_commands) {
      fmt.message(command, 'info');
    }
  }

  return { exitCode: ExitCode.SUCCESS, result };
}

export async function sitesBootstrapProjectCommand(
  options: SitesBootstrapProjectOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const workspaceRoot = resolve(options.workspace ?? '.');
  const siteId = options.siteId ?? clientSiteIdFromWorkspace(workspaceRoot);
  const siteRoot = clientSiteRootFromWorkspace(workspaceRoot);
  const sync = options.sync ?? 'git_backed_project_repo';
  const execute = options.execute === true;
  if (sync !== 'git_backed_project_repo') {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: `Unsupported project sync posture: "${sync}". Valid postures: git_backed_project_repo`,
      },
    };
  }
  const config = projectSiteConfig({ siteId, workspaceRoot, siteRoot, sync });
  const directories = CLIENT_SITE_DIRECTORIES.map((directory) => join(siteRoot, directory));
  const files = [
    { path: join(siteRoot, 'config.json'), kind: 'config' },
    { path: join(siteRoot, 'README.md'), kind: 'guidance' },
    { path: join(siteRoot, 'AGENTS.md'), kind: 'guidance' },
    { path: join(siteRoot, '.ai', 'inbox-drop', '.gitkeep'), kind: 'empty-directory-marker' },
    { path: join(siteRoot, '.ai', 'inbox-envelopes', '.gitkeep'), kind: 'empty-directory-marker' },
  ];

  if (execute) {
    await mkdir(siteRoot, { recursive: true });
    for (const directory of directories) {
      await mkdir(directory, { recursive: true });
    }
    await writeFile(join(siteRoot, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
    await writeFile(
      join(siteRoot, 'README.md'),
      [
        `# ${siteId} Project Site`,
        '',
        'Contained Narada governance for project-local construction work rooted at:',
        '',
        workspaceRoot,
        '',
        'Project code and artifacts remain project-owned. Narada governance lives in .narada.',
        '',
        `Use \`narada sites doctor ${siteId} --kind project --root ${workspaceRoot}\` to validate this Site.`,
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(join(siteRoot, 'AGENTS.md'), siteAgentsContract({
      siteId,
      siteKind: 'project',
      workspaceRoot,
      siteRoot,
      authorityLocus: 'project',
      syncPosture: sync,
      ownershipSummary: 'This Site owns project-local governance, construction memory, inbox intake, observations, decisions, tasks, chapters, KB, and requests inside `site_root`.',
      nonAuthoritySummary: 'Project code and artifacts outside `site_root` are not Narada knowledge, evidence, or authority merely because the Site inhabits the repository.',
    }), 'utf8');
    await writeFile(join(siteRoot, '.ai', 'inbox-drop', '.gitkeep'), '', 'utf8');
    await writeFile(join(siteRoot, '.ai', 'inbox-envelopes', '.gitkeep'), '', 'utf8');
  }

  const result = {
    status: execute ? 'success' : 'dry_run',
    mutation_performed: execute,
    plan_kind: 'project_site_bootstrap',
    site_id: siteId,
    workspace_root: workspaceRoot,
    site_root: siteRoot,
    sync_posture: sync,
    directories,
    files,
    config,
    validation_commands: [
      `narada sites doctor ${siteId} --kind project --root ${workspaceRoot}`,
      `narada inbox ingest-files --from ${join(siteRoot, '.ai', 'inbox-drop')}`,
    ],
  };

  if (fmt.getFormat() === 'human') {
    fmt.message(execute ? 'Bootstrapped project Site' : 'Dry run - project Site bootstrap plan', 'success');
    fmt.kv('Site', siteId);
    fmt.kv('Workspace', workspaceRoot);
    fmt.kv('Site Root', siteRoot);
    fmt.kv('Sync Posture', sync);
    fmt.kv('Mutation', execute ? 'executed' : 'not executed');
    fmt.section('Validation');
    for (const command of result.validation_commands) {
      fmt.message(command, 'info');
    }
  }

  return { exitCode: ExitCode.SUCCESS, result };
}

function defaultWindowsUserSiteId(): string {
  return 'current-user';
}

function defaultWindowsUserSiteRoot(): string | undefined {
  if (process.env.USERPROFILE) return undefined;
  const userName = process.env.USERNAME ?? process.env.USER;
  if (!userName || !userName.trim()) return undefined;
  return win32.join('C:\\Users', userName.trim(), 'Narada');
}

function defaultWindowsPcSiteId(): { siteId: string; source: string } {
  const fromComputerName = process.env.COMPUTERNAME;
  if (fromComputerName?.trim()) {
    return { siteId: fromComputerName.trim().toLowerCase(), source: 'computer_name' };
  }
  const fromHostName = process.env.HOSTNAME;
  if (fromHostName?.trim()) {
    return { siteId: fromHostName.trim().toLowerCase(), source: 'hostname_env' };
  }
  return { siteId: hostname().toLowerCase(), source: 'hostname_fallback' };
}

function envToolStatus(name: string): 'present' | 'missing' | 'ambiguous' | null {
  const value = process.env[`NARADA_WINDOWS_TOOL_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`]?.trim().toLowerCase();
  return value === 'present' || value === 'missing' || value === 'ambiguous' ? value : null;
}

function resolveCliReadinessCoordinates(): {
  module_entrypoint: string;
  package_root: string;
  dist_entrypoint: string;
  shell_shim: string | null;
  repair_command: string;
} {
  const moduleEntrypoint = fileURLToPath(import.meta.url);
  const packageRoot = resolve(moduleEntrypoint, '..', '..', '..');
  return {
    module_entrypoint: moduleEntrypoint,
    package_root: packageRoot,
    dist_entrypoint: join(packageRoot, 'dist', 'main.js'),
    shell_shim: process.env.HOME ? join(process.env.HOME, '.local', 'bin', 'narada') : null,
    repair_command: 'pnpm --filter @narada2/cli build && pnpm run narada:install-shim',
  };
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ['--version'], { timeout: 1500, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function resolveWindowsToolCommand(name: string, commands: string[]): Promise<WindowsToolCommandResolution> {
  const envStatus = envToolStatus(name);
  if (envStatus === 'missing') {
    return { status: 'missing', command: null, candidates: commands, probe: 'env:NARADA_WINDOWS_TOOL_*' };
  }
  if (envStatus === 'present') {
    return { status: 'found', command: commands[0] ?? null, candidates: commands, probe: 'env:NARADA_WINDOWS_TOOL_*' };
  }
  if (envStatus === 'ambiguous') {
    return { status: 'ambiguous', command: commands[0] ?? null, candidates: commands, probe: 'env:NARADA_WINDOWS_TOOL_*' };
  }
  const found = (await Promise.all(commands.map(async (command) => (await commandAvailable(command)) ? command : null))).filter((command): command is string => Boolean(command));
  if (found.length === 0) return { status: 'missing', command: null, candidates: commands, probe: '--version' };
  if (found.length > 1) return { status: 'ambiguous', command: found[0]!, candidates: found, probe: '--version' };
  return { status: 'found', command: found[0]!, candidates: commands, probe: '--version' };
}

async function windowsToolCheck(args: {
  name: string;
  commands: string[];
  authorityLocus: WindowsOnboardingCheck['authority_locus'];
  unblockCommand: string;
}): Promise<WindowsOnboardingCheck> {
  const commandResolution = await resolveWindowsToolCommand(args.name, args.commands);
  const available = commandResolution.status === 'found' || commandResolution.status === 'ambiguous';
  const semanticStatus = available ? 'unknown' : 'not_ready';
  return {
    name: `${args.name}_available`,
    status: commandResolution.status === 'ambiguous' ? 'warn' : available ? 'pass' : 'fail',
    authority_locus: args.authorityLocus,
    detail: commandResolution.status === 'ambiguous'
      ? `${args.name} command resolution is ambiguous: ${commandResolution.candidates.join(', ')}`
      : available
        ? `${args.name} command resolved: ${commandResolution.command}`
        : `${args.name} command not found on PATH (${args.commands.join(' or ')})`,
    unblock_command: available ? undefined : args.unblockCommand,
    command_resolution: commandResolution,
    semantic_readiness: {
      status: semanticStatus,
      reason: semanticStatus === 'unknown'
        ? 'Command resolution succeeded; semantic readiness requires adapter-specific read-back in the owning Windows locus.'
        : 'Command resolution failed.',
    },
  };
}

async function inspectWindowsOnboardingReadiness(executionSurface?: string): Promise<WindowsOnboardingCheck[]> {
  const effectiveSurface = executionSurface ?? (process.env.NARADA_EXECUTOR_RUNTIME === 'wsl' ? 'wsl_assisted' : 'windows_native');
  const checks: WindowsOnboardingCheck[] = [
    await windowsToolCheck({
      name: 'windows_terminal',
      commands: ['wt'],
      authorityLocus: 'windows_user',
      unblockCommand: 'Install Windows Terminal, then rerun narada sites bootstrap-windows --format json.',
    }),
    await windowsToolCheck({
      name: 'komorebi',
      commands: ['komorebic'],
      authorityLocus: 'windows_pc',
      unblockCommand: 'Install or repair Komorebi in the PC Site, then rerun narada sites bootstrap-windows --format json.',
    }),
    await windowsToolCheck({
      name: 'yasb',
      commands: ['yasbc', 'yasb'],
      authorityLocus: 'windows_user',
      unblockCommand: 'Install or repair YASB in the Windows User Site, then rerun narada sites bootstrap-windows --format json.',
    }),
    await windowsToolCheck({
      name: 'powershell',
      commands: ['pwsh', 'powershell.exe', 'powershell'],
      authorityLocus: 'windows_user',
      unblockCommand: 'Install PowerShell 7 or enable Windows PowerShell, then rerun narada sites bootstrap-windows --format json.',
    }),
  ];
  checks.push({
    name: 'powershell_execution_policy_posture',
    status: 'warn',
    authority_locus: 'windows_user',
    detail: 'Execution policy must permit User/PC Site-owned scripts at execution time; dry-run does not mutate policy.',
    unblock_command: 'Run PowerShell as the owning Windows user and inspect: Get-ExecutionPolicy -List',
  });
  checks.push({
    name: 'wsl_path_translation',
    status: effectiveSurface === 'wsl_assisted'
      ? 'pass'
      : effectiveSurface === 'windows_native'
        ? 'pass'
        : 'warn',
    authority_locus: 'narada_proper',
    detail: effectiveSurface === 'wsl_assisted'
      ? 'WSL-assisted execution surface validates Windows/WSL path translation.'
      : effectiveSurface === 'windows_native'
        ? 'Native Windows execution uses native paths directly; WSL path translation is not required.'
        : `Unsupported execution surface for Windows bootstrap readiness: ${effectiveSurface}`,
    unblock_command: effectiveSurface === 'wsl_assisted' || effectiveSurface === 'windows_native'
      ? undefined
      : 'Use --execution-surface windows_native or --execution-surface wsl_assisted.',
  });
  const cli = resolveCliReadinessCoordinates();
  const distExists = existsSync(cli.dist_entrypoint);
  const shimExists = cli.shell_shim ? existsSync(cli.shell_shim) : false;
  checks.push({
    name: 'narada_cli_readiness',
    status: distExists ? 'pass' : 'fail',
    authority_locus: 'narada_proper',
    detail: [
      `module=${cli.module_entrypoint}`,
      `package_root=${cli.package_root}`,
      `dist=${distExists ? cli.dist_entrypoint : `missing:${cli.dist_entrypoint}`}`,
      `shell_shim=${cli.shell_shim ? shimExists ? cli.shell_shim : `missing:${cli.shell_shim}` : 'unavailable'}`,
    ].join('; '),
    unblock_command: distExists ? undefined : cli.repair_command,
  });
  return checks;
}

function windowsAdapterPlan(execute: boolean): Array<Record<string, unknown>> {
  return [
    ['windows_terminal_profile', 'windows_user', 'narada operator-surface agent instantiate --site <user-site> --role builder --agent-kind codex_cli --by <principal>', 'Create or update a Windows Terminal profile only through the Windows User Site owning-locus command path.'],
    ['komorebi_focus_rule', 'windows_pc', 'narada command-exec request --site <pc-site> --intent komorebi.focus-rule --format json', 'Materialize Komorebi focus rules only through the PC Site CEIZ path and read-back evidence.'],
    ['yasb_focus_affordance', 'windows_user', 'narada command-exec request --site <user-site> --intent yasb.focus-affordance --format json', 'Materialize YASB affordances only through the Windows User Site CEIZ path and read-back evidence.'],
    ['operator_surface_runtime_binding', 'windows_user', 'narada operator-surface bind-focused --as self', 'Bind runtime identity only at the owning User/runtime locus; Narada proper may defer if locus is not local authority.'],
  ].map(([adapter, authorityLocus, command, owningLocusHint]) => ({
    adapter,
    authority_locus: authorityLocus,
    execution_state: 'planned_only',
    dry_run: true,
    site_bootstrap_execute_requested: execute,
    site_bootstrap_execute_affects_adapter: false,
    mutation_performed: false,
    execute_required: true,
    owning_locus_command: command,
    owning_locus_command_hint: owningLocusHint,
    evidence: `${adapter} dry-run/read-back artifact required before execute`,
  }));
}

function windowsBootstrapInitOptions(args: {
  authorityLocus: 'user' | 'pc';
  sync?: string;
  root?: string;
  executionSurface?: ExecutionSurface;
  dryRun: boolean;
  verbose?: boolean;
}): SitesInitOptions {
  return {
    substrate: 'windows-native',
    authorityLocus: args.authorityLocus,
    ...(args.authorityLocus === 'user' ? { sync: args.sync } : {}),
    ...(args.root ? { root: args.root } : {}),
    executionSurface: args.executionSurface,
    dryRun: args.dryRun,
    format: 'json',
    verbose: args.verbose,
  };
}

function siteInitError(result: unknown, fallback: string): string {
  return (result as { error?: string }).error ?? fallback;
}

export async function sitesBootstrapWindowsCommand(
  options: SitesBootstrapWindowsOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const userSiteId = options.userSiteId ?? defaultWindowsUserSiteId();
  const pcDefault = defaultWindowsPcSiteId();
  const pcSiteId = options.pcSiteId ?? pcDefault.siteId;
  const execute = options.execute === true;
  const sync = options.sync ?? 'hybrid_capable_plain_folder';
  const substrateReadiness = await inspectWindowsOnboardingReadiness(options.executionSurface);
  const initExecutionSurface: ExecutionSurface | undefined = options.executionSurface && VALID_EXECUTION_SURFACES.includes(options.executionSurface as ExecutionSurface)
    ? options.executionSurface as ExecutionSurface
    : undefined;
  const userInitOptions = windowsBootstrapInitOptions({
    authorityLocus: 'user',
    sync,
    root: defaultWindowsUserSiteRoot(),
    executionSurface: initExecutionSurface,
    dryRun: true,
    verbose: options.verbose,
  });
  const pcInitOptions = windowsBootstrapInitOptions({
    authorityLocus: 'pc',
    executionSurface: initExecutionSurface,
    dryRun: true,
    verbose: options.verbose,
  });

  const userPreflight = await sitesInitCommand(userSiteId, userInitOptions, context);
  if (userPreflight.exitCode !== ExitCode.SUCCESS) {
    return {
      exitCode: userPreflight.exitCode,
      result: {
        status: 'error',
        phase: 'paired_preflight_user_site',
        mutation_performed: false,
        error: siteInitError(userPreflight.result, 'Failed to preflight Windows User Site'),
        repair_guidance: 'Fix the Windows User Site preflight error, then rerun narada sites bootstrap-windows --execute --format json.',
        preflight: {
          user: userPreflight.result,
          pc: null,
        },
      },
    };
  }

  const pcPreflight = await sitesInitCommand(pcSiteId, pcInitOptions, context);
  if (pcPreflight.exitCode !== ExitCode.SUCCESS) {
    return {
      exitCode: pcPreflight.exitCode,
      result: {
        status: 'error',
        phase: 'paired_preflight_pc_site',
        mutation_performed: false,
        error: siteInitError(pcPreflight.result, 'Failed to preflight Windows PC Site'),
        repair_guidance: 'Fix the Windows PC Site preflight error. No User Site was created; rerun narada sites bootstrap-windows --execute --format json.',
        preflight: {
          user: userPreflight.result,
          pc: pcPreflight.result,
        },
      },
    };
  }

  let userResult = userPreflight;
  let pcResult = pcPreflight;

  if (execute) {
    userResult = await sitesInitCommand(userSiteId, { ...userInitOptions, dryRun: false }, context);
    if (userResult.exitCode !== ExitCode.SUCCESS) {
      return {
        exitCode: userResult.exitCode,
        result: {
          status: 'error',
          phase: 'user_site_execute',
          mutation_performed: false,
          error: siteInitError(userResult.result, 'Failed to create Windows User Site after successful preflight'),
          repair_guidance: 'Fix the Windows User Site execute error, then rerun narada sites bootstrap-windows --execute --format json.',
          preflight: {
            user: userPreflight.result,
            pc: pcPreflight.result,
          },
          user: userResult.result,
          pc: null,
          partial_state: {
            kind: 'none_confirmed',
            user_site_created: false,
            pc_site_created: false,
            evidence: 'User Site execution failed before paired bootstrap could create a confirmed pair.',
          },
        },
      };
    }

    pcResult = await sitesInitCommand(pcSiteId, { ...pcInitOptions, dryRun: false }, context);
    if (pcResult.exitCode !== ExitCode.SUCCESS) {
      return {
        exitCode: pcResult.exitCode,
        result: {
          status: 'partial',
          phase: 'pc_site_execute',
          mutation_performed: true,
          error: siteInitError(pcResult.result, 'Failed to create Windows PC Site after Windows User Site was created'),
          repair_guidance: [
            'A Windows User Site was created but the paired PC Site was not confirmed.',
            `Inspect User Site: narada sites doctor ${userSiteId} --authority-locus user`,
            `Repair PC Site creation, then rerun: narada sites bootstrap-windows --user-site-id ${userSiteId} --pc-site-id ${pcSiteId} --execute --format json`,
          ],
          preflight: {
            user: userPreflight.result,
            pc: pcPreflight.result,
          },
          user: userResult.result,
          pc: pcResult.result,
          partial_state: {
            kind: 'user_created_pc_failed',
            user_site_created: true,
            pc_site_created: false,
            user_site_id: userSiteId,
            pc_site_id: pcSiteId,
            evidence: 'User Site execute succeeded before PC Site execute failed.',
          },
        },
      };
    }
  }

  const result = {
    status: execute ? 'success' : 'dry_run',
    mutation_performed: execute,
    plan_kind: 'paired_windows_user_pc_site_bootstrap',
    user_site_id: userSiteId,
    pc_site_id: pcSiteId,
    pc_identity_source: options.pcSiteId ? 'explicit' : pcDefault.source,
    preflight: {
      user: userPreflight.result,
      pc: pcPreflight.result,
    },
    user: userResult.result,
    pc: pcResult.result,
    substrate_readiness: substrateReadiness,
    adapter_plan: windowsAdapterPlan(execute),
    evidence: {
      bounded: true,
      raw_sqlite_read: false,
      direct_task_file_inspection: false,
      site_creation: execute ? 'site bootstrap commands executed through sites init' : 'dry-run plan only',
      readiness: 'substrate_readiness checks and validation_commands',
      adapter: 'adapter_plan names authority locus and required execute/read-back evidence',
      residual_manual_steps: substrateReadiness
        .filter((check) => check.status !== 'pass')
        .map((check) => ({ check: check.name, unblock_command: check.unblock_command })),
    },
    validation_commands: [
      `narada sites doctor ${userSiteId} --authority-locus user`,
      `narada sites doctor ${pcSiteId} --authority-locus pc`,
      'narada doctor --bootstrap --format json',
      'narada operator-surface labels build --site <site-id-or-root> --format json',
    ],
  };

  if (fmt.getFormat() === 'human') {
    fmt.message(execute ? 'Bootstrapped paired Windows Sites' : 'Dry run - paired Windows Site bootstrap plan', 'success');
    fmt.kv('User Site', userSiteId);
    fmt.kv('PC Site', pcSiteId);
    fmt.kv('PC identity source', result.pc_identity_source);
    fmt.kv('Mutation', execute ? 'executed' : 'not executed');
    fmt.section('Validation');
    for (const command of result.validation_commands) {
      fmt.message(command, 'info');
    }
    fmt.section('Substrate readiness');
    for (const check of substrateReadiness) {
      fmt.message(`${check.status}: ${check.name} (${check.authority_locus})`, check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error');
      if (check.unblock_command && options.verbose) fmt.message(`  unblock: ${check.unblock_command}`, 'info');
    }
  }

  return { exitCode: ExitCode.SUCCESS, result };
}

// ---------------------------------------------------------------------------
// Site enable
// ---------------------------------------------------------------------------

export interface SitesEnableOptions extends SitesOptions {
  intervalMinutes?: number;
  dryRun?: boolean;
}

export async function sitesEnableCommand(
  siteId: string,
  options: SitesEnableOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const dryRun = !!options.dryRun;
  const intervalMinutes = options.intervalMinutes ?? 5;

  // Detect substrate (same routing as cycle/status/doctor)
  let substrate: string;
  let enableResult: Record<string, unknown> = {};

  try {
    // Try macOS first
    try {
      const { isMacosSite } = await import('@narada2/macos-site');
      if (isMacosSite(siteId)) {
        substrate = 'macos';
        const {
          resolveSiteRoot,
          siteConfigPath,
          writeLaunchAgentFiles,
        } = await import('@narada2/macos-site');

        const siteRoot = resolveSiteRoot(siteId);
        const configPath = siteConfigPath(siteId);

        // Read config to get MacosSiteConfig shape
        let config: { site_id: string; site_root: string; config_path: string; cycle_interval_minutes: number; lock_ttl_ms: number; ceiling_ms: number };
        try {
          const { readFile } = await import('node:fs/promises');
          const raw = await readFile(configPath, 'utf8');
          config = JSON.parse(raw);
        } catch {
          // Use defaults if config missing
          config = {
            site_id: siteId,
            site_root: siteRoot,
            config_path: configPath,
            cycle_interval_minutes: intervalMinutes,
            lock_ttl_ms: 310_000,
            ceiling_ms: 300_000,
          };
        }

        if (!dryRun) {
          const paths = await writeLaunchAgentFiles(config);
          enableResult = { substrate: 'macos', paths };
        } else {
          enableResult = { substrate: 'macos', paths: null, dryRun: true };
        }

        if (fmt.getFormat() === 'human') {
          fmt.message(dryRun ? 'Dry run — no changes made' : `Enabled supervisor for Site: ${siteId}`, 'success');
          fmt.kv('Substrate', 'macos');
          fmt.kv('Interval', `${intervalMinutes} minutes`);
          if (!dryRun && 'paths' in enableResult && enableResult.paths) {
            const p = enableResult.paths as Record<string, string>;
            fmt.kv('Plist', p.plistPath ?? '-');
            fmt.kv('Script', p.scriptPath ?? '-');
          }
          fmt.section('Activation');
          fmt.message(`Run: launchctl load ~/Library/LaunchAgents/dev.narada.site.${siteId}.plist`, 'info');
          fmt.message(`Logs: narada status --site ${siteId}`, 'info');
        }

        return {
          exitCode: ExitCode.SUCCESS,
          result: {
            status: 'success',
            siteId,
            substrate: 'macos',
            dryRun,
            intervalMinutes,
            ...enableResult,
            activationCommand: `launchctl load ~/Library/LaunchAgents/dev.narada.site.${siteId}.plist`,
          },
        };
      }
    } catch {
      // macOS package not available
    }

    // Try Linux next
    try {
      const { isLinuxSite, resolveLinuxSiteMode } = await import('@narada2/linux-site');
      const linuxMode = resolveLinuxSiteMode(siteId);
      if (linuxMode) {
        substrate = `linux-${linuxMode}`;
        const {
          resolveSiteRoot,
          siteConfigPath,
          DefaultLinuxSiteSupervisor,
        } = await import('@narada2/linux-site');

        const siteRoot = resolveSiteRoot(siteId, linuxMode);
        const configPath = siteConfigPath(siteId, linuxMode);

        let config: { site_id: string; mode: 'system' | 'user'; site_root: string; config_path: string; cycle_interval_minutes: number; lock_ttl_ms: number; ceiling_ms: number };
        try {
          const { readFile } = await import('node:fs/promises');
          const raw = await readFile(configPath, 'utf8');
          config = JSON.parse(raw);
        } catch {
          config = {
            site_id: siteId,
            mode: linuxMode as 'system' | 'user',
            site_root: siteRoot,
            config_path: configPath,
            cycle_interval_minutes: intervalMinutes,
            lock_ttl_ms: 310_000,
            ceiling_ms: 300_000,
          };
        }

        if (!dryRun) {
          const supervisor = new DefaultLinuxSiteSupervisor();
          const registration = await supervisor.register(config);
          enableResult = { substrate: `linux-${linuxMode}`, registration };
        } else {
          enableResult = { substrate: `linux-${linuxMode}`, registration: null, dryRun: true };
        }

        if (fmt.getFormat() === 'human') {
          fmt.message(dryRun ? 'Dry run — no changes made' : `Enabled supervisor for Site: ${siteId}`, 'success');
          fmt.kv('Substrate', `linux-${linuxMode}`);
          fmt.kv('Interval', `${intervalMinutes} minutes`);
          if (!dryRun && 'registration' in enableResult && enableResult.registration) {
            const r = enableResult.registration as { servicePath?: string; timerPath?: string; cronEntry?: string };
            if (r.servicePath) fmt.kv('Service', r.servicePath);
            if (r.timerPath) fmt.kv('Timer', r.timerPath);
            if (r.cronEntry) fmt.kv('Cron', r.cronEntry);
          }
          fmt.section('Activation');
          const scope = linuxMode === 'system' ? '' : ' --user';
          fmt.message(`Run: systemctl${scope} enable narada-site-${siteId}.timer`, 'info');
          fmt.message(`Run: systemctl${scope} start narada-site-${siteId}.timer`, 'info');
          fmt.message(`Logs: journalctl${scope} -u narada-site-${siteId}.service`, 'info');
        }

        return {
          exitCode: ExitCode.SUCCESS,
          result: {
            status: 'success',
            siteId,
            substrate: `linux-${linuxMode}`,
            dryRun,
            intervalMinutes,
            ...enableResult,
            activationCommands: [
              `systemctl${linuxMode === 'system' ? '' : ' --user'} enable narada-site-${siteId}.timer`,
              `systemctl${linuxMode === 'system' ? '' : ' --user'} start narada-site-${siteId}.timer`,
            ],
          },
        };
      }
    } catch {
      // Linux package not available
    }

    // Fallback to Windows
    try {
      const { resolveSiteVariant, resolveSiteRoot, siteConfigPath } = await import('@narada2/windows-site');
      const variant = resolveSiteVariant(siteId);
      if (!variant) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: {
            status: 'error',
            error: `Site "${siteId}" not found. Checked macOS, Linux (system/user), and Windows (native/WSL) paths.`,
            remediation: `Run narada sites init ${siteId} --substrate <substrate> to create the Site first.`,
          },
        };
      }

      substrate = variant === 'native' ? 'windows-native' : 'windows-wsl';
      const siteRoot = resolveSiteRoot(siteId, variant);
      const configPath = siteConfigPath(siteId, variant);

      let config: { site_id: string; variant: 'native' | 'wsl'; site_root: string; config_path: string; cycle_interval_minutes: number; lock_ttl_ms: number; ceiling_ms: number };
      try {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(configPath, 'utf8');
        config = JSON.parse(raw);
      } catch {
        config = {
          site_id: siteId,
          variant: variant as 'native' | 'wsl',
          site_root: siteRoot,
          config_path: configPath,
          cycle_interval_minutes: intervalMinutes,
          lock_ttl_ms: 310_000,
          ceiling_ms: 300_000,
        };
      }

      if (variant === 'native') {
        const { generateRegisterTaskScript } = await import('@narada2/windows-site');
        const script = generateRegisterTaskScript({
          siteId,
          siteRoot,
          intervalMinutes,
        });
        if (!dryRun) {
          const { writeFile } = await import('node:fs/promises');
          const scriptPath = `${siteRoot}/register-task.ps1`;
          await writeFile(scriptPath, script, 'utf8');
          enableResult = { substrate: 'windows-native', scriptPath };
        } else {
          enableResult = { substrate: 'windows-native', scriptPath: null, dryRun: true };
        }

        if (fmt.getFormat() === 'human') {
          fmt.message(dryRun ? 'Dry run — no changes made' : `Enabled supervisor for Site: ${siteId}`, 'success');
          fmt.kv('Substrate', 'windows-native');
          fmt.kv('Interval', `${intervalMinutes} minutes`);
          fmt.section('Activation');
          fmt.message(`Run: powershell -ExecutionPolicy Bypass -File "${siteRoot}/register-task.ps1"`, 'info');
        }

        return {
          exitCode: ExitCode.SUCCESS,
          result: {
            status: 'success',
            siteId,
            substrate: 'windows-native',
            dryRun,
            intervalMinutes,
            ...enableResult,
            activationCommand: `powershell -ExecutionPolicy Bypass -File "${siteRoot}/register-task.ps1"`,
          },
        };
      } else {
        // WSL
        const { writeSystemdUnits, writeShellScript } = await import('@narada2/windows-site');
        if (!dryRun) {
          const systemdPaths = await writeSystemdUnits(config);
          const scriptPath = await writeShellScript(config);
          enableResult = { substrate: 'windows-wsl', systemdPaths, scriptPath };
        } else {
          enableResult = { substrate: 'windows-wsl', dryRun: true };
        }

        if (fmt.getFormat() === 'human') {
          fmt.message(dryRun ? 'Dry run — no changes made' : `Enabled supervisor for Site: ${siteId}`, 'success');
          fmt.kv('Substrate', 'windows-wsl');
          fmt.kv('Interval', `${intervalMinutes} minutes`);
          fmt.section('Activation');
          fmt.message(`Run: sudo systemctl enable narada-site-${siteId}.timer`, 'info');
          fmt.message(`Run: sudo systemctl start narada-site-${siteId}.timer`, 'info');
        }

        return {
          exitCode: ExitCode.SUCCESS,
          result: {
            status: 'success',
            siteId,
            substrate: 'windows-wsl',
            dryRun,
            intervalMinutes,
            ...enableResult,
            activationCommands: [
              `sudo systemctl enable narada-site-${siteId}.timer`,
              `sudo systemctl start narada-site-${siteId}.timer`,
            ],
          },
        };
      }
    } catch {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: {
          status: 'error',
          error: `Site "${siteId}" not found. No substrate detected.`,
          remediation: `Run narada sites init ${siteId} --substrate <substrate> to create the Site first.`,
        },
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to enable supervisor: ${message}` },
    };
  }
}
