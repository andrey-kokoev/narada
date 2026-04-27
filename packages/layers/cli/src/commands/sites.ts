/**
 * `narada sites`
 *
 * Site discovery and registry management commands.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, posix, resolve, win32 } from 'node:path';
import { promisify } from 'node:util';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';

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

export interface SitesLineageEventsOptions extends SitesOptions {}

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

export async function sitesDoctorCommand(
  siteId: string,
  options: SitesDoctorOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
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
  dryRun?: boolean;
}

const VALID_SUBSTRATES = [
  'windows-native',
  'windows-wsl',
  'macos',
  'linux-user',
  'linux-system',
];

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
                windows_user_profile: process.env.USERPROFILE ?? '',
                username: process.env.USERNAME ?? '',
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
        cycle_interval_minutes: intervalMinutes,
        lock_ttl_ms: lockTtlMs,
        ceiling_ms: ceilingMs,
      };

      if (!dryRun) {
        await writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n', 'utf8');

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
      }

      configContent = {
        site_id: siteId,
        site_root: siteRoot,
        config_path: configPath,
        cycle_interval_minutes: intervalMinutes,
        lock_ttl_ms: lockTtlMs,
        ceiling_ms: ceilingMs,
      };

      if (!dryRun) {
        await writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n', 'utf8');
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
      }

      configContent = {
        site_id: siteId,
        mode,
        site_root: siteRoot,
        config_path: configPath,
        cycle_interval_minutes: intervalMinutes,
        lock_ttl_ms: lockTtlMs,
        ceiling_ms: ceilingMs,
      };

      if (!dryRun) {
        await writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n', 'utf8');

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
