import { describe, expect, it } from "vitest";
import { normalizeBatch } from "../../../src/normalize/batch.js";

describe("normalizeBatch", () => {
  it("dedupes equivalent events by event_id", () => {
    const batch = normalizeBatch({
      mailbox_id: "mailbox_primary",
      adapter_scope: {
        mailbox_id: "mailbox_primary",
        included_container_refs: ["inbox"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      prior_cursor: null,
      next_cursor: "cursor-1",
      fetched_at: "2026-04-09T16:00:00Z",
      messages: [
        {
          id: "msg-1",
          changeKey: "ck-1",
          subject: "hello",
          body: {
            contentType: "text",
            content: "hello",
          },
        },
        {
          id: "msg-1",
          changeKey: "ck-1",
          subject: "hello",
          body: {
            contentType: "text",
            content: "hello",
          },
        },
      ],
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: () => ["inbox"],
      normalize_flagged: () => false,
    });

    expect(batch.events).toHaveLength(1);
    expect(batch.next_cursor).toBe("cursor-1");
  });
});