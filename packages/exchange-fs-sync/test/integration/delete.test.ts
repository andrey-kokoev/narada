import { describe, expect, it } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultSyncRunner } from '../../src/runner/sync-once.js';
import { ExchangeSource } from '../../src/adapter/graph/exchange-source.js';
import { FileCursorStore } from "../../src/persistence/cursor.js";
import { FileApplyLogStore } from "../../src/persistence/apply-log.js";
import { FileMessageStore } from "../../src/persistence/messages.js";
import { FileViewStore } from "../../src/persistence/views.js";
import { applyEvent } from "../../src/projector/apply-event.js";
import type { GraphAdapter, NormalizedBatch } from "../../src/types/index.js";
import { SCHEMA_VERSION } from "../../src/types/index.js";

describe("delete", () => {
  it("removes message state for delete events", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "exchange-fs-sync-delete-"));
    const adapter: GraphAdapter = {
      fetch_since: async () =>
        ({
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
              event_id: "evt_upsert_1",
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
                subject: "to-delete",
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
                body: { body_kind: "text", text: "hello" },
                attachments: [],
              },
            },
            {
              schema_version: SCHEMA_VERSION,
              event_id: "evt_delete_1",
              mailbox_id: "mailbox_primary",
              message_id: "msg-1",
              source_item_id: "src-msg-1",
              source_version: "v2",
              event_kind: "delete",
              observed_at: "2026-04-09T16:01:00Z",
            },
          ],
        } satisfies NormalizedBatch),
    };

    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });
    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore: new FileCursorStore({ rootDir, mailboxId: "mailbox_primary" }),
      applyLogStore: new FileApplyLogStore({ rootDir }),
      projector: {
        applyRecord: (record) => {
          const event = record.payload;
          return applyEvent(
            {
              blobs: { installFromPayload: async () => undefined },
              messages: messageStore,
              tombstones: {
                writeFromDeleteEvent: async () => undefined,
                remove: async () => undefined,
              },
              views,
              tombstones_enabled: false,
            },
            event,
          );
        },      },
    });

    const result = await runner.syncOnce();
    expect(result.status).toBe("success");
    await expect(readdir(join(rootDir, "messages"))).resolves.toHaveLength(0);
  });
});
