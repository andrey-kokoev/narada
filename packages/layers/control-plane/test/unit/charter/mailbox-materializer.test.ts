import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MailboxContextMaterializer } from "../../../src/charter/mailbox/materializer.js";
import { FileMessageStore } from "../../../src/persistence/messages.js";
import { FileViewStore } from "../../../src/persistence/views.js";
import type { PolicyContext } from "../../../src/foreman/context.js";

describe("MailboxContextMaterializer", () => {
  const tempRoot = join(process.cwd(), ".tmp-test");

  it("includes knowledge_sources when knowledge/ directory exists", async () => {
    await mkdir(tempRoot, { recursive: true });
    const rootDir = await mkdtemp(join(tempRoot, "narada-mat-"));
    const knowledgeDir = join(rootDir, "knowledge");
    await mkdir(knowledgeDir, { recursive: true });
    await writeFile(join(knowledgeDir, "README.md"), "# Playbook\n\nLogin issues: ask for email.", "utf-8");
    await writeFile(join(knowledgeDir, "notes.md"), "Internal notes", "utf-8");

    const messageStore = new FileMessageStore({ rootDir });
    const materializer = new MailboxContextMaterializer(rootDir, messageStore);

    const context: PolicyContext = {
      context_id: "conv-001",
      scope_id: "scope-001",
      revision_id: "rev-001",
      previous_revision_ordinal: null,
      current_revision_ordinal: 0,
      change_kinds: [],
      facts: [],
      synced_at: new Date().toISOString(),
    };

    const result = (await materializer.materialize(context)) as {
      messages: unknown[];
      knowledge_sources: Array<{ name: string; content: string }>;
    };

    expect(result.knowledge_sources).toHaveLength(2);
    expect(result.knowledge_sources.map((k) => k.name).sort()).toEqual(["README.md", "notes.md"]);
    expect(result.knowledge_sources.find((k) => k.name === "README.md")?.content).toContain(
      "ask for email"
    );
  });

  it("returns empty knowledge_sources when knowledge/ directory is missing", async () => {
    await mkdir(tempRoot, { recursive: true });
    const rootDir = await mkdtemp(join(tempRoot, "narada-mat-"));
    const messageStore = new FileMessageStore({ rootDir });
    const materializer = new MailboxContextMaterializer(rootDir, messageStore);

    const context: PolicyContext = {
      context_id: "conv-002",
      scope_id: "scope-001",
      revision_id: "rev-001",
      previous_revision_ordinal: null,
      current_revision_ordinal: 0,
      change_kinds: [],
      facts: [],
      synced_at: new Date().toISOString(),
    };

    const result = (await materializer.materialize(context)) as {
      messages: unknown[];
      knowledge_sources: Array<{ name: string; content: string }>;
    };

    expect(result.knowledge_sources).toEqual([]);
  });

  it("materializes stitched mail context messages across Graph conversation ids", async () => {
    await mkdir(tempRoot, { recursive: true });
    const rootDir = await mkdtemp(join(tempRoot, "narada-mat-"));
    const messageStore = new FileMessageStore({ rootDir });
    const viewStore = new FileViewStore({ rootDir });
    await messageStore.upsertFromPayload({
      message_id: "msg-a",
      conversation_id: "conv-a",
      from: { email: "willem@client.example" },
      to: [{ email: "staccato@example.com" }],
      cc: [],
      bcc: [],
      subject: "test",
      body: { text: "Original C4X campaign details." },
      attachments: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: {},
      received_at: "2026-05-04T00:00:00Z",
    });
    await viewStore.markFromPayload({
      message_id: "msg-a",
      conversation_id: "conv-a",
      from: { email: "willem@client.example" },
      to: [],
      cc: [],
      bcc: [],
      subject: "test",
      body: { text: "Original C4X campaign details." },
      attachments: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: {},
      received_at: "2026-05-04T00:00:00Z",
    });
    await messageStore.upsertFromPayload({
      message_id: "msg-b",
      conversation_id: "conv-b",
      from: { email: "willem@client.example" },
      to: [{ email: "staccato@example.com" }],
      cc: [],
      bcc: [],
      subject: "Re: test",
      body: { text: "Follow-up timing and template answer." },
      attachments: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: {},
      received_at: "2026-05-05T00:00:00Z",
    });
    await viewStore.markFromPayload({
      message_id: "msg-b",
      conversation_id: "conv-b",
      from: { email: "willem@client.example" },
      to: [],
      cc: [],
      bcc: [],
      subject: "Re: test",
      body: { text: "Follow-up timing and template answer." },
      attachments: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: {},
      received_at: "2026-05-05T00:00:00Z",
    });

    const materializer = new MailboxContextMaterializer(rootDir, messageStore);
    const context: PolicyContext = {
      context_id: "email-marketing:conv-a",
      scope_id: "email-marketing",
      revision_id: "email-marketing:conv-a:rev:2",
      previous_revision_ordinal: 1,
      current_revision_ordinal: 2,
      change_kinds: ["operation_intake", "mail_context_stitched"],
      facts: [],
      synced_at: new Date().toISOString(),
      mail_context_links: [
        {
          source_conversation_id: "conv-b",
          target_context_id: "email-marketing:conv-a",
          score: 0.9,
          reason: "same_sender+same_normalized_subject",
          signal_details: {},
        },
      ],
    };

    const result = (await materializer.materialize(context)) as { messages: Array<{ message_id: string }> };

    expect(result.messages.map((message) => message.message_id)).toEqual(["msg-a", "msg-b"]);
  });

  it("materializes source conversation messages for prefixed operation-intake contexts", async () => {
    await mkdir(tempRoot, { recursive: true });
    const rootDir = await mkdtemp(join(tempRoot, "narada-mat-"));
    const messageStore = new FileMessageStore({ rootDir });
    const viewStore = new FileViewStore({ rootDir });
    await messageStore.upsertFromPayload({
      message_id: "msg-source",
      conversation_id: "conv-source",
      from: { email: "willem@client.example" },
      to: [{ email: "staccato@example.com" }],
      cc: [],
      bcc: [],
      subject: "test",
      body: { text: "Source conversation campaign request." },
      attachments: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: {},
      received_at: "2026-05-04T00:00:00Z",
    });
    await viewStore.markFromPayload({
      message_id: "msg-source",
      conversation_id: "conv-source",
      from: { email: "willem@client.example" },
      to: [],
      cc: [],
      bcc: [],
      subject: "test",
      body: { text: "Source conversation campaign request." },
      attachments: [],
      folder_refs: ["inbox"],
      category_refs: [],
      flags: {},
      received_at: "2026-05-04T00:00:00Z",
    });

    const materializer = new MailboxContextMaterializer(rootDir, messageStore);
    const context: PolicyContext = {
      context_id: "email-marketing:conv-source",
      scope_id: "email-marketing",
      revision_id: "email-marketing:conv-source:rev:1",
      previous_revision_ordinal: null,
      current_revision_ordinal: 1,
      change_kinds: ["operation_intake"],
      facts: [],
      synced_at: new Date().toISOString(),
    };

    const result = (await materializer.materialize(context)) as { messages: Array<{ message_id: string }> };

    expect(result.messages.map((message) => message.message_id)).toEqual(["msg-source"]);
  });
});
