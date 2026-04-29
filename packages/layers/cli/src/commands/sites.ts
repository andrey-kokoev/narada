/**
 * `narada sites`
 *
 * Site discovery and registry management commands.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, posix, resolve, win32 } from 'node:path';
import { hostname } from 'node:os';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
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

const execFileAsync = promisify(execFile);

export interface SitesOptions {
  format?: string;
  verbose?: boolean;
}

export interface SitesTaskLifecycleInitOptions extends SitesOptions {
  site?: string;
  dryRun?: boolean;
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
  status: 'pass' | 'warn' | 'fail';
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
        allowed_roles: ['architect', 'builder'],
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

function addCheck(
  checks: SiteDoctorCheck[],
  name: string,
  status: SiteDoctorCheck['status'],
  message: string,
  remediation?: string,
): void {
  checks.push({ name, status, message, remediation });
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
  const workspaceRoot = resolve(options.root ?? '.');
  const siteRoot = clientSiteRootFromWorkspace(workspaceRoot);
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
    addCheck(
      checks,
      'config_site_id',
      config.site_id === siteId ? 'pass' : 'fail',
      config.site_id === siteId ? `Config site_id matches ${siteId}` : `Config site_id is ${String(config.site_id)}, expected ${siteId}`,
    );
    addCheck(
      checks,
      'site_kind',
      config.site_kind === 'client_service' ? 'pass' : 'fail',
      config.site_kind === 'client_service' ? 'Site kind is client_service' : `Site kind is ${String(config.site_kind)}, expected client_service`,
    );
    addCheck(
      checks,
      'workspace_root',
      String(config.workspace_root) === workspaceRoot ? 'pass' : 'fail',
      String(config.workspace_root) === workspaceRoot ? `Workspace root matches ${workspaceRoot}` : `Workspace root is ${String(config.workspace_root)}, expected ${workspaceRoot}`,
    );
    const sync = config.sync as { posture?: string; onedrive_safe?: boolean } | undefined;
    addCheck(
      checks,
      'durability_posture',
      sync?.posture === 'onedrive_non_git' || sync?.posture === 'local_non_git' ? 'pass' : 'fail',
      sync?.posture ? `Sync posture is ${sync.posture}` : 'Sync posture is missing',
      'Use onedrive_non_git or local_non_git for client Site bootstrap',
    );
    if (workspaceRoot.toLowerCase().includes('onedrive')) {
      addCheck(
        checks,
        'onedrive_non_git_posture',
        sync?.posture === 'onedrive_non_git' && sync?.onedrive_safe === true ? 'pass' : 'fail',
        sync?.posture === 'onedrive_non_git' ? 'OneDrive workspace has explicit non-Git posture' : 'OneDrive workspace should use onedrive_non_git posture',
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

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');
  const health = failed.length > 0 ? 'failed' : warned.length > 0 ? 'warning' : 'passed';

  if (fmt.getFormat() === 'human') {
    fmt.section(`Client Site Doctor - ${siteId}`);
    fmt.kv('Workspace', workspaceRoot);
    fmt.kv('Site Root', siteRoot);
    fmt.kv('Health', health);
    for (const check of checks) {
      const prefix = check.status === 'pass' ? '[pass]' : check.status === 'warn' ? '[warn]' : '[fail]';
      fmt.message(`${prefix} ${check.name}: ${check.message}`, check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error');
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
  const workspaceRoot = resolve(options.root ?? '.');
  const siteRoot = clientSiteRootFromWorkspace(workspaceRoot);
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
    addCheck(
      checks,
      'config_site_id',
      config.site_id === siteId ? 'pass' : 'fail',
      config.site_id === siteId ? `Config site_id matches ${siteId}` : `Config site_id is ${String(config.site_id)}, expected ${siteId}`,
    );
    addCheck(
      checks,
      'site_kind',
      config.site_kind === 'project' ? 'pass' : 'fail',
      config.site_kind === 'project' ? 'Site kind is project' : `Site kind is ${String(config.site_kind)}, expected project`,
    );
    addCheck(
      checks,
      'workspace_root',
      String(config.workspace_root) === workspaceRoot ? 'pass' : 'fail',
      String(config.workspace_root) === workspaceRoot ? `Workspace root matches ${workspaceRoot}` : `Workspace root is ${String(config.workspace_root)}, expected ${workspaceRoot}`,
    );
    const sync = config.sync as { posture?: string } | undefined;
    addCheck(
      checks,
      'project_sync_posture',
      sync?.posture === 'git_backed_project_repo' ? 'pass' : 'fail',
      sync?.posture ? `Sync posture is ${sync.posture}` : 'Sync posture is missing',
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

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');
  const health = failed.length > 0 ? 'failed' : warned.length > 0 ? 'warning' : 'passed';

  if (fmt.getFormat() === 'human') {
    fmt.section(`Project Site Doctor - ${siteId}`);
    fmt.kv('Workspace', workspaceRoot);
    fmt.kv('Site Root', siteRoot);
    fmt.kv('Health', health);
    for (const check of checks) {
      const prefix = check.status === 'pass' ? '[pass]' : check.status === 'warn' ? '[warn]' : '[fail]';
      fmt.message(`${prefix} ${check.name}: ${check.message}`, check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error');
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
        const db = new Database(lifecycleDbPath, { readonly: true, fileMustExist: true });
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
      const prefix = check.status === 'pass' ? '[pass]' : check.status === 'warn' ? '[warn]' : '[fail]';
      fmt.message(`${prefix} ${check.name}: ${check.message}`, check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error');
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

function normalizeBootstrapRole(role?: string): 'architect' | 'builder' | null {
  if (role === 'architect' || role === 'builder') {
    return role;
  }
  return null;
}

function bootstrapSectionTitle(role: 'architect' | 'builder'): string {
  return role === 'architect' ? 'Architect Thread Bootstrap' : 'Builder Thread Bootstrap';
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
    'You are either `architect` or `builder`, as assigned by the Operator.',
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
    '- Additional roles such as `receptionist` or `inspector` require explicit Site config and capability/admission rules before use.',
    '- A declared role, runtime, or embodiment does not grant capability, mutation authority, or evidence admission by itself.',
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
    '## Standing Rules',
    '',
    '- Treat this file as the Site-local execution contract for fresh Architect and Builder threads.',
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
      admitted_roles: ['architect', 'builder'],
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

  const userResult = await sitesInitCommand(userSiteId, {
    substrate: 'windows-native',
    authorityLocus: 'user',
    sync,
    root: defaultWindowsUserSiteRoot(),
    executionSurface: options.executionSurface,
    dryRun: !execute,
    format: 'json',
    verbose: options.verbose,
  }, context);
  if (userResult.exitCode !== ExitCode.SUCCESS) {
    return {
      exitCode: userResult.exitCode,
      result: {
        status: 'error',
        phase: 'user_site',
        error: (userResult.result as { error?: string }).error ?? 'Failed to plan Windows User Site',
        user: userResult.result,
      },
    };
  }

  const pcResult = await sitesInitCommand(pcSiteId, {
    substrate: 'windows-native',
    authorityLocus: 'pc',
    executionSurface: options.executionSurface,
    dryRun: !execute,
    format: 'json',
    verbose: options.verbose,
  }, context);
  if (pcResult.exitCode !== ExitCode.SUCCESS) {
    return {
      exitCode: pcResult.exitCode,
      result: {
        status: 'error',
        phase: 'pc_site',
        error: (pcResult.result as { error?: string }).error ?? 'Failed to plan Windows PC Site',
        user: userResult.result,
        pc: pcResult.result,
      },
    };
  }

  const result = {
    status: execute ? 'success' : 'dry_run',
    mutation_performed: execute,
    plan_kind: 'paired_windows_user_pc_site_bootstrap',
    user_site_id: userSiteId,
    pc_site_id: pcSiteId,
    pc_identity_source: options.pcSiteId ? 'explicit' : pcDefault.source,
    user: userResult.result,
    pc: pcResult.result,
    validation_commands: [
      `narada sites doctor ${userSiteId} --authority-locus user`,
      `narada sites doctor ${pcSiteId} --authority-locus pc`,
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
