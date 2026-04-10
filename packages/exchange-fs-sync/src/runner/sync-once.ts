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

  async syncOnce(): Promise<RunResult> {
    const startedAt = nowMs();
    let releaseLock: (() => Promise<void>) | undefined;

    try {
      this.reportProgress('setup', 0, 4, 'Initializing...');
      await ensureRootLayout(this.deps.rootDir);

      if (this.deps.acquireLock) {
        this.reportProgress('setup', 1, 4, 'Acquiring lock...');
        releaseLock = await this.deps.acquireLock();
      }

      if (this.deps.cleanupTmp) {
        this.reportProgress('setup', 2, 4, 'Cleaning up temp files...');
        await this.deps.cleanupTmp();
      }
      
      this.reportProgress('setup', 3, 4, 'Reading cursor...');
      const priorCursor = await this.deps.cursorStore.read();
      this.reportProgress('setup', 4, 4, 'Ready');

      this.reportProgress('fetch', 0, 1, 'Fetching from Graph API...');
      const batch = await this.deps.adapter.fetch_since(priorCursor);
      const totalEvents = batch.events.length;
      this.reportProgress('fetch', 1, 1, `Fetched ${totalEvents} events`);

      let appliedCount = 0;
      let skippedCount = 0;
      const dirtyAggregate = {
        by_thread: new Set<string>(),
        by_folder: new Set<string>(),
        unread_changed: false,
        flagged_changed: false,
      };

      this.reportProgress('process', 0, totalEvents, 'Processing events...');
      
      for (let i = 0; i < batch.events.length; i++) {
        const event = batch.events[i];
        
        if (i % 10 === 0 || i === batch.events.length - 1) {
          this.reportProgress('process', i, totalEvents, `Processing event ${i + 1} of ${totalEvents}...`);
        }

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
      
      this.reportProgress('process', totalEvents, totalEvents, 'Processing complete');

      if (batch.next_cursor) {
        this.reportProgress('commit', 0, 1, 'Committing cursor...');
        await this.deps.cursorStore.commit(batch.next_cursor);
        this.reportProgress('commit', 1, 1, 'Cursor committed');
      }

      if (this.deps.rebuildViewsAfterSync && this.deps.rebuildViews) {
        this.reportProgress('cleanup', 0, 1, 'Rebuilding views...');
        await this.deps.rebuildViews();
        this.reportProgress('cleanup', 1, 1, 'Views rebuilt');
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
