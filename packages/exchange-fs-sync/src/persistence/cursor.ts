import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CursorStore } from "../types/runtime.js";
import type { CursorToken } from "../types/normalized.js";
import { CorruptionError, StorageError, wrapError, ErrorCode } from "../errors.js";

interface CursorFileShape {
  scope_id: string;
  committed_cursor: string;
  committed_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

let tmpCounter = 0;

async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

function validateCursorFileShape(value: unknown): CursorFileShape {
  if (!value || typeof value !== "object") {
    throw new CorruptionError("Invalid cursor file: expected object", {
      phase: "cursor:validate",
      metadata: { receivedType: typeof value },
    });
  }

  const record = value as Record<string, unknown>;

  if (typeof record.scope_id !== "string" || !record.scope_id.trim()) {
    throw new CorruptionError("Invalid cursor file: scope_id must be a non-empty string", {
      phase: "cursor:validate",
      metadata: { receivedScopeId: record.scope_id },
    });
  }

  if (
    typeof record.committed_cursor !== "string" ||
    !record.committed_cursor.trim()
  ) {
    throw new CorruptionError(
      "Invalid cursor file: committed_cursor must be a non-empty string",
      {
        phase: "cursor:validate",
        metadata: { receivedCursor: record.committed_cursor },
      },
    );
  }

  if (typeof record.committed_at !== "string" || !record.committed_at.trim()) {
    throw new CorruptionError("Invalid cursor file: committed_at must be a non-empty string", {
      phase: "cursor:validate",
      metadata: { receivedCommittedAt: record.committed_at },
    });
  }

  return {
    scope_id: record.scope_id,
    committed_cursor: record.committed_cursor,
    committed_at: record.committed_at,
  };
}

export interface FileCursorStoreOptions {
  rootDir: string;
  scopeId: string;
  /** If true, attempt to recover from corrupted cursor files by resetting to null */
  autoRecoverCorruption?: boolean;
}

export class FileCursorStore implements CursorStore {
  private readonly cursorPath: string;
  private readonly tmpDir: string;
  private readonly scopeId: string;
  private readonly autoRecoverCorruption: boolean;

  constructor(params: FileCursorStoreOptions) {
    this.cursorPath = join(params.rootDir, "state", "cursor.json");
    this.tmpDir = join(params.rootDir, "tmp");
    this.scopeId = params.scopeId;
    this.autoRecoverCorruption = params.autoRecoverCorruption ?? false;
  }

  async read(): Promise<CursorToken | null> {
    try {
      const raw = await readFile(this.cursorPath, "utf8");
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (parseError) {
        // JSON parse error - file is corrupted
        if (this.autoRecoverCorruption) {
          console.warn(`Cursor file corrupted (invalid JSON), resetting to null: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          return null;
        }
        throw new CorruptionError("Cursor file contains invalid JSON", {
          phase: "cursor:read",
          metadata: { cursorPath: this.cursorPath },
          cause: parseError instanceof Error ? parseError : undefined,
        });
      }

      let cursorState: CursorFileShape;
      try {
        cursorState = validateCursorFileShape(parsed);
      } catch (validationError) {
        if (this.autoRecoverCorruption && validationError instanceof CorruptionError) {
          console.warn(`Cursor file corrupted, resetting to null: ${validationError.message}`);
          return null;
        }
        throw validationError;
      }

      if (cursorState.scope_id !== this.scopeId) {
        throw new CorruptionError(
          `Cursor scope mismatch: expected ${this.scopeId}, got ${cursorState.scope_id}`,
          {
            phase: "cursor:read",
            metadata: { expectedScope: this.scopeId, actualScope: cursorState.scope_id },
          },
        );
      }

      return cursorState.committed_cursor;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }

      // Already wrapped errors
      if (error instanceof CorruptionError) {
        throw error;
      }

      throw wrapError(error, {
        phase: "cursor:read",
        operation: "readFile",
      });
    }
  }

  async commit(nextCursor: CursorToken): Promise<void> {
    if (!nextCursor.trim()) {
      throw new StorageError("Cannot commit empty cursor", {
        phase: "cursor:commit",
        recoverable: false,
        metadata: { operation: "commit" },
      });
    }

    await ensureParentDir(this.cursorPath);
    await mkdir(this.tmpDir, { recursive: true });

    const tmpPath = join(
      this.tmpDir,
      `cursor.${process.pid}.${Date.now()}.${tmpCounter++}.tmp.json`,
    );

    const payload: CursorFileShape = {
      scope_id: this.scopeId,
      committed_cursor: nextCursor,
      committed_at: nowIso(),
    };

    const bytes = `${JSON.stringify(payload, null, 2)}\n`;

    try {
      // Atomic write: write to temp file first, then rename
      await writeFile(tmpPath, bytes, "utf8");
      await rename(tmpPath, this.cursorPath);
    } catch (error) {
      // Clean up temp file on error
      await rm(tmpPath, { force: true }).catch(() => undefined);

      // Check for disk full
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOSPC") {
        throw new StorageError("Disk full: unable to commit cursor", {
          code: ErrorCode.STORAGE_DISK_FULL,
          phase: "cursor:commit",
          recoverable: false,
          metadata: { cursorPath: this.cursorPath, tmpPath },
          cause: nodeError,
        });
      }

      throw wrapError(error, {
        phase: "cursor:commit",
        operation: "writeFile/rename",
      });
    }
  }

  /**
   * Reset the cursor to a null state (for recovery scenarios)
   */
  async reset(): Promise<void> {
    try {
      await rm(this.cursorPath, { force: true });
    } catch (error) {
      throw wrapError(error, {
        phase: "cursor:reset",
        operation: "rm",
      });
    }
  }

  /**
   * Get cursor file metadata for diagnostics
   */
  async getMetadata(): Promise<{ exists: boolean; path: string; scopeId: string }> {
    try {
      await readFile(this.cursorPath, "utf8");
      return { exists: true, path: this.cursorPath, scopeId: this.scopeId };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return {
        exists: code !== "ENOENT",
        path: this.cursorPath,
        scopeId: this.scopeId,
      };
    }
  }
}
