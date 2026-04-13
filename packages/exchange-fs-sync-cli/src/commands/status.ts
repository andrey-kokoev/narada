import { resolve } from 'node:path';
import { stat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada/exchange-fs-sync';

export interface StatusOptions {
  config?: string;
  verbose?: boolean;
  format?: string;
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
}

export async function statusCommand(
  options: StatusOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;

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

  let config: { mailbox_id: string; root_dir: string };
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

  const report = await buildStatusReport(config.mailbox_id, resolve(config.root_dir));

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      ...report,
    },
  };
}

async function buildStatusReport(mailboxId: string, rootDir: string): Promise<StatusReport> {
  const report: StatusReport = {
    mailbox: {
      id: mailboxId,
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

  try {
    // Read cursor
    try {
      const cursorPath = join(rootDir, 'state', 'cursor.json');
      const cursorData = JSON.parse(await readFile(cursorPath, 'utf8'));
      report.sync.cursor = cursorData.cursor || null;
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

    // Determine health
    if (report.storage.messageCount === 0) {
      report.health = 'empty';
      report.message = 'No messages synced yet. Run "exchange-sync sync" to start.';
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
