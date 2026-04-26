/**
 * `narada sites`
 *
 * Site discovery and registry management commands.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface SitesOptions {
  format?: string;
  verbose?: boolean;
}

interface SiteListEntry {
  siteId: string;
  variant: string;
  substrate: string;
  health: string;
  lastCycle: string | null;
  failures: number;
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
        SITE_SUBDIRECTORIES,
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
