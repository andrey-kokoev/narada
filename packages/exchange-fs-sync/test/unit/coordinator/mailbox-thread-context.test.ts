import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { ThreadContextHydrator } from "../../../src/coordinator/mailbox-thread-context.js";

describe("ThreadContextHydrator", () => {
  let tmpDir: string;
  let hydrator: ThreadContextHydrator;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "exchange-fs-sync-test-"));
    hydrator = new ThreadContextHydrator({ rootDir: tmpDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty context when thread view does not exist", async () => {
    const ctx = await hydrator.hydrate("nonexistent", "mailbox-1", 0);
    expect(ctx.conversation_id).toBe("nonexistent");
    expect(ctx.mailbox_id).toBe("mailbox-1");
    expect(ctx.revision_id).toBe("nonexistent:rev:0");
    expect(ctx.messages).toHaveLength(0);
  });

  it("hydrates messages from filesystem views sorted by received_at", async () => {
    const conversationId = "conv-123";
    const messageId1 = "msg-a";
    const messageId2 = "msg-b";

    const messagesDir = join(tmpDir, "messages");
    const viewsDir = join(tmpDir, "views", "by-thread", encodeURIComponent(conversationId), "members");
    mkdirSync(viewsDir, { recursive: true });

    // Write two message records
    const record1 = {
      mailbox_id: "mailbox-1",
      message_id: messageId1,
      conversation_id: conversationId,
      received_at: "2024-01-02T00:00:00Z",
      source_version: "1",
      to: [],
      cc: [],
      bcc: [],
      folder_refs: [],
      category_refs: [],
      flags: { is_read: true, is_draft: false, is_flagged: false, has_attachments: false },
      attachments: [],
    };
    const record2 = {
      mailbox_id: "mailbox-1",
      message_id: messageId2,
      conversation_id: conversationId,
      received_at: "2024-01-01T00:00:00Z",
      source_version: "1",
      to: [],
      cc: [],
      bcc: [],
      folder_refs: [],
      category_refs: [],
      flags: { is_read: false, is_draft: false, is_flagged: false, has_attachments: false },
      attachments: [],
    };

    mkdirSync(join(messagesDir, encodeURIComponent(messageId1)), { recursive: true });
    mkdirSync(join(messagesDir, encodeURIComponent(messageId2)), { recursive: true });
    writeFileSync(join(messagesDir, encodeURIComponent(messageId1), "record.json"), JSON.stringify(record1));
    writeFileSync(join(messagesDir, encodeURIComponent(messageId2), "record.json"), JSON.stringify(record2));

    // Create relative symlinks as the compiler does
    const rel1 = join("..", "..", "..", "messages", encodeURIComponent(messageId1));
    const rel2 = join("..", "..", "..", "messages", encodeURIComponent(messageId2));
    symlinkSync(rel1, join(viewsDir, encodeURIComponent(messageId1)), "dir");
    symlinkSync(rel2, join(viewsDir, encodeURIComponent(messageId2)), "dir");

    const ctx = await hydrator.hydrate(conversationId, "mailbox-1", 3);

    expect(ctx.messages).toHaveLength(2);
    expect(ctx.revision_id).toBe("conv-123:rev:3");
    // Should be sorted by received_at ascending (older first)
    expect(ctx.messages[0]!.message_id).toBe(messageId2);
    expect(ctx.messages[1]!.message_id).toBe(messageId1);
  });

  it("skips malformed or missing records gracefully", async () => {
    const conversationId = "conv-456";
    const messageId = "msg-good";

    const messagesDir = join(tmpDir, "messages");
    const viewsDir = join(tmpDir, "views", "by-thread", encodeURIComponent(conversationId), "members");
    mkdirSync(viewsDir, { recursive: true });

    const record = {
      mailbox_id: "mailbox-1",
      message_id: messageId,
      conversation_id: conversationId,
      received_at: "2024-01-01T00:00:00Z",
      source_version: "1",
      to: [],
      cc: [],
      bcc: [],
      folder_refs: [],
      category_refs: [],
      flags: { is_read: true, is_draft: false, is_flagged: false, has_attachments: false },
      attachments: [],
    };

    mkdirSync(join(messagesDir, encodeURIComponent(messageId)), { recursive: true });
    writeFileSync(join(messagesDir, encodeURIComponent(messageId), "record.json"), JSON.stringify(record));
    symlinkSync(
      join("..", "..", "..", "messages", encodeURIComponent(messageId)),
      join(viewsDir, encodeURIComponent(messageId)),
      "dir",
    );

    // Also add a symlink to a missing message
    symlinkSync(
      join("..", "..", "..", "messages", "missing-msg"),
      join(viewsDir, "missing-msg"),
      "dir",
    );

    const ctx = await hydrator.hydrate(conversationId, "mailbox-1", 1);
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0]!.message_id).toBe(messageId);
  });
});
