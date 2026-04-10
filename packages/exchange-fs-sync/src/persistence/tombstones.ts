import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedEvent } from "../types/normalized.js";
import type { TombstoneStore } from "../projector/apply-event.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

export interface FileTombstoneStoreOptions {
  rootDir: string;
}

export class FileTombstoneStore implements TombstoneStore {
  private readonly tombstonesDir: string;
  private readonly tmpDir: string;

  constructor(opts: FileTombstoneStoreOptions) {
    this.tombstonesDir = join(opts.rootDir, "tombstones");
    this.tmpDir = join(opts.rootDir, "tmp");
  }

  private tombstonePath(messageId: string): string {
    return join(this.tombstonesDir, `${safeSegment(messageId)}.json`);
  }

  async writeFromDeleteEvent(event: NormalizedEvent): Promise<void> {
    const destination = this.tombstonePath(event.message_id);
    const tmpPath = join(
      this.tmpDir,
      `tombstone.${safeSegment(event.message_id)}.${process.pid}.${Date.now()}.tmp.json`,
    );

    await mkdir(this.tombstonesDir, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });

    const payload = {
      message_id: event.message_id,
      mailbox_id: event.mailbox_id,
      deleted_by_event_id: event.event_id,
      ...(event.source_version ? { source_version: event.source_version } : {}),
      observed_at: event.observed_at,
    };

    try {
      await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      await rename(tmpPath, destination);
    } catch (error) {
      await rm(tmpPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async remove(messageId: string): Promise<void> {
    await rm(this.tombstonePath(messageId), { force: true }).catch(() => undefined);
  }

  async read(messageId: string): Promise<unknown | null> {
    try {
      const raw = await readFile(this.tombstonePath(messageId), "utf8");
      return JSON.parse(raw) as unknown;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
}
