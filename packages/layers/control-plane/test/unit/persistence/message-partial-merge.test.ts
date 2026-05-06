import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileMessageStore } from "../../../src/persistence/messages.js";
import type { NormalizedPayload } from "../../../src/types/normalized.js";

function fullPayload(): NormalizedPayload {
  return {
    schema_version: 1,
    mailbox_id: "staccato-narada",
    message_id: "msg-1",
    conversation_id: "conv-rich",
    internet_message_id: "<rich@example.com>",
    subject: "Re: test",
    from: { display_name: "Willem Driessen", email: "willem.driessen@staccato2011.com" },
    sender: { display_name: "Willem Driessen", email: "willem.driessen@staccato2011.com" },
    reply_to: [],
    to: [{ display_name: "Staccato Narada", email: "staccato.narada@global-maxima.com" }],
    cc: [],
    bcc: [],
    folder_refs: ["inbox"],
    category_refs: [],
    flags: {
      is_read: false,
      is_draft: false,
      is_flagged: false,
      has_attachments: true,
    },
    body: {
      body_kind: "text",
      text: "1. I need this campaign to be sent next week with 2 follow up emails",
      preview: "1. I need this campaign to be sent next week",
    },
    attachments: [
      {
        attachment_key: "att-1",
        ordinal: 0,
        display_name: "Staccato_Brand_Architecture.pdf",
        inline: false,
      },
    ],
    source_extensions: {
      namespaces: {
        graph: {
          raw_id: "msg-1",
          change_key: "rich-change",
          parent_folder_id: "inbox-folder",
        },
      },
    },
  };
}

function sparsePayload(): NormalizedPayload {
  return {
    schema_version: 1,
    mailbox_id: "staccato-narada",
    message_id: "msg-1",
    subject: "",
    reply_to: [],
    to: [],
    cc: [],
    bcc: [],
    folder_refs: ["archive"],
    category_refs: ["processed"],
    flags: {
      is_read: true,
      is_draft: false,
      is_flagged: false,
      has_attachments: false,
    },
    body: {
      body_kind: "empty",
    },
    attachments: [],
    source_extensions: {
      namespaces: {
        graph: {
          raw_id: "msg-1",
          parent_folder_id: "archive-folder",
        },
      },
    },
  };
}

async function readRecord(rootDir: string) {
  const raw = await readFile(join(rootDir, "messages", encodeURIComponent("msg-1"), "record.json"), "utf8");
  return JSON.parse(raw) as NormalizedPayload;
}

describe("FileMessageStore partial update merge", () => {
  it("does not let sparse Graph deltas erase rich message content and identity", async () => {
    const rootDir = await mkdtemp(join("/tmp", "narada-message-merge-"));
    try {
      const store = new FileMessageStore({ rootDir });

      await store.upsertFromPayload(fullPayload());
      await store.upsertFromPayload(sparsePayload());

      const record = await readRecord(rootDir);
      expect(record.conversation_id).toBe("conv-rich");
      expect(record.internet_message_id).toBe("<rich@example.com>");
      expect(record.subject).toBe("Re: test");
      expect(record.from?.email).toBe("willem.driessen@staccato2011.com");
      expect(record.to).toEqual([{ display_name: "Staccato Narada", email: "staccato.narada@global-maxima.com" }]);
      expect(record.body?.body_kind).toBe("text");
      expect(record.body?.text).toContain("next week");
      expect(record.attachments?.[0]?.display_name).toBe("Staccato_Brand_Architecture.pdf");

      expect(record.folder_refs).toEqual(["archive"]);
      expect(record.category_refs).toEqual(["processed"]);
      expect(record.flags?.is_read).toBe(true);
      expect(record.flags?.has_attachments).toBe(true);
      expect(record.source_extensions?.namespaces.graph?.parent_folder_id).toBe("archive-folder");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
