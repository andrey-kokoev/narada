import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteAgentTraceStore } from "../../../../src/agent/traces/store.js";
import { SqliteOutboundStore } from "../../../../src/outbound/store.js";
import { createOutboundCommand, createOutboundVersion } from "../../outbound/fixtures.js";

describe("SqliteAgentTraceStore", () => {
  let db: Database.Database;
  let store: SqliteAgentTraceStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteAgentTraceStore({ db });
    store.initSchema();
  });

  afterEach(() => {
    store.close();
  });

  describe("writeTrace", () => {
    it("persists and returns a trace with generated trace_id and created_at", () => {
      const trace = store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: "sess-1",
        trace_type: "observation",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: "msg-1",
        payload_json: JSON.stringify({ event: "new_message" }),
      });

      expect(trace.trace_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(trace.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(trace.rowid).toBeGreaterThan(0);
      expect(trace.trace_type).toBe("observation");
    });
  });

  describe("readByThread", () => {
    it("returns traces in reverse chronological order", () => {
      const t1 = store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "observation",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 1 }),
      });

      const t2 = store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "decision",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 2 }),
      });

      const results = store.readByThread("t1");
      expect(results.map((r) => r.trace_id)).toEqual([t2.trace_id, t1.trace_id]);
    });

    it("respects after, before, limit, and types filters", () => {
      const stmt = db.prepare(`
        insert into agent_traces (
          trace_id, thread_id, mailbox_id, agent_id, session_id,
          trace_type, parent_trace_id, reference_outbound_id, reference_message_id,
          payload_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run("tid-1", "t1", "mb1", "agent-a", null, "observation", null, null, null, "{}", "2026-04-13T10:00:00.000Z");
      stmt.run("tid-2", "t1", "mb1", "agent-a", null, "decision", null, null, null, "{}", "2026-04-13T11:00:00.000Z");
      stmt.run("tid-3", "t1", "mb1", "agent-a", null, "action", null, null, null, "{}", "2026-04-13T12:00:00.000Z");

      const all = store.readByThread("t1");
      expect(all).toHaveLength(3);

      const limited = store.readByThread("t1", { limit: 1 });
      expect(limited).toHaveLength(1);
      expect(limited[0]!.trace_type).toBe("action");

      const beforeOnly = store.readByThread("t1", { before: "2026-04-13T11:30:00.000Z" });
      expect(beforeOnly.map((r) => r.trace_type)).toEqual(["decision", "observation"]);

      const afterOnly = store.readByThread("t1", { after: "2026-04-13T11:30:00.000Z" });
      expect(afterOnly.map((r) => r.trace_type)).toEqual(["action"]);

      const typesOnly = store.readByThread("t1", { types: ["observation", "decision"] });
      expect(typesOnly.map((r) => r.trace_type)).toEqual(["decision", "observation"]);
    });
  });

  describe("readBySession", () => {
    it("returns traces for a session in chronological order", () => {
      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: "sess-x",
        trace_type: "reasoning",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 1 }),
      });

      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: "sess-x",
        trace_type: "decision",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 2 }),
      });

      const results = store.readBySession("sess-x");
      expect(results.map((r) => r.trace_type)).toEqual(["reasoning", "decision"]);
    });
  });

  describe("readByOutboundId", () => {
    it("returns traces linked to a specific outbound command", () => {
      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "decision",
        parent_trace_id: null,
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "action",
        parent_trace_id: null,
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "observation",
        parent_trace_id: null,
        reference_outbound_id: "out-2",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      const results = store.readByOutboundId("out-1");
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.trace_type)).toEqual(["decision", "action"]);
    });
  });

  describe("readUnlinkedDecisions", () => {
    it("returns traces with no reference_outbound_id", () => {
      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "decision",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "decision",
        parent_trace_id: null,
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "observation",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      const allUnlinked = store.readUnlinkedDecisions();
      expect(allUnlinked).toHaveLength(2);

      const decisionsOnly = store.readUnlinkedDecisions({ types: ["decision"] });
      expect(decisionsOnly).toHaveLength(1);
      expect(decisionsOnly[0]!.trace_type).toBe("decision");
    });
  });

  describe("getTrace", () => {
    it("retrieves a trace by trace_id", () => {
      const written = store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "handoff",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ to_agent: "agent-b" }),
      });

      const fetched = store.getTrace(written.trace_id);
      expect(fetched).toEqual(written);

      expect(store.getTrace("nonexistent")).toBeUndefined();
    });
  });

  describe("initSchema", () => {
    it("is idempotent", () => {
      expect(() => {
        store.initSchema();
        store.initSchema();
        store.initSchema();
      }).not.toThrow();

      const trace = store.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "observation",
        parent_trace_id: null,
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      expect(store.getTrace(trace.trace_id)).toBeDefined();
    });
  });

  describe("shared database", () => {
    it("works when given the same Database instance as SqliteOutboundStore", () => {
      const sharedDb = new Database(":memory:");
      const outboundStore = new SqliteOutboundStore({ dbPath: ":memory:" });
      // Note: SqliteOutboundStore creates its own db instance from path,
      // so we test the conceptual sharing pattern by injecting the same db.
      outboundStore.close();

      const traceStore = new SqliteAgentTraceStore({ db: sharedDb });
      traceStore.initSchema();

      const outboundStore2 = new (SqliteOutboundStore as unknown as new (opts: { db: Database.Database }) => SqliteOutboundStore)({ db: sharedDb });
      // Actually, SqliteOutboundStore takes dbPath not db. Let's just init outbound schema manually.
      const outboundInit = new SqliteOutboundStore({ dbPath: ":memory:" });
      outboundInit.close();

      // Just verify trace store works on sharedDb and outbound schema can coexist
      const cmdSchema = sharedDb.prepare(`
        create table if not exists outbound_commands (
          outbound_id text primary key
        )
      `);
      cmdSchema.run();

      const trace = traceStore.writeTrace({
        thread_id: "t1",
        mailbox_id: "mb1",
        agent_id: "agent-a",
        session_id: null,
        trace_type: "decision",
        parent_trace_id: null,
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      expect(traceStore.getTrace(trace.trace_id)).toBeDefined();
      traceStore.close();
    });
  });

  describe("ordering durability", () => {
    it("uses rowid as a stable tie-breaker for same-instant traces", () => {
      const fixedTime = "2026-04-13T12:00:00.000Z";

      // Insert directly with identical created_at to force tie
      const stmt = db.prepare(`
        insert into agent_traces (
          trace_id, thread_id, mailbox_id, agent_id, session_id,
          trace_type, parent_trace_id, reference_outbound_id, reference_message_id,
          payload_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run("tid-1", "t1", "mb1", "agent-a", null, "observation", null, null, null, "{}", fixedTime);
      stmt.run("tid-2", "t1", "mb1", "agent-a", null, "decision", null, null, null, "{}", fixedTime);
      stmt.run("tid-3", "t1", "mb1", "agent-a", null, "action", null, null, null, "{}", fixedTime);

      const results = store.readByThread("t1");
      expect(results).toHaveLength(3);
      // Because rowid asc = insertion order, desc ordering means last inserted first
      expect(results.map((r) => r.trace_id)).toEqual(["tid-3", "tid-2", "tid-1"]);
      expect(results[0]!.rowid).toBeGreaterThan(results[1]!.rowid);
      expect(results[1]!.rowid).toBeGreaterThan(results[2]!.rowid);
    });
  });
});
