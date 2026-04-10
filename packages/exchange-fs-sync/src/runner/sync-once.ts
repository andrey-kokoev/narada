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

  async syncOnce(): Promise<RunResult> {
    const startedAt = nowMs();
    let releaseLock: (() => Promise<void>) | undefined;

    try {
      await ensureRootLayout(this.deps.rootDir);

      if (this.deps.acquireLock) {
        releaseLock = await this.deps.acquireLock();
      }

      if (this.deps.cleanupTmp) {
        await this.deps.cleanupTmp();
      }

      const priorCursor = await this.deps.cursorStore.read();
      const batch = await this.deps.adapter.fetch_since(priorCursor);

      let appliedCount = 0;
      let skippedCount = 0;
      const dirtyAggregate = {
        by_thread: new Set<string>(),
        by_folder: new Set<string>(),
        unread_changed: false,
        flagged_changed: false,
      };

      for (const event of batch.events) {
        const alreadyApplied = await this.deps.applyLogStore.hasApplied(
          event.event_id,
        );

        if (alreadyApplied) {
          skippedCount += 1;
          continue;
        }

        const result: ApplyEventResult =
          await this.deps.projector.applyEvent(event);

        if (result.applied) {
          await this.deps.applyLogStore.markApplied(event);
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

      if (batch.next_cursor) {
        await this.deps.cursorStore.commit(batch.next_cursor);
      }

      if (this.deps.rebuildViewsAfterSync && this.deps.rebuildViews) {
        await this.deps.rebuildViews();
      }

      return {
        prior_cursor: priorCursor,
        next_cursor: batch.next_cursor,
        event_count: batch.events.length,
        applied_count: appliedCount,
        skipped_count: skippedCount,
        duration_ms: nowMs() - startedAt,
        status: "success",
      };
    } catch (error) {
      return {
        event_count: 0,
        applied_count: 0,
        skipped_count: 0,
        duration_ms: nowMs() - startedAt,
        status: "retryable_failure",
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (releaseLock) {
        await releaseLock().catch(() => undefined);
      }
    }
  }
}