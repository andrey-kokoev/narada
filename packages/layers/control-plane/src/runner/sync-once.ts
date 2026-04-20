import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApplyEventResult,
  ApplyLogStore,
  CursorStore,
  Projector,
  RunResult,
  SyncRunner,
} from "../types/runtime.js";
import type { Source } from "../types/source.js";
import type { FactStore } from "../facts/types.js";
import { sourceRecordToFact } from "../facts/record-to-fact.js";
import type { ProgressCallback, SyncPhase } from "../types/progress.js";
import { ExchangeFSSyncError, wrapError } from "../errors.js";
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
  source: Source;
  cursorStore: CursorStore;
  applyLogStore: ApplyLogStore;
  projector: Projector;
  /** Optional fact store for durable canonical boundary */
  factStore?: FactStore;
  cleanupTmp?: () => Promise<void>;
  acquireLock?: () => Promise<() => Promise<void>>;
  /** @deprecated Use rebuildProjections instead */
  rebuildViews?: () => Promise<void>;
  /** @deprecated Use rebuildProjectionsAfterSync instead */
  rebuildViewsAfterSync?: boolean;
  /** Unified projection rebuild callback (canonical path) */
  rebuildProjections?: () => Promise<void>;
  /** Whether to rebuild all projections after a successful sync */
  rebuildProjectionsAfterSync?: boolean;
  onProgress?: ProgressCallback;
  /** If true, continue processing events even if some fail */
  continueOnError?: boolean;
  /** Called when an error occurs during sync */
  onError?: (error: SyncError) => void;
}

function nowMs(): number {
  return Date.now();
}

export async function ensureRootLayout(rootDir: string): Promise<void> {
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

      this.reportProgress("fetch", 0, 1, "Fetching from source...");
      let batch;
      try {
        batch = await this.deps.source.pull(priorCursor);
      } catch (fetchError) {
        addError("fetch", fetchError, { actionTaken: "abort" });
        throw fetchError;
      }
      const totalEvents = batch.records.length;
      this.reportProgress("fetch", 1, 1, `Fetched ${totalEvents} records`);

      let appliedCount = 0;
      let skippedCount = 0;
      const dirtyAggregate = {
        by_thread: new Set<string>(),
        by_folder: new Set<string>(),
        unread_changed: false,
        flagged_changed: false,
      };

      this.reportProgress("process", 0, totalEvents, "Processing events...");

      for (let i = 0; i < batch.records.length; i++) {
        const record = batch.records[i]!;
        const recordId = record.recordId;

        if (i % 10 === 0 || i === batch.records.length - 1) {
          this.reportProgress("process", i, totalEvents, `Processing record ${i + 1} of ${totalEvents}...`);
        }

        let alreadyApplied = false;
        try {
          alreadyApplied = await this.deps.applyLogStore.hasApplied(recordId);
        } catch (applyLogError) {
          addError("apply", applyLogError, {
            eventId: recordId,
            actionTaken: "checked_failed",
          });
          // Conservative: assume not applied if we can't check
          alreadyApplied = false;
        }

        if (alreadyApplied) {
          skippedCount += 1;
          continue;
        }

        // Materialize fact for this unapplied record as the canonical durable boundary
        if (this.deps.factStore) {
          try {
            const fact = sourceRecordToFact(record, batch.nextCheckpoint ?? null);
            this.deps.factStore.ingest(fact);
          } catch (factError) {
            addError("persist", factError, { actionTaken: "logged_only" });
            // Continue: fact persistence failures should not abort sync
          }
        }

        let result: ApplyEventResult;
        try {
          result = await this.deps.projector.applyRecord(record);
        } catch (applyError) {
          const error = addError("apply", applyError, {
            eventId: recordId,
            actionTaken: this.deps.continueOnError ? "skipped" : "abort",
          });

          if (this.deps.continueOnError && error.recoverable) {
            addRecoveryAction(`skipped_record:${recordId}`);
            continue;
          }
          throw applyError;
        }

        if (result.applied) {
          try {
            await this.deps.applyLogStore.markApplied(recordId, record.payload);
          } catch (markError) {
            addError("persist", markError, {
              eventId: recordId,
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

      if (batch.nextCheckpoint) {
        this.reportProgress("commit", 0, 1, "Committing checkpoint...");
        try {
          await this.deps.cursorStore.commit(batch.nextCheckpoint);
          this.reportProgress("commit", 1, 1, "Checkpoint committed");
        } catch (commitError) {
          addError("persist", commitError, { actionTaken: "abort" });
          throw commitError;
        }
      }

      const shouldRebuildProjections = this.deps.rebuildProjectionsAfterSync ?? this.deps.rebuildViewsAfterSync;
      const rebuildFn = this.deps.rebuildProjections ?? this.deps.rebuildViews;
      if (shouldRebuildProjections && rebuildFn) {
        this.reportProgress("cleanup", 0, 1, "Rebuilding projections...");
        try {
          await rebuildFn();
          this.reportProgress("cleanup", 1, 1, "Projections rebuilt");
        } catch (projError) {
          addError("cleanup", projError, { actionTaken: "logged_only" });
          // Projections can be rebuilt later, don't fail the sync
        }
      }

      return {
        prior_cursor: priorCursor,
        next_cursor: batch.nextCheckpoint,
        event_count: batch.records.length,
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
