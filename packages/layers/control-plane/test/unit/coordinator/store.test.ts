import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import {
  createContextRecord,
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

  describe("context records", () => {
    it("inserts a new context record", () => {
      const record = createContextRecord();
      store.upsertContextRecord(record);

      const fetched = store.getContextRecord(record.context_id);
      expect(fetched).toEqual(record);
    });

    it("updates an existing context record on conflict", () => {
      const record = createContextRecord();
      store.upsertContextRecord(record);

      const updated = createContextRecord({ status: "archived", updated_at: new Date().toISOString() });
      store.upsertContextRecord(updated);

      const fetched = store.getContextRecord(record.context_id);
      expect(fetched?.status).toBe("archived");
      expect(fetched?.updated_at).toBe(updated.updated_at);
    });

    it("returns undefined for missing context", () => {
      expect(store.getContextRecord("missing")).toBeUndefined();
    });
  });

  describe("context revisions", () => {
    it("nextRevisionOrdinal returns monotonically increasing values", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      const o1 = store.nextRevisionOrdinal(ctx.context_id);
      const o2 = store.nextRevisionOrdinal(ctx.context_id);
      const o3 = store.nextRevisionOrdinal(ctx.context_id);

      expect(o1).toBe(1);
      expect(o2).toBe(2);
      expect(o3).toBe(3);
    });

    it("getLatestRevisionOrdinal returns the highest ordinal", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      expect(store.getLatestRevisionOrdinal(ctx.context_id)).toBeNull();

      store.recordRevision(ctx.context_id, 1, "evt-1");
      store.recordRevision(ctx.context_id, 2, "evt-2");

      expect(store.getLatestRevisionOrdinal(ctx.context_id)).toBe(2);
    });

    it("recordRevision stores trigger_event_id", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      store.recordRevision(ctx.context_id, 1, "trigger-123");

      const row = db
        .prepare(`select * from context_revisions where context_id = ? and ordinal = 1`)
        .get(ctx.context_id) as Record<string, unknown>;
      expect(row.trigger_event_id).toBe("trigger-123");
    });

    it("revision ordinals are isolated per context", () => {
      const ctxA = createContextRecord({ context_id: "ctx-a" });
      const ctxB = createContextRecord({ context_id: "ctx-b" });
      store.upsertContextRecord(ctxA);
      store.upsertContextRecord(ctxB);

      expect(store.nextRevisionOrdinal("ctx-a")).toBe(1);
      expect(store.nextRevisionOrdinal("ctx-b")).toBe(1);
      expect(store.nextRevisionOrdinal("ctx-a")).toBe(2);
    });
  });

  describe("foreman decisions", () => {
    it("inserts and retrieves decisions by context", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      const decision = createForemanDecision({ context_id: ctx.context_id, scope_id: ctx.scope_id });
      store.insertDecision(decision);

      const fetched = store.getDecisionsByContext(ctx.context_id, ctx.scope_id);
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toEqual(decision);
    });

    it("links a decision to an outbound command", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      const decision = createForemanDecision({ context_id: ctx.context_id, scope_id: ctx.scope_id });
      store.insertDecision(decision);

      store.linkDecisionToOutbound(decision.decision_id, "outbound-123");

      const fetched = store.getDecisionsByContext(ctx.context_id, ctx.scope_id);
      expect(fetched[0]!.outbound_id).toBe("outbound-123");
    });

    it("cascades decisions when context is deleted", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);
      store.insertDecision(createForemanDecision({ context_id: ctx.context_id, scope_id: ctx.scope_id }));

      db.prepare("delete from context_records where context_id = ?").run(ctx.context_id);

      const fetched = store.getDecisionsByContext(ctx.context_id, ctx.scope_id);
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

      const override1 = createPolicyOverride({
        override_id: "ov1",
        outbound_id: "o1",
        created_at: "2024-01-02T00:00:00Z",
      });
      const override2 = createPolicyOverride({
        override_id: "ov2",
        outbound_id: "o1",
        created_at: "2024-01-01T00:00:00Z",
      });
      store.insertOverride(override1);
      store.insertOverride(override2);

      const fetched = store.getOverridesByOutboundId("o1");
      expect(fetched.map((o) => o.override_id)).toEqual(["ov2", "ov1"]);
    });
  });

  describe("shared database coexistence", () => {
    it("shares the same db connection with outbound store", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      const cmd = createOutboundCommand({ outbound_id: "shared-1", context_id: ctx.context_id });
      outboundStore.createCommand(cmd, createOutboundVersion({ outbound_id: "shared-1" }));

      expect(store.getContextRecord(ctx.context_id)).toBeDefined();
      expect(outboundStore.getCommand("shared-1")).toBeDefined();
    });
  });

  describe("created_by format", () => {
    it("stores and retrieves the foreman created_by string", () => {
      const ctx = createContextRecord();
      store.upsertContextRecord(ctx);

      const decision = createForemanDecision({
        context_id: ctx.context_id,
        scope_id: ctx.scope_id,
        created_by: "foreman:fm-001/charter:support_steward,obligation_keeper",
      });
      store.insertDecision(decision);

      const fetched = store.getDecisionsByContext(ctx.context_id, ctx.scope_id);
      expect(fetched[0]!.created_by).toBe("foreman:fm-001/charter:support_steward,obligation_keeper");
    });
  });
});
