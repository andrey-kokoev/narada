/**
 * Sync Service - Long-running polling daemon core
 */

import { setTimeout } from 'node:timers/promises';
import type { ExchangeFsSyncConfig } from 'exchange-fs-sync/src/config/types.js';
import { loadConfig } from 'exchange-fs-sync/src/config/load.js';
import { buildGraphTokenProvider } from 'exchange-fs-sync/src/config/token-provider.js';
import { GraphHttpClient } from 'exchange-fs-sync/src/adapter/graph/client.js';
import { DefaultGraphAdapter } from 'exchange-fs-sync/src/adapter/graph/adapter.js';
import { DefaultSyncRunner } from 'exchange-fs-sync/src/runner/sync-once.js';
import { FileCursorStore } from 'exchange-fs-sync/src/persistence/cursor.js';
import { FileApplyLogStore } from 'exchange-fs-sync/src/persistence/apply-log.js';
import { FileMessageStore } from 'exchange-fs-sync/src/persistence/messages.js';
import { FileTombstoneStore } from 'exchange-fs-sync/src/persistence/tombstones.js';
import { FileViewStore } from 'exchange-fs-sync/src/persistence/views.js';
import { FileBlobStore } from 'exchange-fs-sync/src/persistence/blobs.js';
import { FileLock } from 'exchange-fs-sync/src/persistence/lock.js';
import { applyEvent } from 'exchange-fs-sync/src/projector/apply-event.js';
import { cleanupTmp } from 'exchange-fs-sync/src/recovery/cleanup-tmp.js';

export interface SyncServiceConfig {
  configPath: string;
}

export interface SyncService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface SyncStats {
  cyclesCompleted: number;
  eventsApplied: number;
  lastSyncAt: Date | null;
  errors: number;
}

export async function createSyncService(
  opts: SyncServiceConfig,
): Promise<SyncService> {
  const config = await loadConfig({ path: opts.configPath });
  
  let running = false;
  let stopRequested = false;
  let currentIteration: Promise<void> | null = null;
  
  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
  };
  
  // Initialize dependencies
  const tokenProvider = buildGraphTokenProvider({ config });
  const client = new GraphHttpClient({
    tokenProvider,
    preferImmutableIds: config.graph.prefer_immutable_ids,
  });
  
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
    normalize_folder_ref: (folderId) => [folderId ?? 'unknown'],
    normalize_flagged: (flag) => flag?.flagStatus === 'flagged',
  });
  
  const rootDir = config.root_dir;
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
  
  async function runSingleSync(): Promise<void> {
    console.log('[service] Starting sync cycle...');
    const startTime = Date.now();
    
    try {
      const result = await runner.syncOnce();
      
      if (result.status === 'success') {
        stats.cyclesCompleted++;
        stats.eventsApplied += result.applied_count;
        stats.lastSyncAt = new Date();
        
        console.log(
          `[service] Sync complete: ${result.applied_count} applied, ` +
          `${result.skipped_count} skipped, ${result.duration_ms}ms`,
        );
      } else {
        stats.errors++;
        console.error(`[service] Sync failed: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      console.error('[service] Sync error:', error);
    }
  }
  
  async function runLoop(): Promise<void> {
    while (running && !stopRequested) {
      currentIteration = runSingleSync();
      await currentIteration;
      
      if (stopRequested) break;
      
      console.log(`[service] Sleeping ${pollingIntervalMs}ms...`);
      await setTimeout(pollingIntervalMs);
    }
  }
  
  return {
    async start(): Promise<void> {
      if (running) {
        throw new Error('Service already running');
      }
      
      running = true;
      stopRequested = false;
      
      console.log('[service] Starting with config:');
      console.log(`  - Mailbox: ${config.mailbox_id}`);
      console.log(`  - Root dir: ${config.root_dir}`);
      console.log(`  - Polling interval: ${pollingIntervalMs}ms`);
      
      // Run initial sync
      await runSingleSync();
      
      // Continue polling
      await runLoop();
    },
    
    async stop(): Promise<void> {
      if (!running) {
        return;
      }
      
      console.log('[service] Stopping...');
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
      
      console.log('[service] Stopped. Stats:', {
        cycles: stats.cyclesCompleted,
        events: stats.eventsApplied,
        errors: stats.errors,
        lastSync: stats.lastSyncAt?.toISOString(),
      });
    },
  };
}
