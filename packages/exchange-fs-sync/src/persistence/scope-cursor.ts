/**
 * ScopeCursorStore
 *
 * Multi-source checkpoint persistence for a single scope.
 *
 * A scope may have multiple Source instances (e.g. graph + timer + webhook).
 * Each source maintains its own opaque checkpoint. This store persists a
 * composite cursor that maps source_id -> checkpoint.
 *
 * Backward compatibility:
 * - If the underlying store contains a plain string, it is treated as the
 *   checkpoint for a single default source.
 */

import type { CursorStore } from "../types/runtime.js";

export interface ScopeCursorStoreOptions {
  /** Underlying store that persists the serialized composite cursor */
  inner: CursorStore;
  /** Source identifier used when reading a legacy plain-string cursor */
  defaultSourceId: string;
}

function isPlainStringCursor(value: string): boolean {
  return !value.trimStart().startsWith("{");
}

export class ScopeCursorStore {
  constructor(private readonly opts: ScopeCursorStoreOptions) {}

  /**
   * Read the composite cursor as a map of source_id -> checkpoint.
   *
   * Returns an empty object if no cursor has been committed yet.
   */
  async readAll(): Promise<Record<string, string | null>> {
    const raw = await this.opts.inner.read();
    if (raw === null) {
      return {};
    }

    if (isPlainStringCursor(raw)) {
      return { [this.opts.defaultSourceId]: raw };
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = typeof value === "string" ? value : null;
      }
      return result;
    } catch {
      // Corrupted JSON object — safest recovery is to reset all sources
      return {};
    }
  }

  /**
   * Commit a composite cursor mapping source_id -> checkpoint.
   *
   * Sources with a null checkpoint are omitted from the persisted payload
   * but are preserved if they already existed in the underlying store.
   */
  async commitAll(checkpoints: Record<string, string | null>): Promise<void> {
    const existing = await this.readAll();
    const merged: Record<string, string | null> = { ...existing };

    for (const [sourceId, checkpoint] of Object.entries(checkpoints)) {
      if (checkpoint !== null && checkpoint.trim().length > 0) {
        merged[sourceId] = checkpoint;
      } else if (checkpoint === null && sourceId in merged) {
        delete merged[sourceId];
      }
    }

    // If there's only one source left, persist as plain string for backward compat
    const entries = Object.entries(merged).filter(([, v]) => v !== null) as [string, string][];
    if (entries.length === 1 && entries[0]![0] === this.opts.defaultSourceId) {
      await this.opts.inner.commit(entries[0]![1]);
      return;
    }

    const payload = entries.reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});

    await this.opts.inner.commit(JSON.stringify(payload));
  }

  /**
   * Reset all checkpoints for this scope.
   */
  async reset(): Promise<void> {
    await this.opts.inner.commit("{}");
  }
}
