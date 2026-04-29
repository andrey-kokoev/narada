import { describe, expect, it } from "vitest";
import { applySourceRecord, type ApplyEventDeps } from "../../../src/projector/apply-event.js";
import type { SourceRecord } from "../../../src/types/source.js";

const deps: ApplyEventDeps = {
  blobs: { installFromPayload: async () => undefined },
  messages: {
    upsertFromPayload: async () => undefined,
    remove: async () => undefined,
  },
  tombstones: {
    writeFromDeleteEvent: async () => undefined,
    remove: async () => undefined,
  },
  views: {
    markFromPayload: async () => ({
      by_thread: ["thread-1"],
      by_folder: ["folder-1"],
      unread_changed: true,
      flagged_changed: false,
    }),
    markDelete: async () => ({
      by_thread: [],
      by_folder: [],
      unread_changed: false,
      flagged_changed: false,
    }),
  },
  tombstones_enabled: true,
};

function record(payload: unknown): SourceRecord {
  return {
    recordId: "source-record-1",
    payload,
    provenance: {
      sourceId: "timer:test",
      observedAt: "2024-01-15T12:05:30.000Z",
    },
  };
}

describe("applySourceRecord", () => {
  it("treats timer ticks as fact-only records instead of mailbox events", async () => {
    const result = await applySourceRecord(
      deps,
      record({
        kind: "timer.tick",
        slot_id: "maintenance:2024-01-15T12:05:00.000Z",
        schedule_id: "maintenance",
        slot_start: "2024-01-15T12:05:00.000Z",
        slot_end: "2024-01-15T12:06:00.000Z",
      }),
    );

    expect(result).toEqual({
      event_id: "source-record-1",
      message_id: "source-record-1",
      applied: true,
      dirty_views: {
        by_thread: [],
        by_folder: [],
        unread_changed: false,
        flagged_changed: false,
      },
    });
  });

  it("preserves mailbox projection for normalized events", async () => {
    const result = await applySourceRecord(
      deps,
      record({
        event_id: "evt-1",
        event_kind: "created",
        message_id: "msg-1",
        payload: {
          id: "msg-1",
        },
      }),
    );

    expect(result.event_id).toBe("evt-1");
    expect(result.message_id).toBe("msg-1");
    expect(result.dirty_views.by_thread).toEqual(["thread-1"]);
  });

  it("keeps rejecting unknown payloads with the existing mailbox error", async () => {
    await expect(applySourceRecord(deps, record({ kind: "unknown.local" }))).rejects.toThrow(
      "Unknown event kind: undefined",
    );
  });
});
