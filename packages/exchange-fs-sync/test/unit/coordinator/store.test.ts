import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import {
  createThreadRecord,
  createConversationRecord,
  createCharterOutput,
  createForemanDecision,
  createPolicyOverride,
} from "./fixtures.js";
import { createOutboundCommand, createOutboundVersion } from "../outbound/fixtures.js";

describe("SqliteCoordinatorStore", () => {
  let db: Database.Database;
  let store: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    store.initSchema();
    outboundStore.initSchema();
  });

  afterEach(() => {
    outboundStore.close();
    store.close();
    db.close();
  });

  describe("thread records", () => {
    it("inserts a new thread record", () => {
      const record = createThreadRecord();
      store.upsertThread(record);

      const fetched = store.getThread(record.conversation_id, record.mailbox_id);
      expect(fetched).toEqual(record);
    });

    it("updates an existing thread record on conflict", () => {
      const record = createThreadRecord();
      store.upsertThread(record);

      const updated = createThreadRecord({ status: "resolved", updated_at: new Date().toISOString() });
      store.upsertThread(updated);

      const fetched = store.getThread(record.conversation_id, record.mailbox_id);
      expect(fetched?.status).toBe("resolved");
      expect(fetched?.updated_at).toBe(updated.updated_at);
    });

    it("returns undefined for missing thread", () => {
      expect(store.getThread("missing", "missing")).toBeUndefined();
    });
  });

  describe("conversation records", () => {
    it("inserts a new conversation record", () => {
      const record = createConversationRecord();
      store.upsertConversationRecord(record);

      const fetched = store.getConversationRecord(record.conversation_id);
      expect(fetched).toEqual(record);
    });

    it("updates an existing conversation record on conflict", () => {
      const record = createConversationRecord();
      store.upsertConversationRecord(record);

      const updated = createConversationRecord({ status: "archived", updated_at: new Date().toISOString() });
      store.upsertConversationRecord(updated);

      const fetched = store.getConversationRecord(record.conversation_id);
      expect(fetched?.status).toBe("archived");
      expect(fetched?.updated_at).toBe(updated.updated_at);
    });

    it("returns undefined for missing conversation", () => {
      expect(store.getConversationRecord("missing")).toBeUndefined();
    });
  });

  describe("migration from thread_records to conversation_records", () => {
    it("migrates legacy thread_records automatically on initSchema", () => {
      // Simulate a legacy database by inserting directly into thread_records
      // before calling initSchema on a fresh store.
      const legacyDb = new Database(":memory:");
      legacyDb.exec(`
        create table thread_records (
          thread_id text not null,
          mailbox_id text not null,
          primary_charter text not null,
          secondary_charters_json text not null default '[]',
          status text not null,
          assigned_agent text,
          last_message_at text not null,
          last_inbound_at text,
          last_outbound_at text,
          last_analyzed_at text,
          last_triaged_at text,
          created_at text not null,
          updated_at text not null,
          primary key (thread_id, mailbox_id)
        );
      `);
      const legacyRecord = createThreadRecord({ conversation_id: "legacy-thread", mailbox_id: "mb-1" });
      legacyDb.prepare(`
        insert into thread_records values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        legacyRecord.conversation_id,
        legacyRecord.mailbox_id,
        legacyRecord.primary_charter,
        legacyRecord.secondary_charters_json,
        legacyRecord.status,
        legacyRecord.assigned_agent,
        legacyRecord.last_message_at,
        legacyRecord.last_inbound_at,
        legacyRecord.last_outbound_at,
        legacyRecord.last_analyzed_at,
        legacyRecord.last_triaged_at,
        legacyRecord.created_at,
        legacyRecord.updated_at,
      );

      const migratedStore = new SqliteCoordinatorStore({ db: legacyDb });
      migratedStore.initSchema();

      const fetched = migratedStore.getConversationRecord("legacy-thread");
      expect(fetched).toBeDefined();
      expect(fetched?.conversation_id).toBe("legacy-thread");
      expect(fetched?.mailbox_id).toBe("mb-1");
      expect(fetched?.primary_charter).toBe(legacyRecord.primary_charter);

      legacyDb.close();
    });

    it("migration is idempotent", () => {
      const record = createThreadRecord({ conversation_id: "idempotent-thread" });
      store.upsertThread(record);

      // Calling initSchema again should not throw or duplicate rows.
      store.initSchema();
      store.initSchema();

      const rows = db.prepare(`select count(*) as c from conversation_records where conversation_id = ?`).get("idempotent-thread") as { c: number };
      expect(rows.c).toBe(1);
    });
  });

  describe("conversation revisions", () => {
    it("nextRevisionOrdinal returns monotonically increasing values", () => {
      const conv = createConversationRecord();
      store.upsertConversationRecord(conv);

      const o1 = store.nextRevisionOrdinal(conv.conversation_id);
      const o2 = store.nextRevisionOrdinal(conv.conversation_id);
      const o3 = store.nextRevisionOrdinal(conv.conversation_id);

      expect(o1).toBe(1);
      expect(o2).toBe(2);
      expect(o3).toBe(3);
    });

    it("getLatestRevisionOrdinal returns the highest ordinal", () => {
      const conv = createConversationRecord();
      store.upsertConversationRecord(conv);

      expect(store.getLatestRevisionOrdinal(conv.conversation_id)).toBeNull();

      store.recordRevision(conv.conversation_id, 1, "evt-1");
      store.recordRevision(conv.conversation_id, 2, "evt-2");

      expect(store.getLatestRevisionOrdinal(conv.conversation_id)).toBe(2);
    });

    it("recordRevision stores trigger_event_id", () => {
      const conv = createConversationRecord();
      store.upsertConversationRecord(conv);

      store.recordRevision(conv.conversation_id, 1, "trigger-123");

      const row = db.prepare(`select * from conversation_revisions where conversation_id = ? and ordinal = 1`).get(conv.conversation_id) as Record<string, unknown>;
      expect(row.trigger_event_id).toBe("trigger-123");
    });

    it("revision ordinals are isolated per conversation", () => {
      const convA = createConversationRecord({ conversation_id: "conv-a" });
      const convB = createConversationRecord({ conversation_id: "conv-b" });
      store.upsertConversationRecord(convA);
      store.upsertConversationRecord(convB);

      expect(store.nextRevisionOrdinal("conv-a")).toBe(1);
      expect(store.nextRevisionOrdinal("conv-b")).toBe(1);
      expect(store.nextRevisionOrdinal("conv-a")).toBe(2);
    });
  });

  describe("charter outputs", () => {
    it("inserts and retrieves charter outputs by thread", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const output = createCharterOutput();
      store.insertCharterOutput(output);

      const fetched = store.getOutputsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toEqual(output);
    });

    it("returns outputs in analyzed_at desc order", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const output1 = createCharterOutput({ output_id: "o1", analyzed_at: "2024-01-01T00:00:00Z" });
      const output2 = createCharterOutput({ output_id: "o2", analyzed_at: "2024-01-02T00:00:00Z" });
      store.insertCharterOutput(output1);
      store.insertCharterOutput(output2);

      const fetched = store.getOutputsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched.map((o) => o.output_id)).toEqual(["o2", "o1"]);
    });

    it("cascades charter outputs when thread is deleted", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);
      store.insertCharterOutput(createCharterOutput());

      db.prepare("delete from thread_records where thread_id = ? and mailbox_id = ?").run(
        thread.conversation_id,
        thread.mailbox_id,
      );

      const fetched = store.getOutputsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched).toHaveLength(0);
    });
  });

  describe("foreman decisions", () => {
    it("inserts and retrieves decisions by thread", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const decision = createForemanDecision();
      store.insertDecision(decision);

      const fetched = store.getDecisionsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toEqual(decision);
    });

    it("links a decision to an outbound command", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const decision = createForemanDecision();
      store.insertDecision(decision);

      store.linkDecisionToOutbound(decision.decision_id, "outbound-123");

      const fetched = store.getDecisionsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched[0]!.outbound_id).toBe("outbound-123");
    });

    it("cascades decisions when thread is deleted", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);
      store.insertDecision(createForemanDecision());

      db.prepare("delete from thread_records where thread_id = ? and mailbox_id = ?").run(
        thread.conversation_id,
        thread.mailbox_id,
      );

      const fetched = store.getDecisionsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched).toHaveLength(0);
    });
  });

  describe("policy overrides", () => {
    it("inserts and retrieves overrides by outbound id", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1" });
      outboundStore.createCommand(cmd, createOutboundVersion({ outbound_id: "o1" }));

      const override = createPolicyOverride({ outbound_id: "o1" });
      store.insertOverride(override);

      const fetched = store.getOverridesByOutboundId("o1");
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toEqual(override);
    });

    it("returns multiple overrides in created_at asc order", () => {
      const cmd = createOutboundCommand({ outbound_id: "o1" });
      outboundStore.createCommand(cmd, createOutboundVersion({ outbound_id: "o1" }));

      const override1 = createPolicyOverride({ override_id: "ov1", outbound_id: "o1", created_at: "2024-01-02T00:00:00Z" });
      const override2 = createPolicyOverride({ override_id: "ov2", outbound_id: "o1", created_at: "2024-01-01T00:00:00Z" });
      store.insertOverride(override1);
      store.insertOverride(override2);

      const fetched = store.getOverridesByOutboundId("o1");
      expect(fetched.map((o) => o.override_id)).toEqual(["ov2", "ov1"]);
    });
  });

  describe("shared database coexistence", () => {
    it("shares the same db connection with outbound store", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const cmd = createOutboundCommand({ outbound_id: "shared-1", conversation_id: thread.conversation_id });
      outboundStore.createCommand(cmd, createOutboundVersion({ outbound_id: "shared-1" }));

      expect(store.getThread(thread.conversation_id, thread.mailbox_id)).toBeDefined();
      expect(outboundStore.getCommand("shared-1")).toBeDefined();
    });
  });

  describe("created_by format", () => {
    it("stores and retrieves the foreman created_by string", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const decision = createForemanDecision({
        created_by: "foreman:fm-001/charter:support_steward,obligation_keeper",
      });
      store.insertDecision(decision);

      const fetched = store.getDecisionsByThread(thread.conversation_id, thread.mailbox_id);
      expect(fetched[0]!.created_by).toBe("foreman:fm-001/charter:support_steward,obligation_keeper");
    });
  });
});
