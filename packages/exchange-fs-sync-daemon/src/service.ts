/**
 * Sync Service - Long-running polling daemon core
 */

import { setTimeout } from 'node:timers/promises';
import { join } from 'node:path';
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  DefaultGraphAdapter,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  FileMessageStore,
  FileTombstoneStore,
  FileViewStore,
  FileBlobStore,
  FileLock,
  applyEvent,
  cleanupTmp,
  normalizeFolderRef,
  normalizeFlagged,
} from '@narada/exchange-fs-sync';
import type { ExchangeFsSyncConfig } from '@narada/exchange-fs-sync';
import { createLogger, type Logger } from './lib/logger.js';
import { PidFile } from './lib/pid-file.js';
import { HealthFile, type HealthStatus } from './lib/health.js';

export interface SyncServiceConfig {
  configPath: string;
  verbose?: boolean;
  pidFilePath?: string;
}

export interface SyncService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStats(): SyncStats;
}

export interface SyncStats {
  cyclesCompleted: number;
  eventsApplied: number;
  lastSyncAt: Date | null;
  errors: number;
  consecutiveErrors: number;
}

/**
 * Exponential backoff for error handling
 */
class ExponentialBackoff {
  private delay: number;
  private readonly initialDelay: number;
  private readonly maxDelay: number;

  constructor(initialDelayMs = 5000, maxDelayMs = 300000) {
    this.initialDelay = initialDelayMs;
    this.maxDelay = maxDelayMs;
    this.delay = initialDelayMs;
  }

  next(): number {
    const current = this.delay;
    this.delay = Math.min(this.delay * 2, this.maxDelay);
    return current;
  }

  reset(): void {
    this.delay = this.initialDelay;
  }

  get currentDelay(): number {
    return this.delay;
  }
}

export async function createSyncService(
  opts: SyncServiceConfig,
): Promise<SyncService> {
  const logger = createLogger({ component: 'service', verbose: opts.verbose });
  
  logger.info('Loading configuration', { path: opts.configPath });
  const config = await loadConfig({ path: opts.configPath });

  const rootDir = config.root_dir;
  
  // Initialize PID file
  const pidFile = opts.pidFilePath 
    ? new PidFile({ path: opts.pidFilePath, checkStale: true })
    : null;
  
  // Initialize health file
  const healthFile = new HealthFile({ rootDir });

  let running = false;
  let stopRequested = false;
  let currentIteration: Promise<void> | null = null;

  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
    consecutiveErrors: 0,
  };

  const backoff = new ExponentialBackoff();

  // Initialize dependencies
  logger.debug('Initializing Graph client');
  const tokenProvider = buildGraphTokenProvider({ config });
  const client = new GraphHttpClient({
    tokenProvider,
    preferImmutableIds: config.graph.prefer_immutable_ids,
  });

  logger.debug('Creating Graph adapter');
  const adapter = new DefaultGraphAdapter({
    mailbox_id: config.mailbox_id,
    user_id: config.graph.user_id,
    client,
    adapter_scope: {
      mailbox_id: config.mailbox_id,
      included_container_refs: config.scope.included_container_refs,
      included_item_kinds: config.scope.included_item_kinds,
      attachment_policy: config.normalize.attachment_policy,
      body_policy: config.normalize.body_policy,
    },
    body_policy: config.normalize.body_policy,
    attachment_policy: config.normalize.attachment_policy,
    include_headers: config.normalize.include_headers,
    normalize_folder_ref,
    normalize_flagged,
  });

  logger.debug('Initializing persistence stores');
  const cursorStore = new FileCursorStore({
    rootDir,
    mailboxId: config.mailbox_id,
  });
  const applyLogStore = new FileApplyLogStore({ rootDir });
  const messageStore = new FileMessageStore({ rootDir });
  const tombstoneStore = new FileTombstoneStore({ rootDir });
  const viewStore = new FileViewStore({ rootDir });
  const blobStore = new FileBlobStore({ rootDir });
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: config.runtime.acquire_lock_timeout_ms,
  });

  const runner = new DefaultSyncRunner({
    rootDir,
    adapter,
    cursorStore,
    applyLogStore,
    projector: {
      applyEvent: (event) =>
        applyEvent(
          {
            blobs: blobStore,
            messages: messageStore,
            tombstones: tombstoneStore,
            views: viewStore,
            tombstones_enabled: config.normalize.tombstones_enabled,
          },
          event,
        ),
    },
    cleanupTmp: () => cleanupTmp({ rootDir }),
    acquireLock: () => lock.acquire(),
    rebuildViews: () => viewStore.rebuildAll(),
    rebuildViewsAfterSync: config.runtime.rebuild_views_after_sync,
  });

  const pollingIntervalMs = config.runtime.polling_interval_ms;

  async function updateHealth(): Promise<void> {
    const health: Omit<HealthStatus, 'timestamp'> = {
      status: running ? 'healthy' : 'stopped',
      lastSyncAt: stats.lastSyncAt?.toISOString(),
      cyclesCompleted: stats.cyclesCompleted,
      eventsApplied: stats.eventsApplied,
      errors: stats.errors,
      consecutiveErrors: stats.consecutiveErrors,
      pid: process.pid,
    };
    
    await healthFile.update(health).catch((err) => {
      logger.warn('Failed to update health file', { error: err.message });
    });
  }

  async function runSingleSync(): Promise<'success' | 'retryable' | 'fatal'> {
    logger.info('Starting sync cycle');
    const startTime = Date.now();

    try {
      const result = await runner.syncOnce();

      if (result.status === 'success') {
        stats.cyclesCompleted++;
        stats.eventsApplied += result.applied_count;
        stats.lastSyncAt = new Date();
        stats.consecutiveErrors = 0;

        logger.info('Sync complete', {
          applied: result.applied_count,
          skipped: result.skipped_count,
          duration_ms: result.duration_ms,
        });
        
        await updateHealth();
        return 'success';
      } else if (result.status === 'retryable_failure') {
        stats.errors++;
        stats.consecutiveErrors++;
        logger.warn('Sync failed (retryable)', { error: result.error });
        await updateHealth();
        return 'retryable';
      } else {
        // fatal_failure
        stats.errors++;
        stats.consecutiveErrors++;
        logger.error('Sync failed (fatal)', new Error(result.error || 'Unknown error'));
        await updateHealth();
        return 'fatal';
      }
    } catch (error) {
      stats.errors++;
      stats.consecutiveErrors++;
      logger.error('Sync error', error instanceof Error ? error : new Error(String(error)));
      await updateHealth();
      return 'fatal';
    }
  }

  async function runLoop(): Promise<void> {
    while (running && !stopRequested) {
      const result = await runSingleSync();

      if (stopRequested) break;

      // Handle fatal errors - stop the service
      if (result === 'fatal') {
        logger.error('Fatal error occurred, stopping service');
        await stop();
        return;
      }

      // Handle retryable errors with backoff
      if (result === 'retryable') {
        const delay = backoff.next();
        logger.info(`Backing off for ${delay}ms before retry`);
        await setTimeout(delay);
        continue;
      }

      // Success - reset backoff and sleep normally
      backoff.reset();
      logger.debug(`Sleeping ${pollingIntervalMs}ms until next sync`);
      await setTimeout(pollingIntervalMs);
    }
  }

  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    logger.info('Stopping service');
    stopRequested = true;

    // Wait for current iteration to complete
    if (currentIteration) {
      try {
        await currentIteration;
      } catch {
        // Ignore errors during shutdown
      }
    }

    running = false;

    // Update health file with stopped status
    await healthFile.markStopped(stats).catch(() => {
      // Ignore errors during shutdown
    });

    // Remove PID file
    if (pidFile) {
      await pidFile.remove().catch(() => {
        // Ignore errors during shutdown
      });
    }

    logger.info('Service stopped', {
      cycles: stats.cyclesCompleted,
      events: stats.eventsApplied,
      errors: stats.errors,
    });
  }

  return {
    async start(): Promise<void> {
      if (running) {
        throw new Error('Service already running');
      }

      // Write PID file
      if (pidFile) {
        logger.debug('Writing PID file');
        await pidFile.write();
      }

      running = true;
      stopRequested = false;

      logger.info('Starting service', {
        mailbox: config.mailbox_id,
        rootDir: config.root_dir,
        pollingInterval: pollingIntervalMs,
      });

      // Run initial sync
      currentIteration = runSingleSync();
      const initialResult = await currentIteration;

      // If fatal error on initial sync, don't start loop
      if (initialResult === 'fatal') {
        logger.error('Fatal error on initial sync, not starting polling loop');
        await stop();
        throw new Error('Initial sync failed with fatal error');
      }

      // Continue polling
      await runLoop();
    },

    stop,
    
    getStats(): SyncStats {
      return { ...stats };
    },
  };
}
