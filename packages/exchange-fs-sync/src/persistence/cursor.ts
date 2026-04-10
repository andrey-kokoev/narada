import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CursorStore } from "../types/runtime.js";
import type { CursorToken } from "../types/normalized.js";

interface CursorFileShape {
  mailbox_id: string;
  committed_cursor: string;
  committed_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

function validateCursorFileShape(value: unknown): CursorFileShape {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid cursor file: expected object");
  }

  const record = value as Record<string, unknown>;

  if (typeof record.mailbox_id !== "string" || !record.mailbox_id.trim()) {
    throw new Error("Invalid cursor file: mailbox_id must be a non-empty string");
  }

  if (
    typeof record.committed_cursor !== "string" ||
    !record.committed_cursor.trim()
  ) {
    throw new Error(
      "Invalid cursor file: committed_cursor must be a non-empty string",
    );
  }

  if (typeof record.committed_at !== "string" || !record.committed_at.trim()) {
    throw new Error("Invalid cursor file: committed_at must be a non-empty string");
  }

  return {
    mailbox_id: record.mailbox_id,
    committed_cursor: record.committed_cursor,
    committed_at: record.committed_at,
  };
}

export class FileCursorStore implements CursorStore {
  private readonly cursorPath: string;
  private readonly tmpDir: string;
  private readonly mailboxId: string;

  constructor(params: {
    rootDir: string;
    mailboxId: string;
  }) {
    this.cursorPath = join(params.rootDir, "state", "cursor.json");
    this.tmpDir = join(params.rootDir, "tmp");
    this.mailboxId = params.mailboxId;
  }

  async read(): Promise<CursorToken | null> {
    try {
      const raw = await readFile(this.cursorPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const cursorState = validateCursorFileShape(parsed);

      if (cursorState.mailbox_id !== this.mailboxId) {
        throw new Error(
          `Cursor mailbox mismatch: expected ${this.mailboxId}, got ${cursorState.mailbox_id}`,
        );
      }

      return cursorState.committed_cursor;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async commit(nextCursor: CursorToken): Promise<void> {
    if (!nextCursor.trim()) {
      throw new Error("Cannot commit empty cursor");
    }

    await ensureParentDir(this.cursorPath);
    await mkdir(this.tmpDir, { recursive: true });

    const tmpPath = join(
      this.tmpDir,
      `cursor.${process.pid}.${Date.now()}.tmp.json`,
    );

    const payload: CursorFileShape = {
      mailbox_id: this.mailboxId,
      committed_cursor: nextCursor,
      committed_at: nowIso(),
    };

    const bytes = `${JSON.stringify(payload, null, 2)}\n`;

    try {
      await writeFile(tmpPath, bytes, "utf8");
      await rename(tmpPath, this.cursorPath);
    } catch (error) {
      await rm(tmpPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
