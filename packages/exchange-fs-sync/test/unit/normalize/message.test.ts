import { describe, expect, it } from "vitest";
import { normalizeMessage } from "../../../src/normalize/message.js";

describe("normalizeMessage", () => {
  it("maps basic fields correctly", () => {
    const result = normalizeMessage({
      mailbox_id: "mailbox_primary",
      graph_message: {
        id: "msg-1",
        conversationId: "conv-1",
        subject: "hello",
        parentFolderId: "folder-1",
        isRead: false,
        isDraft: false,
        hasAttachments: false,
        body: {
          contentType: "text",
          content: "hello world",
        },
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: (m) => [m.parentFolderId ?? "inbox"],
      normalize_flagged: () => false,
    });

    expect(result.message_id).toBe("msg-1");
    expect(result.conversation_id).toBe("conv-1");
    expect(result.subject).toBe("hello");
    expect(result.folder_refs).toEqual(["folder-1"]);
    expect(result.flags.is_read).toBe(false);
    expect(result.body.body_kind).toBe("text");
  });

  it("handles missing optional fields", () => {
    const result = normalizeMessage({
      mailbox_id: "mailbox_primary",
      graph_message: {
        id: "msg-2",
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: () => [],
      normalize_flagged: () => false,
    });

    expect(result.message_id).toBe("msg-2");
    expect(result.subject).toBe("");
    expect(result.folder_refs).toEqual([]);
    expect(result.flags.is_read).toBe(false);
    expect(result.body.body_kind).toBe("empty");
  });
});