/**
 * MultiSourceSyncRunner
 *
 * Syncs from multiple Source instances within a single scope, merging their
 * fact streams into a deterministic, replay-safe sequence.
 *
 * Design principles:
 * - Each source maintains an independent opaque checkpoint
 * - Checkpoints are persisted as a composite JSON cursor via ScopeCursorStore
 * - Records from all sources are merged by sorting on (observedAt, recordId)
 * - Apply-log deduplication (by recordId) remains the idempotency boundary
 * - A cursor is only committed after all records ≤ that cursor have been applied
 */

import type {
  ApplyLogStore,
  CursorStore,
  Projector,
  SyncRunner,
} from "../types/runtime.js";
import type { Source, SourceBatch, SourceRecord } from "../types/source.js";
import type { FactStore } from "../facts/types.js";
import { sourceRecordToFact } from "../facts/record-to-fact.js";
import type { ProgressCallback, SyncPhase } from "../types/progress.js";
import { ExchangeFSSyncError, wrapError } from "../errors.js";
import { globalCircuitBreakers } from "../retry.js";
import { ScopeCursorStore } from "../persistence/scope-cursor.js";
import type { SyncError, DetailedSyncResult } from "./sync-once.js";
import { ensureRootLayout } from "./sync-once.js";

export interface MultiSyncOnceDeps {
  rootDir: string;
  /** Multiple sources to pull from */
  sources: Source[];
  /** Underlying cursor store (wrapped by ScopeCursorStore) */
  cursorStore: CursorStore;
  applyLogStore: ApplyLogStore;
  projector: Projector;
  /** Optional fact store for durable canonical boundary */
  factStore?: FactStore;
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

interface FetchedBatch {
  sourceId: string;
  batch: SourceBatch;
}

interface TaggedRecord extends SourceRecord {
  _sourceId: string;
}

function tagRecord(record: SourceRecord, sourceId: string): TaggedRecord {
  return { ...record, _sourceId: sourceId };
}

function compareTaggedRecords(a: TaggedRecord, b: TaggedRecord): number {
  const aObs = a.provenance?.observedAt ?? "";
  const bObs = b.provenance?.observedAt ?? "";
  if (aObs < bObs) return -1;
  if (aObs > bObs) return 1;
  // Tie-break deterministically by recordId
  if (a.recordId < b.recordId) return -1;
  if (a.recordId > b.recordId) return 1;
  return 0;
}

export class MultiSourceSyncRunner implements SyncRunner {
  private readonly scopeCursor: ScopeCursorStore;

  constructor(private readonly deps: MultiSyncOnceDeps) {
    this.scopeCursor = new ScopeCursorStore({
      inner: deps.cursorStore,
      defaultSourceId: deps.sources[0]?.sourceId ?? "default",
    });
  }

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
          addError("cleanup", cleanupError, { actionTaken: "continued" });
        }
      }

      this.reportProgress("setup", 3, 4, "Reading cursor...");
      let priorCheckpoints: Record<string, string | null>;
      try {
        priorCheckpoints = await this.scopeCursor.readAll();
      } catch (cursorError) {
        const error = addError("setup", cursorError, { actionTaken: "reset_cursor" });
        if (error.recoverable) {
          priorCheckpoints = {};
          addRecoveryAction("reset_cursor_to_null_due_to_corruption");
        } else {
          throw cursorError;
        }
      }
      this.reportProgress("setup", 4, 4, "Ready");

      // Fetch from all sources concurrently
      this.reportProgress("fetch", 0, this.deps.sources.length, "Fetching from sources...");
      const fetchResults: FetchedBatch[] = [];
      for (let i = 0; i < this.deps.sources.length; i++) {
        const source = this.deps.sources[i]!;
        const checkpoint = priorCheckpoints[source.sourceId] ?? null;
        try {
          const batch = await source.pull(checkpoint);
          fetchResults.push({ sourceId: source.sourceId, batch });
        } catch (fetchError) {
          addError("fetch", fetchError, { actionTaken: "abort" });
          throw fetchError;
        }
        this.reportProgress("fetch", i + 1, this.deps.sources.length, `Fetched from ${source.sourceId}`);
      }

      // Merge all records deterministically
      const allTagged: TaggedRecord[] = [];
      for (const result of fetchResults) {
        for (const record of result.batch.records) {
          allTagged.push(tagRecord(record, result.sourceId));
        }
      }
      allTagged.sort(compareTaggedRecords);

      const totalEvents = allTagged.length;
      let appliedCount = 0;
      let skippedCount = 0;
      const dirtyAggregate = {
        by_thread: new Set<string>(),
        by_folder: new Set<string>(),
        unread_changed: false,
        flagged_changed: false,
      };

      this.reportProgress("process", 0, totalEvents, "Processing events...");

      for (let i = 0; i < allTagged.length; i++) {
        const record = allTagged[i]!;
        const recordId = record.recordId;

        if (i % 10 === 0 || i === allTagged.length - 1) {
          this.reportProgress("process", i, totalEvents, `Processing record ${i + 1} of ${totalEvents}...`);
        }

        let alreadyApplied = false;
        try {
          alreadyApplied = await this.deps.applyLogStore.hasApplied(recordId);
        } catch (applyLogError) {
          addError("apply", applyLogError, { eventId: recordId, actionTaken: "checked_failed" });
          alreadyApplied = false;
        }

        if (alreadyApplied) {
          skippedCount += 1;
          continue;
        }

        if (this.deps.factStore) {
          try {
            const sourceBatch = fetchResults.find((r) => r.sourceId === record._sourceId)?.batch;
            const fact = sourceRecordToFact(record, sourceBatch?.nextCheckpoint ?? null);
            this.deps.factStore.ingest(fact);
          } catch (factError) {
            addError("persist", factError, { actionTaken: "logged_only" });
          }
        }

        let result: { applied: boolean; dirty_views: { by_thread: string[]; by_folder: string[]; unread_changed: boolean; flagged_changed: boolean } };
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
            addError("persist", markError, { eventId: recordId, actionTaken: "logged_only" });
          }

          appliedCount += 1;

          for (const threadId of result.dirty_views.by_thread) {
            dirtyAggregate.by_thread.add(threadId);
          }
          for (const folderId of result.dirty_views.by_folder) {
            dirtyAggregate.by_folder.add(folderId);
          }
          dirtyAggregate.unread_changed ||= result.dirty_views.unread_changed;
          dirtyAggregate.flagged_changed ||= result.dirty_views.flagged_changed;
        }
      }

      this.reportProgress("process", totalEvents, totalEvents, "Processing complete");

      // Compute next composite checkpoint
      const nextCheckpoints: Record<string, string | null> = {};
      for (const result of fetchResults) {
        nextCheckpoints[result.sourceId] = result.batch.nextCheckpoint ?? null;
      }

      const hasAnyCheckpoint = Object.values(nextCheckpoints).some((c) => c !== null);
      if (hasAnyCheckpoint) {
        this.reportProgress("commit", 0, 1, "Committing checkpoint...");
        try {
          await this.scopeCursor.commitAll(nextCheckpoints);
          this.reportProgress("commit", 1, 1, "Checkpoint committed");
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
        }
      }

      const priorCursorString = Object.keys(priorCheckpoints).length === 0
        ? undefined
        : Object.keys(priorCheckpoints).length === 1
          ? (Object.values(priorCheckpoints)[0] ?? undefined)
          : JSON.stringify(priorCheckpoints);
      const nextCursorString = Object.keys(nextCheckpoints).length === 0
        ? undefined
        : Object.keys(nextCheckpoints).length === 1
          ? (Object.values(nextCheckpoints)[0] ?? undefined)
          : JSON.stringify(nextCheckpoints);

      return {
        prior_cursor: priorCursorString,
        next_cursor: nextCursorString,
        event_count: totalEvents,
        applied_count: appliedCount,
        skipped_count: skippedCount,
        duration_ms: nowMs() - startedAt,
        status: "success",
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
