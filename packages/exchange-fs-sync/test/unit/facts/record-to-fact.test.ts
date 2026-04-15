import { describe, it, expect } from "vitest";
import { sourceRecordToFact } from "../../../src/facts/record-to-fact.js";
import type { SourceRecord } from "../../../src/types/source.js";
import type { NormalizedEvent } from "../../../src/types/normalized.js";

function makeRecord(payload: unknown, overrides?: Partial<SourceRecord>): SourceRecord {
  return {
    recordId: "rec-1",
    ordinal: "2024-01-01T00:00:00Z",
    payload,
    provenance: {
      sourceId: "exchange-test",
      observedAt: "2024-01-01T00:00:00Z",
      sourceVersion: "v1",
    },
    ...overrides,
  };
}

function makeEvent(eventKind: string, overrides?: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event_id: "evt-1",
    event_kind: eventKind as NormalizedEvent["event_kind"],
    message_id: "msg-1",
    mailbox_id: "test@example.com",
    conversation_id: "conv-1",
    observed_at: "2024-01-01T00:00:00Z",
    received_at: "2024-01-01T00:00:00Z",
    payload: {
      schema_version: 1,
      mailbox_id: "test@example.com",
      message_id: "msg-1",
      conversation_id: "conv-1",
      received_at: "2024-01-01T00:00:00Z",
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
    ...overrides,
  } as NormalizedEvent;
}

describe("sourceRecordToFact", () => {
  describe("exchange records", () => {
    it("maps created events to mail.message.discovered", () => {
      const record = makeRecord(makeEvent("created"));
      const fact = sourceRecordToFact(record, "cursor-1");

      expect(fact.fact_type).toBe("mail.message.discovered");
      expect(fact.provenance.source_id).toBe("exchange-test");
      expect(fact.provenance.source_record_id).toBe("rec-1");
      expect(fact.provenance.source_cursor).toBe("cursor-1");
    });

    it("maps updated events to mail.message.changed", () => {
      const record = makeRecord(makeEvent("updated"));
      const fact = sourceRecordToFact(record, "cursor-1");

      expect(fact.fact_type).toBe("mail.message.changed");
    });

    it("maps deleted events to mail.message.removed", () => {
      const record = makeRecord(makeEvent("deleted"));
      const fact = sourceRecordToFact(record, "cursor-1");

      expect(fact.fact_type).toBe("mail.message.removed");
    });

    it("produces deterministic fact identity for identical inputs", () => {
      const record = makeRecord(makeEvent("created"));
      const fact1 = sourceRecordToFact(record, "cursor-1");
      const fact2 = sourceRecordToFact(record, "cursor-1");

      expect(fact1.fact_id).toBe(fact2.fact_id);
    });

    it("preserves mailbox data inside payload_json", () => {
      const record = makeRecord(makeEvent("created"));
      const fact = sourceRecordToFact(record, "cursor-1");

      const payload = JSON.parse(fact.payload_json);
      expect(payload.record_id).toBe("rec-1");
      expect(payload.event.mailbox_id).toBe("test@example.com");
    });

    it("uses null cursor when not provided", () => {
      const record = makeRecord(makeEvent("created"));
      const fact = sourceRecordToFact(record, null);

      expect(fact.provenance.source_cursor).toBeNull();
    });
  });

  describe("timer records", () => {
    it("maps timer.tick payload to timer.tick fact type", () => {
      const record = makeRecord(
        {
          kind: "timer.tick",
          slot_id: "maintenance:2024-01-15T12:05:00.000Z",
          schedule_id: "maintenance",
          slot_start: "2024-01-15T12:05:00.000Z",
          slot_end: "2024-01-15T12:06:00.000Z",
        },
        { provenance: { sourceId: "timer:test", observedAt: "2024-01-01T00:00:00Z", sourceVersion: "v1" }, recordId: "maintenance:2024-01-15T12:05:00.000Z" },
      );

      const fact = sourceRecordToFact(record, "2024-01-15T12:05:00.000Z");

      expect(fact.fact_type).toBe("timer.tick");
      expect(fact.provenance.source_id).toBe("timer:test");
      expect(fact.provenance.source_record_id).toBe("maintenance:2024-01-15T12:05:00.000Z");
      expect(fact.provenance.source_cursor).toBe("2024-01-15T12:05:00.000Z");
    });

    it("produces deterministic fact_id for identical timer ticks", () => {
      const payload = {
        kind: "timer.tick",
        slot_id: "maintenance:2024-01-15T12:05:00.000Z",
        schedule_id: "maintenance",
        slot_start: "2024-01-15T12:05:00.000Z",
        slot_end: "2024-01-15T12:06:00.000Z",
      };
      const record = makeRecord(payload, { provenance: { sourceId: "timer:test", observedAt: "2024-01-01T00:00:00Z", sourceVersion: "v1" }, recordId: payload.slot_id });

      const fact1 = sourceRecordToFact(record, "cursor-1");
      const fact2 = sourceRecordToFact(record, "cursor-1");

      expect(fact1.fact_id).toBe(fact2.fact_id);
    });

    it("preserves timer payload inside payload_json", () => {
      const payload = {
        kind: "timer.tick",
        slot_id: "maintenance:2024-01-15T12:05:00.000Z",
        schedule_id: "maintenance",
        slot_start: "2024-01-15T12:05:00.000Z",
        slot_end: "2024-01-15T12:06:00.000Z",
      };
      const record = makeRecord(payload, { sourceId: "timer:test", recordId: payload.slot_id });

      const fact = sourceRecordToFact(record, null);
      const parsed = JSON.parse(fact.payload_json);

      expect(parsed.event.kind).toBe("timer.tick");
      expect(parsed.event.schedule_id).toBe("maintenance");
      expect(parsed.event.slot_start).toBe("2024-01-15T12:05:00.000Z");
    });
  });
});
