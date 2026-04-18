import { mkdtemp, readFile } from "node:fs/promises";
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

function makeBatch(nextCursor: string): NormalizedBatch {
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
        event_id: "evt_crash_1",
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
          subject: "crash-replay",
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
            text: "hello after crash",
          },
          attachments: [],
        },
      },
    ],
  };
}

describe("crash replay", () => {
  it("converges safely when crash happens after canonical apply but before apply marker and cursor commit", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "narada-crash-"));
    let fetchCount = 0;

    const adapter: GraphAdapter = {
      fetch_since: async () => {
        fetchCount += 1;
        return makeBatch(`cursor-${fetchCount}`);
      },
    };

    const cursorStore = new FileCursorStore({
      rootDir,
      scopeId: "mailbox_primary",
    });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    const views = new FileViewStore({ rootDir });

    let shouldCrashAfterApply = true;

    const crashingProjector = {
      applyRecord: async (record: { payload: unknown }) => {
        const event = record.payload as NormalizedBatch["events"][number];
        const result = await applyEvent(
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

        if (shouldCrashAfterApply) {
          shouldCrashAfterApply = false;
          throw new Error("simulated crash after canonical apply");
        }

        return result;
      },
    };

    const firstRunner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: crashingProjector,
    });

    const first = await firstRunner.syncOnce();

    expect(first.status).toBe("retryable_failure");
    expect(first.error).toContain("simulated crash");

    const cursorAfterCrash = await cursorStore.read();
    expect(cursorAfterCrash).toBeNull();

    await expect(applyLogStore.hasApplied("evt_crash_1")).resolves.toBe(false);

    const recordAfterCrashRaw = await readFile(
      join(rootDir, "messages", encodeURIComponent("msg-1"), "record.json"),
      "utf8",
    );
    const recordAfterCrash = JSON.parse(recordAfterCrashRaw) as {
      message_id: string;
      subject: string;
    };

    expect(recordAfterCrash.message_id).toBe("msg-1");
    expect(recordAfterCrash.subject).toBe("crash-replay");

    const normalProjector = {
      applyRecord: (record: { payload: unknown }) => {
        const event = record.payload as NormalizedBatch["events"][number];
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
      },
    };

    const secondRunner = new DefaultSyncRunner({
      rootDir,
      source: new ExchangeSource({ adapter, sourceId: "test" }),
      cursorStore,
      applyLogStore,
      projector: normalProjector,
    });

    const second = await secondRunner.syncOnce();

    expect(second.status).toBe("success");
    expect(second.applied_count).toBe(1);
    expect(second.skipped_count).toBe(0);

    const cursorAfterReplay = await cursorStore.read();
    expect(cursorAfterReplay).toBe("cursor-2");

    await expect(applyLogStore.hasApplied("evt_crash_1")).resolves.toBe(true);

    const recordAfterReplayRaw = await readFile(
      join(rootDir, "messages", encodeURIComponent("msg-1"), "record.json"),
      "utf8",
    );
    const recordAfterReplay = JSON.parse(recordAfterReplayRaw) as {
      message_id: string;
      subject: string;
      body?: { text?: string };
    };

    expect(recordAfterReplay.message_id).toBe("msg-1");
    expect(recordAfterReplay.subject).toBe("crash-replay");
  });
});