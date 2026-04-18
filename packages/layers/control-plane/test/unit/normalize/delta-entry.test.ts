import { describe, expect, it } from "vitest";
import { normalizeDeltaEntry } from "../../../src/normalize/delta-entry.js";

describe("normalizeDeltaEntry", () => {
  it("normalizes live message into upsert event", () => {
    const event = normalizeDeltaEntry({
      mailbox_id: "mailbox_primary",
      graph_message: {
        id: "msg-1",
        changeKey: "ck-1",
        subject: "hello",
        body: {
          contentType: "text",
          content: "hello world",
        },
      },
      observed_at: "2026-04-09T16:00:00Z",
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: () => ["inbox"],
      normalize_flagged: () => false,
    });

    expect(event.event_kind).toBe("upsert");
    expect(event.message_id).toBe("msg-1");
    expect(event.source_version).toBe("ck-1");
    expect(event.payload?.subject).toBe("hello");
    expect(event.event_id).toMatch(/^evt_/);
  });

  it("normalizes removed message into delete event", () => {
    const event = normalizeDeltaEntry({
      mailbox_id: "mailbox_primary",
      graph_message: {
        id: "msg-1",
        changeKey: "ck-2",
        "@removed": { reason: "deleted" },
      },
      observed_at: "2026-04-09T16:01:00Z",
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: () => ["inbox"],
      normalize_flagged: () => false,
    });

    expect(event.event_kind).toBe("delete");
    expect(event.message_id).toBe("msg-1");
    expect(event.payload).toBeUndefined();
    expect(event.event_id).toMatch(/^evt_/);
  });
});