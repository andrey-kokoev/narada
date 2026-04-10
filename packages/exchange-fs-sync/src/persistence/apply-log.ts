import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApplyLogStore } from "../types/runtime.js";
import type { NormalizedEvent } from "../types/normalized.js";

interface ApplyMarkerFileShape {
  event_id: string;
  message_id: string;
  event_kind: "upsert" | "delete";
  applied_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function validateApplyMarkerShape(value: unknown): ApplyMarkerFileShape {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid apply marker: expected object");
  }

  const record = value as Record<string, unknown>;

  if (typeof record.event_id !== "string" || !record.event_id.trim()) {
    throw new Error("Invalid apply marker: event_id must be a non-empty string");
  }

  if (typeof record.message_id !== "string" || !record.message_id.trim()) {
    throw new Error("Invalid apply marker: message_id must be a non-empty string");
  }

  if (record.event_kind !== "upsert" && record.event_kind !== "delete") {
    throw new Error("Invalid apply marker: event_kind must be upsert or delete");
  }

  if (typeof record.applied_at !== "string" || !record.applied_at.trim()) {
    throw new Error("Invalid apply marker: applied_at must be a non-empty string");
  }

  return {
    event_id: record.event_id,
    message_id: record.message_id,
    event_kind: record.event_kind,
    applied_at: record.applied_at,
  };
}

function shardForEventId(eventId: string): string {
  return eventId.slice(0, 2) || "00";
}

export class FileApplyLogStore implements ApplyLogStore {
  private readonly applyLogDir: string;
  private readonly tmpDir: string;

  constructor(params: { rootDir: string }) {
    this.applyLogDir = join(params.rootDir, "state", "apply-log");
    this.tmpDir = join(params.rootDir, "tmp");
  }

  private markerPath(eventId: string): string {
    const shard = shardForEventId(eventId);
    return join(this.applyLogDir, shard, `${eventId}.json`);
  }

  async hasApplied(eventId: string): Promise<boolean> {
    const markerPath = this.markerPath(eventId);

    try {
      await stat(markerPath);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async markApplied(event: NormalizedEvent): Promise<void> {
    const markerPath = this.markerPath(event.event_id);
    const markerDir = join(this.applyLogDir, shardForEventId(event.event_id));
    const tmpPath = join(
      this.tmpDir,
      `apply-marker.${event.event_id}.${process.pid}.${Date.now()}.tmp.json`,
    );

    await mkdir(markerDir, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });

    const payload: ApplyMarkerFileShape = {
      event_id: event.event_id,
      message_id: event.message_id,
      event_kind: event.event_kind,
      applied_at: nowIso(),
    };

    const bytes = `${JSON.stringify(payload, null, 2)}\n`;

    try {
      try {
        const existing = await readFile(markerPath, "utf8");
        validateApplyMarkerShape(JSON.parse(existing) as unknown);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") {
          throw error;
        }
      }

      await writeFile(tmpPath, bytes, "utf8");
      await rename(tmpPath, markerPath);
    } catch (error) {
      await rm(tmpPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
