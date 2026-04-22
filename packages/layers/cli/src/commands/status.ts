import { resolve } from 'node:path';
import { stat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
  type ControlPlaneStatusSnapshot,
  type LeaseSummary,
  type StaleLeaseRecoveryEvent,
  type QuiescenceIndicator,
} from '@narada2/control-plane';

// Lazy-load better-sqlite3 to avoid eager native-module load in test environments
async function loadControlPlaneSnapshot(
  dbPath: string,
  scopeId: string,
): Promise<ControlPlaneStatusSnapshot | undefined> {
  const { Database, SqliteCoordinatorStore, SqliteOutboundStore, buildControlPlaneSnapshot } = await import(
    '@narada2/control-plane'
  );
  const db = new Database(dbPath);
  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    return buildControlPlaneSnapshot(coordinatorStore, outboundStore, scopeId);
  } finally {
    db.close();
  }
}

export interface StatusOptions {
  config?: string;
  verbose?: boolean;
  format?: string;
  site?: string;
  mode?: string;
}

interface DaemonHealthSnapshot {
  status: string;
  readiness?: {
    dispatchReady: boolean;
    outboundHealthy: boolean;
    workersRegistered: boolean;
    syncFresh: boolean;
    charterRuntimeHealthy?: boolean;
    charterRuntimeHealthClass?: string;
  };
  isStale?: boolean;
  thresholds?: {
    maxStalenessMs: number;
    maxConsecutiveErrors: number;
  };
  scopes?: Array<{
    scopeId: string;
    readiness?: {
      dispatchReady: boolean;
      outboundHealthy: boolean;
      workersRegistered: boolean;
      syncFresh: boolean;
      charterRuntimeHealthy?: boolean;
      charterRuntimeHealthClass?: string;
    };
  }>;
  charterRuntimeHealth?: {
    class: string;
    checked_at: string;
    details: string;
  };
}

interface StatusReport {
  mailbox: {
    id: string;
    rootDir: string;
  };
  sync: {
    lastSyncAt: string | null;
    cursor: string | null;
    totalEvents: number;
  };
  storage: {
    messageCount: number;
    tombstoneCount: number;
    viewFolderCount: number;
    applyLogCount: number;
  };
  health: 'healthy' | 'stale' | 'empty' | 'error';
  message?: string;
  controlPlane?: ControlPlaneStatusSnapshot;
  operability?: {
    activeLeases: LeaseSummary[];
    staleRecoveries: StaleLeaseRecoveryEvent[];
    quiescence: QuiescenceIndicator;
  };
  /** Stuck-item summary for operational trust */
  stuck?: {
    work_items: { classification: string; count: number }[];
    outbound_handoffs: { classification: string; count: number }[];
  };
  /** Daemon readiness from .health.json (Task 234) */
  readiness?: DaemonHealthSnapshot['readiness'];
  isStale?: boolean;
  thresholds?: DaemonHealthSnapshot['thresholds'];
  /** Charter runtime health from .health.json (Task 284) */
  charterRuntimeHealth?: DaemonHealthSnapshot['charterRuntimeHealth'];
}

export async function statusCommand(
  options: StatusOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;

  // Site path: --site takes precedence over config
  if (options.site) {
    // If explicit mode provided for Linux
    if (options.mode === 'system' || options.mode === 'user') {
      return statusLinuxSite(options.site, options.mode, logger);
    }

    // Try macOS first
    const { isMacosSite } = await import('@narada2/macos-site');
    if (isMacosSite(options.site)) {
      return statusMacosSite(options.site, logger);
    }

    // Try Linux next
    try {
      const { isLinuxSite, resolveLinuxSiteMode } = await import('@narada2/linux-site');
      const linuxMode = resolveLinuxSiteMode(options.site);
      if (linuxMode) {
        return statusLinuxSite(options.site, linuxMode, logger);
      }
    } catch {
      // Linux package not available
    }

    return statusWindowsSite(options.site, logger);
  }

  logger.info('Loading config', { path: configPath });

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to read config: ' + (error as Error).message,
        health: 'error',
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to parse config: ' + (error as Error).message,
        health: 'error',
      },
    };
  }

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          error: 'Invalid multi-mailbox configuration',
          health: 'error',
        },
      };
    }

    const reports: StatusReport[] = [];
    for (const mailbox of config.mailboxes) {
      reports.push(await buildStatusReport(mailbox.mailbox_id, resolve(mailbox.root_dir)));
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mailboxes: reports,
      },
    };
  }

  let config;
  try {
    config = await loadConfig({ path: configPath });
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to load config: ' + (error as Error).message,
        health: 'error',
      },
    };
  }

  const scope = config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured', health: 'error' },
    };
  }

  const report = await buildStatusReport(scope.scope_id, resolve(scope.root_dir));

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      ...report,
    },
  };
}

async function statusMacosSite(
  siteId: string,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  logger.info('Querying macOS Site', { siteId });

  const { getMacosSiteStatus } = await import('@narada2/macos-site');

  try {
    const status = await getMacosSiteStatus(siteId);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        site: {
          id: status.siteId,
          substrate: 'macos',
          rootDir: status.siteRoot,
        },
        health: status.health.status,
        lastCycleAt: status.health.last_cycle_at,
        lastCycleDurationMs: status.health.last_cycle_duration_ms,
        consecutiveFailures: status.health.consecutive_failures,
        message: status.health.message,
        lastTrace: status.lastTrace,
      },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Failed to query macOS Site: ${(error as Error).message}`,
        health: 'error',
      },
    };
  }
}

async function statusLinuxSite(
  siteId: string,
  mode: 'system' | 'user',
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  logger.info('Querying Linux Site', { siteId, mode });

  const { getLinuxSiteStatus } = await import('@narada2/linux-site');

  try {
    const status = await getLinuxSiteStatus(siteId, mode);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        site: {
          id: status.siteId,
          substrate: 'linux',
          mode: status.mode,
          rootDir: status.siteRoot,
        },
        health: status.health.status,
        lastCycleAt: status.health.last_cycle_at,
        lastCycleDurationMs: status.health.last_cycle_duration_ms,
        consecutiveFailures: status.health.consecutive_failures,
        message: status.health.message,
        lastTrace: status.lastTrace,
      },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Failed to query Linux Site: ${(error as Error).message}`,
        health: 'error',
      },
    };
  }
}

async function statusWindowsSite(
  siteId: string,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  logger.info('Querying Windows Site', { siteId });

  const {
    resolveSiteVariant,
    getWindowsSiteStatus,
  } = await import('@narada2/windows-site');

  const variant = resolveSiteVariant(siteId);
  if (!variant) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Site "${siteId}" not found. Checked macOS, Linux (system/user), and Windows (native/WSL) paths.`,
        health: 'error',
      },
    };
  }

  try {
    const status = await getWindowsSiteStatus(siteId, variant);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        site: {
          id: status.siteId,
          variant: status.variant,
          rootDir: status.siteRoot,
        },
        health: status.health.status,
        lastCycleAt: status.health.last_cycle_at,
        lastCycleDurationMs: status.health.last_cycle_duration_ms,
        consecutiveFailures: status.health.consecutive_failures,
        message: status.health.message,
        lastTrace: status.lastTrace,
      },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Failed to query Windows Site: ${(error as Error).message}`,
        health: 'error',
      },
    };
  }
}

async function buildStatusReport(scopeId: string, rootDir: string): Promise<StatusReport> {
  const report: StatusReport = {
    mailbox: {
      id: scopeId,
      rootDir: rootDir,
    },
    sync: {
      lastSyncAt: null,
      cursor: null,
      totalEvents: 0,
    },
    storage: {
      messageCount: 0,
      tombstoneCount: 0,
      viewFolderCount: 0,
      applyLogCount: 0,
    },
    health: 'empty',
  };

  // Attempt to enrich with control-plane snapshot if coordinator.db exists
  const dbPath = join(rootDir, '.narada', 'coordinator.db');
  try {
    const dbStat = await stat(dbPath);
    if (dbStat.isFile()) {
      report.controlPlane = await loadControlPlaneSnapshot(dbPath, scopeId);
      if (report.controlPlane) {
        report.operability = {
          activeLeases: report.controlPlane.leases.active,
          staleRecoveries: report.controlPlane.stale_recoveries.recent,
          quiescence: report.controlPlane.quiescence,
        };
        report.stuck = report.controlPlane.stuck;
      }
    }
  } catch {
    // No control-plane database yet; leave controlPlane undefined
  }

  try {
    // Read cursor
    try {
      const cursorPath = join(rootDir, 'state', 'cursor.json');
      const cursorData = JSON.parse(await readFile(cursorPath, 'utf8')) as {
        cursor?: string;
        committed_cursor?: string;
        committed_at?: string;
      };
      report.sync.cursor = cursorData.committed_cursor ?? cursorData.cursor ?? null;
      if (!report.sync.lastSyncAt) {
        report.sync.lastSyncAt = cursorData.committed_at ?? null;
      }
    } catch {
      // No cursor yet
    }

    // Read last sync from apply-log (most recent file)
    try {
      const applyLogDir = join(rootDir, 'state', 'apply-log');
      const entries = await readdir(applyLogDir);
      const logFiles = entries.filter((f) => f.endsWith('.json'));
      report.storage.applyLogCount = logFiles.length;

      if (logFiles.length > 0) {
        // Sort by filename (timestamp) and get most recent
        logFiles.sort().reverse();
        const latestPath = join(applyLogDir, logFiles[0]);
        const latest = JSON.parse(await readFile(latestPath, 'utf8'));
        report.sync.lastSyncAt = latest.applied_at || null;
      }
    } catch {
      // No apply-log yet
    }

    // Count messages
    try {
      const messagesDir = join(rootDir, 'messages');
      const entries = await readdir(messagesDir, { withFileTypes: true });
      report.storage.messageCount = entries.filter((e) => e.isDirectory()).length;
    } catch {
      // No messages yet
    }

    // Count tombstones
    try {
      const tombstonesDir = join(rootDir, 'tombstones');
      const entries = await readdir(tombstonesDir);
      report.storage.tombstoneCount = entries.filter((f) => f.endsWith('.json')).length;
    } catch {
      // No tombstones yet
    }

    // Count view folders
    try {
      const viewsDir = join(rootDir, 'views');
      const entries = await readdir(viewsDir, { withFileTypes: true });
      report.storage.viewFolderCount = entries.filter((e) => e.isDirectory()).length;
    } catch {
      // No views yet
    }

    // Read daemon health file for readiness indicators (Task 234)
    try {
      const healthPath = join(rootDir, '.health.json');
      const healthRaw = await readFile(healthPath, 'utf8');
      const healthData = JSON.parse(healthRaw) as DaemonHealthSnapshot;
      if (healthData.readiness) {
        report.readiness = healthData.readiness;
      }
      if (typeof healthData.isStale === 'boolean') {
        report.isStale = healthData.isStale;
      }
      if (healthData.thresholds) {
        report.thresholds = healthData.thresholds;
      }
      if (healthData.charterRuntimeHealth) {
        report.charterRuntimeHealth = healthData.charterRuntimeHealth;
      }
    } catch {
      // No health file yet (daemon may not be running)
    }

    // Determine health
    if (report.storage.messageCount === 0) {
      report.health = 'empty';
      report.message = 'No messages synced yet. Run "narada sync" to start.';
    } else if (report.sync.lastSyncAt) {
      const lastSync = new Date(report.sync.lastSyncAt);
      const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);

      if (hoursSince > 24) {
        report.health = 'stale';
        report.message = `Last sync was ${Math.round(hoursSince)} hours ago.`;
      } else {
        report.health = 'healthy';
        report.message = `Last sync: ${lastSync.toLocaleString()}`;
      }
    } else {
      report.health = 'empty';
    }

    return report;
  } catch (error) {
    report.health = 'error';
    report.message = (error as Error).message;
    return report;
  }
}
