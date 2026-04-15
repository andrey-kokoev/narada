import { describe, it, expect } from "vitest";
import { ExchangeSource } from "../../../../src/adapter/graph/exchange-source.js";
import type { GraphAdapter } from "../../../../src/types/runtime.js";
import type { NormalizedBatch } from "../../../../src/types/normalized.js";

function createMockAdapter(batch: NormalizedBatch): GraphAdapter {
  return {
    async fetch_since() {
      return batch;
    },
  };
}

function makeBatch(events: NormalizedBatch["events"], nextCursor?: string): NormalizedBatch {
  return {
    schema_version: 1,
    mailbox_id: "test@example.com",
    adapter_scope: {
      mailbox_id: "test@example.com",
      included_container_refs: ["inbox"],
      included_item_kinds: ["message"],
    },
    fetched_at: new Date().toISOString(),
    events,
    prior_cursor: null,
    next_cursor: nextCursor,
    has_more: false,
  };
}

function makeEvent(eventId: string, messageId: string): NormalizedBatch["events"][number] {
  return {
    event_id: eventId,
    event_kind: "created",
    message_id: messageId,
    mailbox_id: "test@example.com",
    conversation_id: "conv-1",
    observed_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
    payload: {
      schema_version: 1,
      mailbox_id: "test@example.com",
      message_id: messageId,
      conversation_id: "conv-1",
      received_at: new Date().toISOString(),
      subject: "Test",
      to: [{ email: "to@example.com" }],
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
      attachments: [],
    },
  };
}

describe("ExchangeSource", () => {
  it("emits records through the Source contract", async () => {
    const batch = makeBatch([makeEvent("evt-1", "msg-1")], "cursor-1");
    const adapter = createMockAdapter(batch);
    const source = new ExchangeSource({ adapter, sourceId: "test-source" });

    const result = await source.pull(null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.recordId).toBe("evt-1");
    expect(result.records[0]!.provenance.sourceId).toBe("test-source");
  });

  it("advances checkpoint deterministically", async () => {
    const batch = makeBatch([makeEvent("evt-1", "msg-1")], "cursor-1");
    const adapter = createMockAdapter(batch);
    const source = new ExchangeSource({ adapter, sourceId: "test-source" });

    const result = await source.pull("cursor-0");

    expect(result.priorCheckpoint).toBe("cursor-0");
    expect(result.nextCheckpoint).toBe("cursor-1");
  });

  it("is replay-safe when pulling with same checkpoint", async () => {
    let callCount = 0;
    const adapter: GraphAdapter = {
      async fetch_since(cursor) {
        callCount++;
        return makeBatch([makeEvent("evt-1", "msg-1")], cursor ?? "cursor-1");
      },
    };
    const source = new ExchangeSource({ adapter, sourceId: "test-source" });

    const first = await source.pull("cursor-0");
    const second = await source.pull("cursor-0");

    expect(callCount).toBe(2);
    expect(first.records[0]!.recordId).toBe("evt-1");
    expect(second.records[0]!.recordId).toBe("evt-1");
  });

  it("does not include mailbox-specific fields in kernel SourceRecord shape", async () => {
    const batch = makeBatch([makeEvent("evt-1", "msg-1")]);
    const adapter = createMockAdapter(batch);
    const source = new ExchangeSource({ adapter, sourceId: "test-source" });

    const result = await source.pull(null);
    const record = result.records[0]!;

    // Kernel record must not have mailbox-specific fields
    const kernelKeys = new Set(["recordId", "ordinal", "payload", "provenance"]);
    for (const key of Object.keys(record)) {
      expect(kernelKeys.has(key)).toBe(true);
    }

    // Mailbox-specific data must live inside payload
    const payload = record.payload as { mailbox_id: string; message_id: string; conversation_id: string };
    expect(payload.mailbox_id).toBe("test@example.com");
    expect(payload.message_id).toBe("msg-1");
    expect(payload.conversation_id).toBe("conv-1");
  });

  it("maps multiple events to records preserving order", async () => {
    const batch = makeBatch(
      [makeEvent("evt-1", "msg-1"), makeEvent("evt-2", "msg-2"), makeEvent("evt-3", "msg-3")],
      "cursor-next",
    );
    const adapter = createMockAdapter(batch);
    const source = new ExchangeSource({ adapter, sourceId: "test-source" });

    const result = await source.pull(null);

    expect(result.records.map((r) => r.recordId)).toEqual(["evt-1", "evt-2", "evt-3"]);
  });
});
