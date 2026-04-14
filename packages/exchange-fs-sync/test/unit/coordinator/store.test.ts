import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import {
  createThreadRecord,
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

      const fetched = store.getThread(record.thread_id, record.mailbox_id);
      expect(fetched).toEqual(record);
    });

    it("updates an existing thread record on conflict", () => {
      const record = createThreadRecord();
      store.upsertThread(record);

      const updated = createThreadRecord({ status: "resolved", updated_at: new Date().toISOString() });
      store.upsertThread(updated);

      const fetched = store.getThread(record.thread_id, record.mailbox_id);
      expect(fetched?.status).toBe("resolved");
      expect(fetched?.updated_at).toBe(updated.updated_at);
    });

    it("returns undefined for missing thread", () => {
      expect(store.getThread("missing", "missing")).toBeUndefined();
    });
  });

  describe("charter outputs", () => {
    it("inserts and retrieves charter outputs by thread", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const output = createCharterOutput();
      store.insertCharterOutput(output);

      const fetched = store.getOutputsByThread(thread.thread_id, thread.mailbox_id);
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

      const fetched = store.getOutputsByThread(thread.thread_id, thread.mailbox_id);
      expect(fetched.map((o) => o.output_id)).toEqual(["o2", "o1"]);
    });

    it("cascades charter outputs when thread is deleted", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);
      store.insertCharterOutput(createCharterOutput());

      db.prepare("delete from thread_records where thread_id = ? and mailbox_id = ?").run(
        thread.thread_id,
        thread.mailbox_id,
      );

      const fetched = store.getOutputsByThread(thread.thread_id, thread.mailbox_id);
      expect(fetched).toHaveLength(0);
    });
  });

  describe("foreman decisions", () => {
    it("inserts and retrieves decisions by thread", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const decision = createForemanDecision();
      store.insertDecision(decision);

      const fetched = store.getDecisionsByThread(thread.thread_id, thread.mailbox_id);
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toEqual(decision);
    });

    it("links a decision to an outbound command", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);

      const decision = createForemanDecision();
      store.insertDecision(decision);

      store.linkDecisionToOutbound(decision.decision_id, "outbound-123");

      const fetched = store.getDecisionsByThread(thread.thread_id, thread.mailbox_id);
      expect(fetched[0]!.outbound_id).toBe("outbound-123");
    });

    it("cascades decisions when thread is deleted", () => {
      const thread = createThreadRecord();
      store.upsertThread(thread);
      store.insertDecision(createForemanDecision());

      db.prepare("delete from thread_records where thread_id = ? and mailbox_id = ?").run(
        thread.thread_id,
        thread.mailbox_id,
      );

      const fetched = store.getDecisionsByThread(thread.thread_id, thread.mailbox_id);
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

      const cmd = createOutboundCommand({ outbound_id: "shared-1", thread_id: thread.thread_id });
      outboundStore.createCommand(cmd, createOutboundVersion({ outbound_id: "shared-1" }));

      expect(store.getThread(thread.thread_id, thread.mailbox_id)).toBeDefined();
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

      const fetched = store.getDecisionsByThread(thread.thread_id, thread.mailbox_id);
      expect(fetched[0]!.created_by).toBe("foreman:fm-001/charter:support_steward,obligation_keeper");
    });
  });
});
