#!/usr/bin/env node
/**
 * exchange-fs-sync-daemon
 *
 * Long-running polling daemon for continuous mailbox synchronization.
 * Uses the core exchange-fs-sync package for actual sync operations.
 */

import { createSyncService, type SyncServiceConfig } from './service.js';
import { createLogger } from './lib/logger.js';
import { PidFile } from './lib/pid-file.js';
import { join } from 'node:path';

interface DaemonConfig {
  configPath: string;
  shutdownTimeoutMs: number;
  verbose: boolean;
  pidFilePath?: string;
}

function loadDaemonConfig(): DaemonConfig {
  const configPath = process.env.CONFIG_PATH || './config.json';
  const shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);
  const verbose = process.env.VERBOSE === 'true' || process.env.DEBUG === 'true';
  const pidFilePath = process.env.PID_FILE_PATH || undefined;

  return {
    configPath,
    shutdownTimeoutMs,
    verbose,
    pidFilePath,
  };
}

async function main(): Promise<void> {
  const daemonConfig = loadDaemonConfig();
  const logger = createLogger({ component: 'daemon', verbose: daemonConfig.verbose });

  logger.info('Starting exchange-fs-sync-daemon', {
    config: daemonConfig.configPath,
    pid: process.pid,
  });

  const service = await createSyncService({
    configPath: daemonConfig.configPath,
    verbose: daemonConfig.verbose,
    pidFilePath: daemonConfig.pidFilePath,
  });

  // Graceful shutdown handling
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      logger.info('Shutdown already in progress');
      return;
    }

    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);

    // Create a timeout promise that rejects
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Shutdown timeout exceeded'));
      }, daemonConfig.shutdownTimeoutMs);
    });

    try {
      await Promise.race([
        service.stop(),
        timeoutPromise,
      ]);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error(
        'Shutdown timed out or failed',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', new Error(String(reason)));
  });

  // Start the service
  try {
    await service.start();
  } catch (error) {
    logger.error(
      'Failed to start service',
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[daemon] Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
