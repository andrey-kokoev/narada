/**
 * Sync Service - Long-running polling daemon core
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
  syncMultiple,
  writeMultiMailboxHealth,
  type ExchangeFsSyncConfig,
} from '@narada/exchange-fs-sync';
import { createLogger } from './lib/logger.js';
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
  perMailbox?: Record<string, {
    cyclesCompleted: number;
    eventsApplied: number;
    errors: number;
    lastSyncAt: Date | null;
  }>;
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
  let parsed: unknown;
  try {
    const raw = await readFile(resolve(opts.configPath), 'utf8');
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to load configuration from ${opts.configPath}: ${(error as Error).message}`,
    );
  }

  if (isMultiMailboxConfig(parsed)) {
    return createMultiMailboxService(opts, logger);
  }

  return createSingleMailboxService(opts, logger);
}

async function createSingleMailboxService(
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
): Promise<SyncService> {
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
  let currentIteration: Promise<unknown> | null = null;

  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
    consecutiveErrors: 0,
  };

  const backoff = new ExponentialBackoff();

  let wakeUp: (() => void) | null = null;
  function interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = globalThis.setTimeout(resolve, ms);
      wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

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
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
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
        await interruptibleSleep(delay);
        continue;
      }

      // Success - reset backoff and sleep normally
      backoff.reset();
      logger.debug(`Sleeping ${pollingIntervalMs}ms until next sync`);
      await interruptibleSleep(pollingIntervalMs);
    }
  }

  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    logger.info('Stopping service');
    stopRequested = true;
    if (wakeUp) {
      wakeUp();
    }

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
    await healthFile.markStopped({
      cyclesCompleted: stats.cyclesCompleted,
      eventsApplied: stats.eventsApplied,
      lastSyncAt: stats.lastSyncAt?.toISOString(),
      errors: stats.errors,
      consecutiveErrors: stats.consecutiveErrors,
      pid: process.pid,
    }).catch(() => {
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
      const initialPromise = runSingleSync();
      currentIteration = initialPromise;
      const initialResult = await initialPromise;

      // If fatal error on initial sync, don't start loop
      if (initialResult === 'fatal') {
        logger.error('Fatal error on initial sync, not starting polling loop');
        await stop();
        throw new Error('Initial sync failed with fatal error');
      }

      // Continue polling
      currentIteration = runLoop();
      await currentIteration;
    },

    stop,

    getStats(): SyncStats {
      return { ...stats };
    },
  };
}

async function createMultiMailboxService(
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
): Promise<SyncService> {
  const { config, valid } = await loadMultiMailboxConfig({ path: opts.configPath });
  if (!valid) {
    throw new Error('Invalid multi-mailbox configuration');
  }

  const pidFile = opts.pidFilePath
    ? new PidFile({ path: opts.pidFilePath, checkStale: true })
    : null;

  const healthPath = config.mailboxes[0]?.root_dir
    ? resolve(config.mailboxes[0].root_dir, '.multi-health.json')
    : resolve('.multi-health.json');

  let running = false;
  let stopRequested = false;
  let currentIteration: Promise<unknown> | null = null;
  const abortController = new AbortController();

  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
    consecutiveErrors: 0,
    perMailbox: Object.fromEntries(
      config.mailboxes.map((m) => [
        m.id,
        {
          cyclesCompleted: 0,
          eventsApplied: 0,
          errors: 0,
          lastSyncAt: null,
        },
      ]),
    ),
  };

  const backoff = new ExponentialBackoff();

  let wakeUp: (() => void) | null = null;
  function interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = globalThis.setTimeout(resolve, ms);
      wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  // Use the shortest polling interval across mailboxes, with a 60s ceiling
  const pollingIntervalMs = Math.min(
    ...config.mailboxes.map((m) => m.sync?.polling_interval_ms ?? 60000),
    60000,
  );

  async function runSingleSync(): Promise<'success' | 'retryable' | 'fatal'> {
    logger.info('Starting multi-mailbox sync cycle');

    try {
      const result = await syncMultiple(config, {
        continueOnError: true,
        abortSignal: abortController.signal,
        createTokenProvider: (mailbox) =>
          buildGraphTokenProvider({
            config: { graph: mailbox.graph } as ExchangeFsSyncConfig,
          }),
      });

      const totalApplied = result.results.reduce(
        (sum, r) => sum + (r.eventsApplied ?? r.messagesSynced),
        0,
      );

      stats.cyclesCompleted++;
      stats.eventsApplied += totalApplied;
      stats.lastSyncAt = new Date();

      for (const r of result.results) {
        const mb = stats.perMailbox?.[r.mailboxId];
        if (mb) {
          mb.cyclesCompleted++;
          mb.eventsApplied += r.eventsApplied ?? r.messagesSynced;
          mb.lastSyncAt = new Date();
          if (!r.success) {
            mb.errors++;
          }
        }
      }

      await writeMultiMailboxHealth(config, result.results, {
        healthFilePath: healthPath,
      }).catch((err) => {
        logger.warn('Failed to update health file', { error: (err as Error).message });
      });

      if (result.failures === 0) {
        stats.consecutiveErrors = 0;
        logger.info('Multi-mailbox sync complete', {
          successes: result.successes,
          duration_ms: result.totalDurationMs,
        });
        return 'success';
      }

      stats.errors += result.failures;
      stats.consecutiveErrors++;
      logger.warn('Multi-mailbox sync had failures', {
        failures: result.failures,
        cancelled: result.cancelled,
      });
      return result.cancelled ? 'retryable' : 'retryable';
    } catch (error) {
      stats.errors++;
      stats.consecutiveErrors++;
      logger.error(
        'Multi-mailbox sync error',
        error instanceof Error ? error : new Error(String(error)),
      );
      return 'fatal';
    }
  }

  async function runLoop(): Promise<void> {
    while (running && !stopRequested) {
      const result = await runSingleSync();

      if (stopRequested) break;

      if (result === 'fatal') {
        logger.error('Fatal error occurred, stopping service');
        await stop();
        return;
      }

      if (result === 'retryable') {
        const delay = backoff.next();
        logger.info(`Backing off for ${delay}ms before retry`);
        await interruptibleSleep(delay);
        continue;
      }

      backoff.reset();
      logger.debug(`Sleeping ${pollingIntervalMs}ms until next sync`);
      await interruptibleSleep(pollingIntervalMs);
    }
  }

  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    logger.info('Stopping multi-mailbox service');
    stopRequested = true;
    abortController.abort();
    if (wakeUp) {
      wakeUp();
    }

    if (currentIteration) {
      try {
        await currentIteration;
      } catch {
        // Ignore errors during shutdown
      }
    }

    running = false;

    await writeMultiMailboxHealth(config, [], { healthFilePath: healthPath }).catch(() => {
      // Ignore errors during shutdown
    });

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

      if (pidFile) {
        logger.debug('Writing PID file');
        await pidFile.write();
      }

      running = true;
      stopRequested = false;

      logger.info('Starting multi-mailbox service', {
        mailboxes: config.mailboxes.length,
        pollingInterval: pollingIntervalMs,
      });

      const initialPromise = runSingleSync();
      currentIteration = initialPromise;
      const initialResult = await initialPromise;

      if (initialResult === 'fatal') {
        logger.error('Fatal error on initial sync, not starting polling loop');
        await stop();
        throw new Error('Initial sync failed with fatal error');
      }

      currentIteration = runLoop();
      await currentIteration;
    },

    stop,

    getStats(): SyncStats {
      return { ...stats };
    },
  };
}
