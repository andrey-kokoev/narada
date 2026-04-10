import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DefaultSyncRunner } from "../../src/runner/sync-once.js";
import { FileCursorStore } from "../../src/persistence/cursor.js";
import { FileApplyLogStore } from "../../src/persistence/apply-log.js";
import { FileMessageStore } from "../../src/persistence/messages.js";
import { applyEvent } from "../../src/projector/apply-event.js";
import type { GraphAdapter, NormalizedBatch } from "../../src/types/index.js";
import { SCHEMA_VERSION } from "../../src/types/index.js";
import { FileViewStore } from "../../src/persistence/views.js";

function batch(): NormalizedBatch {
  return {
    schema_version: SCHEMA_VERSION,
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
    events: [
      {
        schema_version: SCHEMA_VERSION,
        event_id: "evt_bootstrap_1",
        mailbox_id: "mailbox_primary",
        message_id: "msg-1",
        source_item_id: "src-msg-1",
        source_version: "v1",
        event_kind: "upsert",
        observed_at: "2026-04-09T16:00:00Z",
        payload: {
          schema_version: SCHEMA_VERSION,
          mailbox_id: "mailbox_primary",
          message_id: "msg-1",
          conversation_id: "conv-1",
          subject: "hello",
          reply_to: [],
          to: [],
          cc: [],
          bcc: [],
          folder_refs: ["inbox"],
          category_refs: [],
          flags: {
            is_read: false,
            is_draft: false,
            is_flagged: false,
            has_attachments: false,
          },
          body: {
            body_kind: "text",
            text: "hello world",
          },
          attachments: [],
        },
      },
    ],
  };
}

describe("bootstrap", () => {
  it("materializes canonical message state and commits cursor", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "exchange-fs-sync-bootstrap-"));

    const adapter: GraphAdapter = {
      fetch_since: async () => batch(),
    };

    const cursorStore = new FileCursorStore({
      rootDir,
      mailboxId: "mailbox_primary",
    });

    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      adapter,
      cursorStore,
      applyLogStore,
      projector: {
        applyEvent: (event) =>
          applyEvent(
            {
              blobs: {
                installFromPayload: async () => undefined,
              },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          ),
      },
    });

    const result = await runner.syncOnce();

    expect(result.status).toBe("success");
    expect(result.event_count).toBe(1);
    expect(result.applied_count).toBe(1);
    expect(result.skipped_count).toBe(0);

    const cursor = await cursorStore.read();
    expect(cursor).toBe("cursor-1");

    const recordRaw = await readFile(
      join(rootDir, "messages", encodeURIComponent("msg-1"), "record.json"),
      "utf8",
    );
    const record = JSON.parse(recordRaw) as { subject: string; message_id: string };

    expect(record.message_id).toBe("msg-1");
    expect(record.subject).toBe("hello");

    await expect(applyLogStore.hasApplied("evt_bootstrap_1")).resolves.toBe(true);
  });
});