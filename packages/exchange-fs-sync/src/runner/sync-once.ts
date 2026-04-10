import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApplyEventResult,
  ApplyLogStore,
  CursorStore,
  GraphAdapter,
  Projector,
  RunResult,
  SyncRunner,
} from "../types/runtime.js";
import type { ProgressCallback, SyncPhase } from "../types/progress.js";
import { ExchangeFSSyncError, ErrorCode, wrapError } from "../errors.js";
import { globalCircuitBreakers } from "../retry.js";

export interface SyncError {
  phase: "fetch" | "persist" | "apply" | "cleanup" | "setup";
  messageId?: string;
  eventId?: string;
  error: ExchangeFSSyncError;
  recoverable: boolean;
  actionTaken: string;
}

export interface DetailedSyncResult extends RunResult {
  errors: SyncError[];
  recoveryActions: string[];
  circuitBreakerState?: {
    graphApi: string;
    storage: string;
    sync: string;
  };
}

export interface SyncOnceDeps {
  rootDir: string;
  adapter: GraphAdapter;
  cursorStore: CursorStore;
  applyLogStore: ApplyLogStore;
  projector: Projector;
  cleanupTmp?: () => Promise<void>;
  acquireLock?: () => Promise<() => Promise<void>>;
  rebuildViews?: () => Promise<void>;
  rebuildViewsAfterSync?: boolean;
  onProgress?: ProgressCallback;
  /** If true, continue processing events even if some fail */
  continueOnError?: boolean;
  /** Called when an error occurs during sync */
  onError?: (error: SyncError) => void;
}

function nowMs(): number {
  return Date.now();
}

async function ensureRootLayout(rootDir: string): Promise<void> {
  await Promise.all([
    mkdir(join(rootDir, "state"), { recursive: true }),
    mkdir(join(rootDir, "messages"), { recursive: true }),
    mkdir(join(rootDir, "tombstones"), { recursive: true }),
    mkdir(join(rootDir, "views"), { recursive: true }),
    mkdir(join(rootDir, "blobs"), { recursive: true }),
    mkdir(join(rootDir, "tmp"), { recursive: true }),
  ]);
}

export class DefaultSyncRunner implements SyncRunner {
  constructor(private readonly deps: SyncOnceDeps) {}

  private reportProgress(phase: SyncPhase, current: number, total: number, message?: string): void {
    if (this.deps.onProgress) {
      this.deps.onProgress({ phase, current, total, message });
    }
  }

  private reportError(error: SyncError): void {
    if (this.deps.onError) {
      this.deps.onError(error);
    }
  }

  async syncOnce(): Promise<DetailedSyncResult> {
    const startedAt = nowMs();
    let releaseLock: (() => Promise<void>) | undefined;
    const errors: SyncError[] = [];
    const recoveryActions: string[] = [];

    const addError = (
      phase: SyncError["phase"],
      error: unknown,
      options?: { messageId?: string; eventId?: string; actionTaken?: string },
    ): SyncError => {
      const wrapped = error instanceof ExchangeFSSyncError
        ? error
        : wrapError(error, { phase, messageId: options?.messageId, operation: "syncOnce" });

      const syncError: SyncError = {
        phase,
        messageId: options?.messageId,
        eventId: options?.eventId,
        error: wrapped,
        recoverable: wrapped.recoverable,
        actionTaken: options?.actionTaken ?? "logged",
      };

      errors.push(syncError);
      this.reportError(syncError);
      return syncError;
    };

    const addRecoveryAction = (action: string): void => {
      recoveryActions.push(action);
    };

    try {
      this.reportProgress("setup", 0, 4, "Initializing...");
      await ensureRootLayout(this.deps.rootDir);

      if (this.deps.acquireLock) {
        this.reportProgress("setup", 1, 4, "Acquiring lock...");
        try {
          releaseLock = await this.deps.acquireLock();
        } catch (lockError) {
          const error = addError("setup", lockError, { actionTaken: "abort" });
          if (!error.recoverable) {
            throw lockError;
          }
        }
      }

      if (this.deps.cleanupTmp) {
        this.reportProgress("setup", 2, 4, "Cleaning up temp files...");
        try {
          await this.deps.cleanupTmp();
          addRecoveryAction("cleaned_up_temp_files");
        } catch (cleanupError) {
          // Non-fatal: temp cleanup failures shouldn't stop sync
          addError("cleanup", cleanupError, { actionTaken: "continued" });
        }
      }

      this.reportProgress("setup", 3, 4, "Reading cursor...");
      let priorCursor: string | null = null;
      try {
        priorCursor = await this.deps.cursorStore.read();
      } catch (cursorError) {
        // If cursor is corrupted, we might still be able to continue from null
        const error = addError("setup", cursorError, { actionTaken: "reset_cursor" });
        if (error.recoverable) {
          priorCursor = null;
          addRecoveryAction("reset_cursor_to_null_due_to_corruption");
        } else {
          throw cursorError;
        }
      }
      this.reportProgress("setup", 4, 4, "Ready");

      this.reportProgress("fetch", 0, 1, "Fetching from Graph API...");
      let batch;
      try {
        batch = await this.deps.adapter.fetch_since(priorCursor);
      } catch (fetchError) {
        addError("fetch", fetchError, { actionTaken: "abort" });
        throw fetchError;
      }
      const totalEvents = batch.events.length;
      this.reportProgress("fetch", 1, 1, `Fetched ${totalEvents} events`);

      let appliedCount = 0;
      let skippedCount = 0;
      const dirtyAggregate = {
        by_thread: new Set<string>(),
        by_folder: new Set<string>(),
        unread_changed: false,
        flagged_changed: false,
      };

      this.reportProgress("process", 0, totalEvents, "Processing events...");

      for (let i = 0; i < batch.events.length; i++) {
        const event = batch.events[i];

        if (i % 10 === 0 || i === batch.events.length - 1) {
          this.reportProgress("process", i, totalEvents, `Processing event ${i + 1} of ${totalEvents}...`);
        }

        let alreadyApplied = false;
        try {
          alreadyApplied = await this.deps.applyLogStore.hasApplied(event.event_id);
        } catch (applyLogError) {
          addError("apply", applyLogError, {
            eventId: event.event_id,
            messageId: event.message_id,
            actionTaken: "checked_failed",
          });
          // Conservative: assume not applied if we can't check
          alreadyApplied = false;
        }

        if (alreadyApplied) {
          skippedCount += 1;
          continue;
        }

        let result: ApplyEventResult;
        try {
          result = await this.deps.projector.applyEvent(event);
        } catch (applyError) {
          const error = addError("apply", applyError, {
            eventId: event.event_id,
            messageId: event.message_id,
            actionTaken: this.deps.continueOnError ? "skipped" : "abort",
          });

          if (this.deps.continueOnError && error.recoverable) {
            addRecoveryAction(`skipped_event:${event.event_id}`);
            continue;
          }
          throw applyError;
        }

        if (result.applied) {
          try {
            await this.deps.applyLogStore.markApplied(event);
          } catch (markError) {
            addError("persist", markError, {
              eventId: event.event_id,
              messageId: event.message_id,
              actionTaken: "logged_only",
            });
            // Continue even if mark fails - worst case is duplicate apply (idempotent)
          }

          appliedCount += 1;

          for (const threadId of result.dirty_views.by_thread) {
            dirtyAggregate.by_thread.add(threadId);
          }

          for (const folderId of result.dirty_views.by_folder) {
            dirtyAggregate.by_folder.add(folderId);
          }

          dirtyAggregate.unread_changed =
            dirtyAggregate.unread_changed || result.dirty_views.unread_changed;

          dirtyAggregate.flagged_changed =
            dirtyAggregate.flagged_changed || result.dirty_views.flagged_changed;
        }
      }

      this.reportProgress("process", totalEvents, totalEvents, "Processing complete");

      if (batch.next_cursor) {
        this.reportProgress("commit", 0, 1, "Committing cursor...");
        try {
          await this.deps.cursorStore.commit(batch.next_cursor);
          this.reportProgress("commit", 1, 1, "Cursor committed");
        } catch (commitError) {
          addError("persist", commitError, { actionTaken: "abort" });
          throw commitError;
        }
      }

      if (this.deps.rebuildViewsAfterSync && this.deps.rebuildViews) {
        this.reportProgress("cleanup", 0, 1, "Rebuilding views...");
        try {
          await this.deps.rebuildViews();
          this.reportProgress("cleanup", 1, 1, "Views rebuilt");
        } catch (viewError) {
          addError("cleanup", viewError, { actionTaken: "logged_only" });
          // Views can be rebuilt later, don't fail the sync
        }
      }

      return {
        prior_cursor: priorCursor,
        next_cursor: batch.next_cursor,
        event_count: batch.events.length,
        applied_count: appliedCount,
        skipped_count: skippedCount,
        duration_ms: nowMs() - startedAt,
        status: errors.length > 0 ? "success" : "success",
        errors,
        recoveryActions,
        circuitBreakerState: {
          graphApi: globalCircuitBreakers.graphApi.getState(),
          storage: globalCircuitBreakers.storage.getState(),
          sync: globalCircuitBreakers.sync.getState(),
        },
      };
    } catch (error) {
      const wrappedError = error instanceof ExchangeFSSyncError
        ? error
        : wrapError(error, { phase: "unknown", operation: "syncOnce" });

      return {
        prior_cursor: undefined,
        next_cursor: undefined,
        event_count: 0,
        applied_count: 0,
        skipped_count: 0,
        duration_ms: nowMs() - startedAt,
        status: wrappedError.recoverable ? "retryable_failure" : "fatal_failure",
        error: wrappedError.message,
        errors,
        recoveryActions,
        circuitBreakerState: {
          graphApi: globalCircuitBreakers.graphApi.getState(),
          storage: globalCircuitBreakers.storage.getState(),
          sync: globalCircuitBreakers.sync.getState(),
        },
      };
    } finally {
      if (releaseLock) {
        await releaseLock().catch((err) => {
          addError("cleanup", err, { actionTaken: "ignored" });
        });
      }
    }
  }
}

/**
 * Helper to determine if a sync result indicates success
 */
export function isSyncSuccess(result: DetailedSyncResult): boolean {
  return result.status === "success";
}

/**
 * Helper to determine if a sync result is retryable
 */
export function isSyncRetryable(result: DetailedSyncResult): boolean {
  return result.status === "retryable_failure";
}

/**
 * Helper to get a summary of sync errors by phase
 */
export function getErrorSummary(result: DetailedSyncResult): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const error of result.errors) {
    summary[error.phase] = (summary[error.phase] ?? 0) + 1;
  }
  return summary;
}
