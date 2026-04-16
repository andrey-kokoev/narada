/**
 * FilesystemSource
 *
 * A domain-neutral Source implementation that emits filesystem change facts.
 *
 * Events are buffered in a durable queue; the Source pulls unprocessed events
 * using a monotonic sequence checkpoint. This makes the vertical a real peer
 * of mailbox, timer, and webhook sources.
 */

import type { Source, SourceBatch, SourceRecord } from "../types/source.js";

export interface FilesystemQueueRecord {
  seq: number;
  recordId: string;
  watchId: string;
  path: string;
  changeType: "created" | "modified" | "deleted";
  size?: number;
  changedAt: string;
}

export interface FilesystemEventQueue {
  enqueue(watchId: string, path: string, changeType: "created" | "modified" | "deleted", size?: number): string;
  readSince(checkpoint: string | null): FilesystemQueueRecord[];
}

export interface FilesystemSourceOptions {
  /** Source instance identifier */
  sourceId: string;
  /** Event queue backing the source */
  queue: FilesystemEventQueue;
}

export interface FilesystemChangePayload {
  kind: "filesystem.change";
  watch_id: string;
  path: string;
  change_type: "created" | "modified" | "deleted";
  size?: number;
}

export class FilesystemSource implements Source {
  readonly sourceId: string;

  constructor(private readonly opts: FilesystemSourceOptions) {
    this.sourceId = opts.sourceId;
  }

  async pull(checkpoint?: string | null): Promise<SourceBatch> {
    const fetchedAt = new Date().toISOString();
    const records = this.opts.queue.readSince(checkpoint ?? null);

    if (records.length === 0) {
      return {
        records: [],
        priorCheckpoint: checkpoint ?? null,
        hasMore: false,
        fetchedAt,
      };
    }

    const sourceRecords: SourceRecord[] = records.map((event) => ({
      recordId: event.recordId,
      ordinal: String(event.seq),
      payload: {
        kind: "filesystem.change",
        watch_id: event.watchId,
        path: event.path,
        change_type: event.changeType,
        size: event.size,
      } as FilesystemChangePayload,
      provenance: {
        sourceId: this.opts.sourceId,
        observedAt: event.changedAt,
      },
    }));

    const nextCheckpoint = String(records[records.length - 1]!.seq);

    return {
      records: sourceRecords,
      priorCheckpoint: checkpoint ?? null,
      nextCheckpoint,
      hasMore: false,
      fetchedAt,
    };
  }
}

/**
 * In-memory filesystem event queue for testing.
 */
export class InMemoryFilesystemEventQueue implements FilesystemEventQueue {
  private seq = 0;
  private events: FilesystemQueueRecord[] = [];

  enqueue(watchId: string, path: string, changeType: "created" | "modified" | "deleted", size?: number): string {
    this.seq++;
    const recordId = `fs:${watchId}:${this.seq}`;
    const changedAt = new Date().toISOString();
    const record: FilesystemQueueRecord = {
      seq: this.seq,
      recordId,
      watchId,
      path,
      changeType,
      size,
      changedAt,
    };
    this.events.push(record);
    return recordId;
  }

  readSince(checkpoint: string | null): FilesystemQueueRecord[] {
    const since = parseInt(checkpoint ?? "0", 10);
    return this.events.filter((e) => e.seq > since);
  }
}
