import { describe, it, expect } from "vitest";
import { normalizeMessageForEnvelope } from "../../../src/charter/envelope.js";
import type { NormalizedMessage } from "../../../src/types/normalized.js";

describe("normalizeMessageForEnvelope", () => {
  it("maps a minimal real normalized message into charter runtime shape without loss", () => {
    const input: NormalizedMessage = {
      mailbox_id: "m",
      message_id: "msg-1",
      source_version: "v1",
      conversation_id: "conv-1",
      received_at: "2026-04-15T10:00:00Z",
      subject: "Hello",
      body: { body_kind: "text", text: "This is the body content." },
      from: [{ email: "alice@example.com", display_name: "Alice" }],
      to: [{ email: "bob@example.com" }],
      cc: [],
      bcc: [],
      folder_refs: ["inbox"],
      category_refs: ["category-a"],
      flags: { is_read: false, is_draft: false, is_flagged: false, has_attachments: false },
      attachments: [],
    };

    const out = normalizeMessageForEnvelope(input);

    expect(out.message_id).toBe("msg-1");
    expect(out.conversation_id).toBe("conv-1");
    expect(out.internet_message_id).toBeNull();
    expect(out.subject).toBe("Hello");
    expect(out.body_preview).toBe("This is the body content.");
    expect(out.from).toEqual([{ email: "alice@example.com", name: "Alice" }]);
    expect(out.to).toEqual([{ email: "bob@example.com", name: null }]);
    expect(out.cc).toEqual([]);
    expect(out.bcc).toEqual([]);
    expect(out.sent_at).toBeNull();
    expect(out.is_draft).toBe(false);
    expect(out.is_read).toBe(false);
    expect(out.categories).toEqual(["category-a"]);
    expect(out.parent_folder_id).toBeNull();
    expect(out.importance).toBeNull();
  });

  it("preserves explicit fields when present", () => {
    const input: NormalizedMessage = {
      mailbox_id: "m",
      message_id: "msg-2",
      source_version: "v2",
      conversation_id: "conv-2",
      received_at: "2026-04-15T11:00:00Z",
      subject: "Re: World",
      body: { body_kind: "html", html: "<p>Hi</p>" },
      from: [{ email: "sender@example.com", display_name: "Sender" }],
      to: [{ email: "to@example.com", display_name: "To" }],
      cc: [{ email: "cc@example.com" }],
      bcc: [{ email: "bcc@example.com", display_name: "Bcc" }],
      folder_refs: ["sentitems"],
      category_refs: [],
      flags: { is_read: true, is_draft: false, is_flagged: true, has_attachments: true },
      attachments: [],
      internet_message_id: "imid-123",
    } as NormalizedMessage & { internet_message_id: string };

    const out = normalizeMessageForEnvelope(input as NormalizedMessage);

    expect(out.internet_message_id).toBe("imid-123");
    expect(out.body_preview).toBeNull(); // html body has no text slice fallback
    expect(out.from).toEqual([{ email: "sender@example.com", name: "Sender" }]);
    expect(out.to).toEqual([{ email: "to@example.com", name: "To" }]);
    expect(out.cc).toEqual([{ email: "cc@example.com", name: null }]);
    expect(out.bcc).toEqual([{ email: "bcc@example.com", name: "Bcc" }]);
    expect(out.is_read).toBe(true);
    expect(out.categories).toEqual([]);
  });

  it("derives body_preview from text body when not explicitly set", () => {
    const input: NormalizedMessage = {
      mailbox_id: "m",
      message_id: "msg-3",
      source_version: "v3",
      conversation_id: "conv-3",
      received_at: "2026-04-15T12:00:00Z",
      subject: "Short",
      body: { body_kind: "text", text: "A".repeat(500) },
      to: [],
      cc: [],
      bcc: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: { is_read: false, is_draft: false, is_flagged: false, has_attachments: false },
      attachments: [],
    };

    const out = normalizeMessageForEnvelope(input);
    expect(out.body_preview).toBe("A".repeat(200));
  });

  it("normalizes a single from address into an array", () => {
    const input: NormalizedMessage = {
      mailbox_id: "m",
      message_id: "msg-4",
      source_version: "v4",
      conversation_id: "conv-4",
      received_at: "2026-04-15T13:00:00Z",
      subject: "Single",
      from: { email: "solo@example.com", display_name: "Solo" },
      to: [],
      cc: [],
      bcc: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: { is_read: false, is_draft: false, is_flagged: false, has_attachments: false },
      attachments: [],
    } as unknown as NormalizedMessage;

    const out = normalizeMessageForEnvelope(input as NormalizedMessage);
    expect(out.from).toEqual([{ email: "solo@example.com", name: "Solo" }]);
  });
});
