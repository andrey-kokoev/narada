/**
 * `narada sites`
 *
 * Site discovery and registry management commands.
 */

import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

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
        const status = await getWindowsSiteStatus(site.siteId, site.variant);
        entries.push({
          siteId: site.siteId,
          variant: site.variant,
          substrate: site.substrate,
          health: status.health.status,
          lastCycle: status.health.last_cycle_at,
          failures: status.health.consecutive_failures,
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
      health = (await getWindowsSiteStatus(siteId, site.variant)).health;
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
