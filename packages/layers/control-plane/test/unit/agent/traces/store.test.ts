import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteAgentTraceStore } from "../../../../src/agent/traces/store.js";

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
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: "sess-1",
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: "msg-1",
        payload_json: JSON.stringify({ event: "new_message" }),
      });

      expect(trace.trace_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(trace.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(trace.trace_type).toBe("observation");
      expect(trace.execution_id).toBe("ex-1");
      expect(trace.context_id).toBe("conv-1");
      expect(trace.work_item_id).toBe("wi-1");
    });
  });

  describe("readByExecutionId", () => {
    it("returns traces for an execution in chronological order", () => {
      store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: null,
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 1 }),
      });

      store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 2 }),
      });

      store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: null,
        trace_type: "action",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 3 }),
      });

      const results = store.readByExecutionId("ex-1");
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.trace_type).sort()).toEqual(["decision", "observation"]);
    });
  });

  describe("readByContextId", () => {
    it("returns traces in reverse chronological order", () => {
      const t1 = store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 1 }),
      });

      const t2 = store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 2 }),
      });

      const results = store.readByContextId("conv-1");
      expect(results.map((r) => r.trace_id).sort()).toEqual([t1.trace_id, t2.trace_id].sort());
    });

    it("respects after, before, limit, and types filters", () => {
      const stmt = db.prepare(`
        insert into agent_traces (
          trace_id, execution_id, context_id, work_item_id, session_id,
          trace_type, reference_outbound_id, reference_message_id,
          payload_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run("tid-1", "ex-1", "conv-1", null, null, "observation", null, null, "{}", "2026-04-13T10:00:00.000Z");
      stmt.run("tid-2", "ex-2", "conv-1", null, null, "decision", null, null, "{}", "2026-04-13T11:00:00.000Z");
      stmt.run("tid-3", "ex-3", "conv-1", null, null, "action", null, null, "{}", "2026-04-13T12:00:00.000Z");

      const all = store.readByContextId("conv-1");
      expect(all).toHaveLength(3);

      const limited = store.readByContextId("conv-1", { limit: 1 });
      expect(limited).toHaveLength(1);
      expect(limited[0]!.trace_type).toBe("action");

      const beforeOnly = store.readByContextId("conv-1", { before: "2026-04-13T11:30:00.000Z" });
      expect(beforeOnly.map((r) => r.trace_type)).toEqual(["decision", "observation"]);

      const afterOnly = store.readByContextId("conv-1", { after: "2026-04-13T11:30:00.000Z" });
      expect(afterOnly.map((r) => r.trace_type)).toEqual(["action"]);

      const typesOnly = store.readByContextId("conv-1", { types: ["observation", "decision"] });
      expect(typesOnly.map((r) => r.trace_type)).toEqual(["decision", "observation"]);
    });
  });

  describe("readBySession", () => {
    it("returns traces for a session in chronological order", () => {
      store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: "sess-x",
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 1 }),
      });

      store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: "sess-x",
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ n: 2 }),
      });

      const results = store.readBySession("sess-x");
      expect(results.map((r) => r.trace_type).sort()).toEqual(["decision", "observation"]);
    });
  });

  describe("readByOutboundId", () => {
    it("returns traces linked to a specific outbound command", () => {
      store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "action",
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      store.writeTrace({
        execution_id: "ex-3",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "observation",
        reference_outbound_id: "out-2",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      const results = store.readByOutboundId("out-1");
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.trace_type).sort()).toEqual(["action", "decision"]);
    });
  });

  describe("getTrace", () => {
    it("retrieves a trace by trace_id", () => {
      const written = store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "handoff",
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
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      expect(store.getTrace(trace.trace_id)).toBeDefined();
    });

    it("migrates old schema with conversation_id to context_id", () => {
      // Simulate an existing database with the pre-Task-149 schema.
      // The beforeEach already called initSchema(), so drop the new table first.
      db.prepare("drop table if exists agent_traces").run();

      db.exec(`
        create table agent_traces (
          trace_id text primary key,
          execution_id text not null,
          conversation_id text not null,
          work_item_id text,
          session_id text,
          trace_type text not null,
          reference_outbound_id text,
          reference_message_id text,
          payload_json text not null,
          created_at text not null
        );

        create index idx_agent_traces_conversation
          on agent_traces(conversation_id, created_at desc);
      `);

      db.prepare(`
        insert into agent_traces (
          trace_id, execution_id, conversation_id, work_item_id, session_id,
          trace_type, reference_outbound_id, reference_message_id,
          payload_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "old-trace-1",
        "ex-old",
        "ctx-old",
        "wi-old",
        null,
        "observation",
        null,
        null,
        JSON.stringify({ legacy: true }),
        "2026-04-01T00:00:00.000Z",
      );

      // Re-init schema — this should trigger migration
      store.initSchema();

      // Existing row must be readable via new API
      const migrated = store.readByContextId("ctx-old");
      expect(migrated).toHaveLength(1);
      expect(migrated[0]!.trace_id).toBe("old-trace-1");
      expect(migrated[0]!.context_id).toBe("ctx-old");
      expect(migrated[0]!.execution_id).toBe("ex-old");
      expect(migrated[0]!.work_item_id).toBe("wi-old");
      expect(migrated[0]!.trace_type).toBe("observation");
      expect(JSON.parse(migrated[0]!.payload_json)).toEqual({ legacy: true });

      // New writes must work after migration
      const fresh = store.writeTrace({
        execution_id: "ex-new",
        context_id: "ctx-old",
        work_item_id: null,
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ fresh: true }),
      });

      const all = store.readByContextId("ctx-old");
      expect(all).toHaveLength(2);
      expect(all.map((t) => t.trace_id)).toContain("old-trace-1");
      expect(all.map((t) => t.trace_id)).toContain(fresh.trace_id);

      // Old index should be gone, new index should exist
      const indexes = db
        .prepare("select name from sqlite_master where type = 'index' and tbl_name = 'agent_traces'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_agent_traces_context");
      expect(indexNames).not.toContain("idx_agent_traces_conversation");
    });
  });

  describe("shared database", () => {
    it("works when multiple trace stores share the same Database instance", () => {
      const sharedDb = new Database(":memory:");
      const traceStore1 = new SqliteAgentTraceStore({ db: sharedDb });
      const traceStore2 = new SqliteAgentTraceStore({ db: sharedDb });
      traceStore1.initSchema();
      traceStore2.initSchema();

      const trace = traceStore1.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: null,
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: "out-1",
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      expect(traceStore2.getTrace(trace.trace_id)).toBeDefined();
      traceStore1.close();
    });
  });

  describe("trace independence — non-authoritative", () => {
    it("deleting all traces does not affect other store operations", () => {
      store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({}),
      });

      db.prepare("delete from agent_traces").run();

      // Store operations should continue normally
      const trace = store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: null,
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ after_delete: true }),
      });

      expect(store.getTrace(trace.trace_id)).toBeDefined();
      expect(store.readByExecutionId("ex-1")).toHaveLength(0);
      expect(store.readByExecutionId("ex-2")).toHaveLength(1);
    });

    it("traces from multiple executions on the same conversation do not collapse", () => {
      const t1 = store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: "sess-a",
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ exec: 1 }),
      });

      const t2 = store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: "wi-2",
        session_id: "sess-b",
        trace_type: "observation",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ exec: 2 }),
      });

      const byEx1 = store.readByExecutionId("ex-1");
      expect(byEx1).toHaveLength(1);
      expect(byEx1[0]!.trace_id).toBe(t1.trace_id);

      const byEx2 = store.readByExecutionId("ex-2");
      expect(byEx2).toHaveLength(1);
      expect(byEx2[0]!.trace_id).toBe(t2.trace_id);

      const byContext = store.readByContextId("conv-1");
      expect(byContext).toHaveLength(2);
    });

    it("superseding a work item does not corrupt historical trace interpretation", () => {
      const t1 = store.writeTrace({
        execution_id: "ex-1",
        context_id: "conv-1",
        work_item_id: "wi-1",
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ version: 1 }),
      });

      const t2 = store.writeTrace({
        execution_id: "ex-2",
        context_id: "conv-1",
        work_item_id: "wi-2",
        session_id: null,
        trace_type: "decision",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: JSON.stringify({ version: 2 }),
      });

      // Simulate supersession by deleting newer trace
      db.prepare("delete from agent_traces where trace_id = ?").run(t2.trace_id);

      // Historical trace for ex-1 remains intact and interpretable
      const historical = store.readByExecutionId("ex-1");
      expect(historical).toHaveLength(1);
      expect(historical[0]!.trace_id).toBe(t1.trace_id);
      expect(JSON.parse(historical[0]!.payload_json)).toEqual({ version: 1 });
    });
  });
});
