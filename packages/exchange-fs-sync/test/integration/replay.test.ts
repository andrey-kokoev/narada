import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DefaultSyncRunner } from '../../src/runner/sync-once.js';
import { ExchangeSource } from '../../src/adapter/graph/exchange-source.js';
import { FileCursorStore } from "../../src/persistence/cursor.js";
import { FileApplyLogStore } from "../../src/persistence/apply-log.js";
import { FileMessageStore } from "../../src/persistence/messages.js";
import { applyEvent } from "../../src/projector/apply-event.js";
import type { GraphAdapter, NormalizedBatch } from "../../src/types/index.js";
import { SCHEMA_VERSION } from "../../src/types/index.js";
import { FileViewStore } from "../../src/persistence/views.js";

function batch(nextCursor: string): NormalizedBatch {
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
    next_cursor: nextCursor,
    fetched_at: "2026-04-09T16:00:00Z",
    events: [
      {
        schema_version: SCHEMA_VERSION,
        event_id: "evt_same",
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
          body: { body_kind: "text", text: "hello world" },
          attachments: [],
        },
      },
    ],
  };
}

describe("replay", () => {
  it("skips already-applied events safely", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "exchange-fs-sync-replay-"));
    let callCount = 0;

    const adapter: GraphAdapter = {
      fetch_since: async () => {
        callCount += 1;
        return batch(`cursor-${callCount}`);
      },
    };

    const cursorStore = new FileCursorStore({
      rootDir,
      scopeId: "mailbox_primary",
    });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
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

    const first = await runner.syncOnce();
    const second = await runner.syncOnce();

    expect(first.applied_count).toBe(1);
    expect(first.skipped_count).toBe(0);

    expect(second.applied_count).toBe(0);
    expect(second.skipped_count).toBe(1);

    const cursor = await cursorStore.read();
    expect(cursor).toBe("cursor-2");
  });
});