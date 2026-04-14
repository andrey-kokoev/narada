/**
 * Multi-mailbox parallel sync runner
 * 
 * Syncs multiple mailboxes concurrently with resource management and
 * graceful error handling.
 */

import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { MultiMailboxConfig, MailboxConfig } from "../config/multi-mailbox.js";
import { ResourceManager } from "../utils/resources.js";
import type { MailboxSyncResult } from "../health-multi.js";
import { writeMultiMailboxHealth, markMailboxSyncing } from "../health-multi.js";
import { SharedTokenProvider } from "../adapter/graph/shared-token.js";
import { ClientCredentialsTokenProvider } from "../adapter/graph/auth.js";
import { DefaultGraphAdapter } from "../adapter/graph/adapter.js";
import { GraphHttpClient } from "../adapter/graph/client.js";
import { FileCursorStore } from "../persistence/cursor.js";
import { FileApplyLogStore } from "../persistence/apply-log.js";
import { DefaultProjector } from "../projector/apply-event.js";
import { cleanupTmp } from "../recovery/cleanup-tmp.js";
import { FileLock } from "../persistence/lock.js";
import { DefaultSyncRunner } from "./sync-once.js";
import { normalizeFolderRef, normalizeFlagged } from "../adapter/graph/scope.js";
import { createHealthWriter } from "../health.js";
import { sleep } from "../utils/timing.js";

/** Options for multi-sync operation */
export interface MultiSyncOptions {
  /** Specific mailbox IDs to sync (undefined = all) */
  mailboxIds?: string[];
  /** Continue on single mailbox error */
  continueOnError: boolean;
  /** Override max concurrency */
  maxConcurrency?: number;
  /** Progress callback */
  onProgress?: (mailboxId: string, phase: string, current: number, total: number) => void;
  /** Called when a mailbox sync completes */
  onMailboxComplete?: (result: MailboxSyncResult) => void;
}

/** Result of multi-mailbox sync */
export interface MultiSyncResult {
  /** Individual mailbox results */
  results: MailboxSyncResult[];
  /** Total duration in ms */
  totalDurationMs: number;
  /** Number of successful syncs */
  successes: number;
  /** Number of failed syncs */
  failures: number;
  /** Whether any mailbox was cancelled */
  cancelled: boolean;
}

/** Options for syncMultiple function */
export interface SyncMultipleOptions extends MultiSyncOptions {
  /** Custom resource manager */
  resourceManager?: ResourceManager;
  /** Custom shared token provider */
  sharedTokenProvider?: SharedTokenProvider;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Custom token provider factory per mailbox */
  createTokenProvider?: (mailbox: MailboxConfig) => { getAccessToken: () => Promise<string> };
}

/** Internal sync state */
interface SyncState {
  abortController: AbortController;
  activePromises: Map<string, Promise<MailboxSyncResult>>;
  completedResults: MailboxSyncResult[];
  resourceManager: ResourceManager;
  sharedTokenProvider?: SharedTokenProvider;
  createTokenProvider?: (mailbox: MailboxConfig) => { getAccessToken: () => Promise<string> };
}

/** Create token provider for a mailbox */
function createTokenProvider(
  config: MultiMailboxConfig,
  mailbox: MailboxConfig,
  sharedProvider?: SharedTokenProvider,
): ClientCredentialsTokenProvider | { getAccessToken: () => Promise<string> } {
  // Use shared token provider if available and mailbox doesn't have explicit credentials
  if (sharedProvider && config.shared?.token_provider) {
    const sharedConfig = config.shared.token_provider;
    return {
      getAccessToken: async () => {
        const token = await sharedProvider.getToken(sharedConfig);
        return token.accessToken;
      },
    };
  }

  // Use mailbox-specific credentials
  const tenantId = mailbox.graph.tenant_id;
  const clientId = mailbox.graph.client_id;
  const clientSecret = mailbox.graph.client_secret;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      `Mailbox ${mailbox.id} missing required credentials (tenant_id, client_id, client_secret)`,
    );
  }

  return new ClientCredentialsTokenProvider({
    tenantId,
    clientId,
    clientSecret,
    scope: "https://graph.microsoft.com/Mail.Read",
  });
}

/** Sync a single mailbox */
async function syncSingleMailbox(
  config: MultiMailboxConfig,
  mailbox: MailboxConfig,
  state: SyncState,
): Promise<MailboxSyncResult> {
  const startTime = Date.now();

  try {
    // Check for abort
    if (state.abortController.signal.aborted) {
      return {
        mailboxId: mailbox.id,
        success: false,
        durationMs: 0,
        messagesSynced: 0,
        error: new Error("Sync cancelled"),
      };
    }

    // Track resources
    state.resourceManager.trackSync(mailbox.id);

    // Ensure root directory exists
    const rootDir = resolve(mailbox.root_dir);
    await mkdir(rootDir, { recursive: true });

    // Mark as syncing in health file
    const healthPath = join(config.mailboxes[0]?.root_dir ?? rootDir, ".multi-health.json");
    await markMailboxSyncing(healthPath, mailbox.id).catch(() => {
      // Non-fatal: health update failure shouldn't stop sync
    });

    // Create token provider
    const tokenProvider = state.createTokenProvider
      ? state.createTokenProvider(mailbox)
      : createTokenProvider(config, mailbox, state.sharedTokenProvider);

    // Create Graph HTTP client
    const graphClient = new GraphHttpClient({
      tokenProvider,
      baseUrl: mailbox.graph.base_url,
      preferImmutableIds: mailbox.graph.prefer_immutable_ids,
    });

    // Create adapter
    const adapter = new DefaultGraphAdapter({
      mailbox_id: mailbox.mailbox_id,
      user_id: mailbox.graph.user_id,
      client: graphClient,
      adapter_scope: {
        mailbox_id: mailbox.mailbox_id,
        included_container_refs: mailbox.scope?.included_container_refs ?? ["inbox", "sentitems", "drafts", "archive"],
        included_item_kinds: mailbox.scope?.included_item_kinds ?? ["message"],
      },
      body_policy: mailbox.sync?.body_policy ?? "text_only",
      attachment_policy: mailbox.sync?.attachment_policy ?? "metadata_only",
      include_headers: mailbox.sync?.include_headers ?? false,
      normalize_folder_ref: normalizeFolderRef,
      normalize_flagged: normalizeFlagged,
    });

    // Create persistence stores
    const cursorStore = new FileCursorStore({
      rootDir,
      mailboxId: mailbox.mailbox_id,
    });

    const applyLogStore = new FileApplyLogStore({ rootDir });

    const projector = new DefaultProjector({
      rootDir,
      tombstonesEnabled: mailbox.sync?.tombstones_enabled ?? true,
    });

    const lock = new FileLock({
      rootDir,
      acquireTimeoutMs: mailbox.sync?.acquire_lock_timeout_ms ?? 30000,
    });

    const healthWriter = createHealthWriter({
      rootDir,
      mailboxId: mailbox.mailbox_id,
    });

    // Create sync runner
    const runner = new DefaultSyncRunner({
      rootDir,
      adapter,
      cursorStore,
      applyLogStore,
      projector,
      cleanupTmp: mailbox.sync?.cleanup_tmp_on_startup
        ? () => cleanupTmp({ rootDir })
        : undefined,
      acquireLock: () => lock.acquire(),
      rebuildViewsAfterSync: mailbox.sync?.rebuild_views_after_sync ?? true,
      onProgress: (_progress) => {
        // Could forward to global progress handler
      },
      continueOnError: true, // Continue on individual event errors
    });

    // Run sync
    const syncResult = await runner.syncOnce();
    const durationMs = Date.now() - startTime;

    // Update health file
    await healthWriter.markSuccess(
      syncResult.applied_count,
      syncResult.skipped_count,
      durationMs,
    ).catch(() => {
      // Non-fatal
    });

    // End resource tracking
    state.resourceManager.endSync(mailbox.id);

    const result: MailboxSyncResult = {
      mailboxId: mailbox.id,
      success: syncResult.status === "success",
      durationMs,
      messagesSynced: syncResult.applied_count,
      eventsApplied: syncResult.applied_count,
      eventsSkipped: syncResult.skipped_count,
    };

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    state.resourceManager.endSync(mailbox.id);

    return {
      mailboxId: mailbox.id,
      success: false,
      durationMs,
      messagesSynced: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** Run sync with throttling */
async function runThrottledSync(
  config: MultiMailboxConfig,
  mailbox: MailboxConfig,
  state: SyncState,
  options: SyncMultipleOptions,
): Promise<MailboxSyncResult> {
  // Wait for resource availability
  while (!state.resourceManager.canStartSync(mailbox.id)) {
    if (state.abortController.signal.aborted) {
      return {
        mailboxId: mailbox.id,
        success: false,
        durationMs: 0,
        messagesSynced: 0,
        error: new Error("Sync cancelled waiting for resources"),
      };
    }

    const delay = state.resourceManager.getThrottlingDelay();
    if (delay > 0) {
      await sleep(delay);
    } else {
      break;
    }
  }

  // Apply throttling delay
  const throttleDelay = state.resourceManager.getThrottlingDelay();
  if (throttleDelay > 0) {
    await sleep(throttleDelay);
  }

  // Run the sync
  const result = await syncSingleMailbox(config, mailbox, state);

  // Notify completion
  options.onMailboxComplete?.(result);

  return result;
}

/** Sync multiple mailboxes in parallel */
export async function syncMultiple(
  config: MultiMailboxConfig,
  options: SyncMultipleOptions = { continueOnError: true },
): Promise<MultiSyncResult> {
  const startTime = Date.now();

  // Filter mailboxes to sync
  let mailboxesToSync = config.mailboxes;
  if (options.mailboxIds && options.mailboxIds.length > 0) {
    mailboxesToSync = config.mailboxes.filter(m =>
      options.mailboxIds!.includes(m.id),
    );
  }

  if (mailboxesToSync.length === 0) {
    return {
      results: [],
      totalDurationMs: 0,
      successes: 0,
      failures: 0,
      cancelled: false,
    };
  }

  // Determine concurrency limit
  const maxConcurrency =
    options.maxConcurrency ??
    config.global?.max_concurrent_syncs ??
    2;

  // Initialize resource manager
  const resourceManager =
    options.resourceManager ??
    new ResourceManager(config.global?.resource_limits);

  // Initialize shared token provider if configured
  let sharedTokenProvider: SharedTokenProvider | undefined;
  if (config.shared?.token_provider) {
    sharedTokenProvider = options.sharedTokenProvider ?? new SharedTokenProvider();
  }

  // Create abort controller
  const abortController = new AbortController();

  // Link external abort signal if provided
  if (options.abortSignal) {
    options.abortSignal.addEventListener("abort", () => {
      abortController.abort();
    });
  }

  // Create sync state
  const state: SyncState = {
    abortController,
    activePromises: new Map(),
    completedResults: [],
    resourceManager,
    sharedTokenProvider,
    createTokenProvider: options.createTokenProvider,
  };

  // Process mailboxes with concurrency control
  const results: MailboxSyncResult[] = [];
  let index = 0;

  async function processNext(): Promise<void> {
    if (abortController.signal.aborted) {
      return;
    }

    const mailbox = mailboxesToSync[index++];
    if (!mailbox) return;

    const promise = runThrottledSync(config, mailbox, state, options);
    state.activePromises.set(mailbox.id, promise);

    try {
      const result = await promise;
      results.push(result);
      state.completedResults.push(result);

      // If not continuing on error and this failed, abort others
      if (!options.continueOnError && !result.success) {
        abortController.abort();
      }
    } finally {
      state.activePromises.delete(mailbox.id);
    }

    // Process next if not aborted
    if (!abortController.signal.aborted || options.continueOnError) {
      await processNext();
    }
  }

  // Start initial batch of workers
  const workers = Array(Math.min(maxConcurrency, mailboxesToSync.length))
    .fill(null)
    .map(() => processNext());

  // Wait for all workers to complete
  await Promise.all(workers);

  // Wait for any remaining active syncs
  await Promise.all(Array.from(state.activePromises.values()));

  const totalDurationMs = Date.now() - startTime;
  const successes = results.filter(r => r.success).length;
  const failures = results.length - successes;

  // Write aggregate health file
  try {
    await writeMultiMailboxHealth(config, results);
  } catch {
    // Non-fatal: health write failure shouldn't fail the sync
  }

  return {
    results,
    totalDurationMs,
    successes,
    failures,
    cancelled: abortController.signal.aborted && failures > 0,
  };
}

/**
 * Graceful shutdown handler for active syncs
 */
export async function gracefulShutdown(
  state: SyncState,
  timeoutMs: number = 30000,
): Promise<void> {
  // Signal abort
  state.abortController.abort();

  // Wait for active syncs with timeout
  const activePromises = Array.from(state.activePromises.values());
  if (activePromises.length === 0) return;

  await Promise.race([
    Promise.all(activePromises),
    sleep(timeoutMs),
  ]);
}

/**
 * Check if all mailboxes are healthy
 */
export function allMailboxesHealthy(result: MultiSyncResult): boolean {
  return result.failures === 0 && result.successes > 0;
}

/**
 * Get failed mailbox IDs
 */
export function getFailedMailboxIds(result: MultiSyncResult): string[] {
  return result.results
    .filter(r => !r.success)
    .map(r => r.mailboxId);
}

/**
 * Format multi-sync result for display
 */
export function formatMultiSyncResult(result: MultiSyncResult): string {
  const lines: string[] = [];
  
  lines.push(`Multi-Mailbox Sync Complete`);
  lines.push(`  Total Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push(`  Successes: ${result.successes}`);
  lines.push(`  Failures: ${result.failures}`);
  lines.push("");
  
  lines.push("Per-Mailbox Results:");
  for (const r of result.results) {
    const status = r.success ? "✓" : "✗";
    const duration = `${(r.durationMs / 1000).toFixed(1)}s`;
    const messages = r.messagesSynced.toLocaleString();
    lines.push(`  ${status} ${r.mailboxId}: ${messages} messages in ${duration}`);
    if (r.error) {
      lines.push(`    Error: ${r.error.message.slice(0, 100)}`);
    }
  }

  return lines.join("\n");
}
