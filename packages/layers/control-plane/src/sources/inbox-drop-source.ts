/**
 * InboxDropSource
 *
 * A bounded Site-local source that observes direct children of an inbox-drop
 * directory. It emits inert filesystem observations only; Canonical Inbox
 * admission remains a separate governed crossing.
 */

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Source, SourceBatch, SourceRecord } from "../types/source.js";

export interface InboxDropSourceOptions {
  /** Source instance identifier */
  sourceId: string;
  /** Site root used to resolve relative drop directories */
  rootDir: string;
  /** Inbox-drop directory, relative to rootDir or absolute */
  dropDir?: string;
  /** Watch identifier included in emitted filesystem observations */
  watchId?: string;
}

export class InboxDropSource implements Source {
  readonly sourceId: string;
  private readonly dropDir: string;
  private readonly watchId: string;

  constructor(private readonly opts: InboxDropSourceOptions) {
    this.sourceId = opts.sourceId;
    this.dropDir = resolve(opts.rootDir, opts.dropDir ?? join(".ai", "inbox-drop"));
    this.watchId = opts.watchId ?? "inbox_drop";
  }

  async pull(checkpoint?: string | null): Promise<SourceBatch> {
    const fetchedAt = new Date().toISOString();
    let entries: string[];
    try {
      entries = await readdir(this.dropDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          records: [],
          priorCheckpoint: checkpoint ?? null,
          hasMore: false,
          fetchedAt,
        };
      }
      throw error;
    }

    const records: SourceRecord[] = [];
    for (const entry of entries.sort()) {
      const absPath = join(this.dropDir, entry);
      const entryStat = await stat(absPath);
      const path = relative(this.opts.rootDir, absPath);
      const changedAt = entryStat.mtime.toISOString();
      const digest = createHash("sha256")
        .update(`${path}\0${entryStat.size}\0${entryStat.mtimeMs}`)
        .digest("hex")
        .slice(0, 16);
      records.push({
        recordId: `inbox-drop:${this.watchId}:${digest}`,
        ordinal: changedAt,
        payload: {
          kind: "filesystem.change",
          watch_id: this.watchId,
          path,
          change_type: "modified",
          size: entryStat.isFile() ? entryStat.size : undefined,
        },
        provenance: {
          sourceId: this.sourceId,
          observedAt: changedAt,
        },
      });
    }

    return {
      records,
      priorCheckpoint: checkpoint ?? null,
      nextCheckpoint: fetchedAt,
      hasMore: false,
      fetchedAt,
    };
  }
}
