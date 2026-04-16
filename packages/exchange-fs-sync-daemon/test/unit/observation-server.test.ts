import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { get } from "node:http";
import Database from "better-sqlite3";
import {
  SqliteCoordinatorStore,
  SqliteOutboundStore,
  SqliteIntentStore,
  SqliteProcessExecutionStore,
  SqliteFactStore,
  DefaultWorkerRegistry,
} from "@narada/exchange-fs-sync";
import { createObservationServer, type ObservationApiScope } from "../../src/observation-server.js";

async function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on("error", reject);
  });
}

describe("observation server", () => {
  const db = new Database(":memory:");
  const factDb = new Database(":memory:");

  const coordinatorStore = new SqliteCoordinatorStore({ db });
  coordinatorStore.initSchema();

  const outboundStore = new SqliteOutboundStore({ db });
  outboundStore.initSchema();

  const intentStore = new SqliteIntentStore({ db });
  intentStore.initSchema();

  const executionStore = new SqliteProcessExecutionStore({ db });
  executionStore.initSchema();

  const factStore = new SqliteFactStore({ db: factDb });
  factStore.initSchema();

  const workerRegistry = new DefaultWorkerRegistry();
  workerRegistry.register({
    identity: {
      worker_id: "process_executor",
      executor_family: "process",
      concurrency_policy: "singleton",
      description: "Test worker",
    },
    fn: async () => ({ processed: false }),
  });

  // Seed data
  coordinatorStore.upsertConversationRecord({
    conversation_id: "ctx-1",
    mailbox_id: "scope-a",
    primary_charter: "support_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: "2026-04-13T12:00:00Z",
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
  });

  coordinatorStore.insertWorkItem({
    work_item_id: "wi-1",
    context_id: "ctx-1",
    scope_id: "scope-a",
    status: "opened",
    priority: 1,
    opened_for_revision_id: "rev-1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
    context_json: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
  });

  intentStore.admit({
    intent_id: "int-1",
    intent_type: "process.run",
    executor_family: "process",
    payload_json: JSON.stringify({ command: "echo hello" }),
    idempotency_key: "ik-1",
    status: "admitted",
    context_id: "ctx-1",
    target_id: null,
    terminal_reason: null,
  });

  factStore.ingest({
    fact_id: "fact-1",
    fact_type: "timer.tick",
    provenance: {
      source_id: "timer",
      source_record_id: "tick-1",
      observed_at: "2026-04-13T12:00:00Z",
    },
    payload_json: "{}",
  });

  executionStore.create({
    execution_id: "pe-1",
    intent_id: "int-1",
    command: "echo hello",
    args_json: "[]",
    status: "running",
    phase: "running",
    confirmation_status: "unconfirmed",
    stdout: "",
    stderr: "",
    created_at: "2026-04-13T12:00:00Z",
  });

  const scopeApi: ObservationApiScope = {
    scope_id: "scope-a",
    coordinatorStore,
    outboundStore,
    intentStore,
    executionStore,
    workerRegistry,
    factStore,
  };

  const server = createObservationServer(
    { port: 0, verbose: false },
    new Map([["scope-a", scopeApi]]),
  );

  beforeAll(async () => {
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    db.close();
    factDb.close();
  });

  it("returns scopes list", async () => {
    const url = `${server.getUrl()}/scopes`;
    const body = (await httpGetJson(url)) as { scopes: Array<{ scope_id: string }> };
    expect(body.scopes).toHaveLength(1);
    expect(body.scopes[0].scope_id).toBe("scope-a");
  });

  it("returns full snapshot", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/snapshot`;
    const body = (await httpGetJson(url)) as { scope_id: string; snapshot: { workers: unknown[] } };
    expect(body.scope_id).toBe("scope-a");
    expect(body.snapshot.workers).toHaveLength(1);
  });

  it("returns recent facts", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/facts`;
    const body = (await httpGetJson(url)) as { scope_id: string; facts: Array<{ fact_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.facts.length).toBeGreaterThanOrEqual(1);
    expect(body.facts[0].fact_id).toBe("fact-1");
  });

  it("returns contexts", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/contexts`;
    const body = (await httpGetJson(url)) as { scope_id: string; contexts: Array<{ context_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.contexts.length).toBeGreaterThanOrEqual(1);
    expect(body.contexts[0].context_id).toBe("ctx-1");
  });

  it("returns active work items", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/work-items`;
    const body = (await httpGetJson(url)) as { scope_id: string; items: Array<{ work_item_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].work_item_id).toBe("wi-1");
  });

  it("returns intents by status", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/intents`;
    const body = (await httpGetJson(url)) as { scope_id: string; pending: Array<{ intent_id: string }>; total_count: number };
    expect(body.scope_id).toBe("scope-a");
    expect(body.pending.length).toBeGreaterThanOrEqual(1);
    expect(body.pending[0].intent_id).toBe("int-1");
  });

  it("returns executions", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/executions`;
    const body = (await httpGetJson(url)) as { scope_id: string; process_executions: { active: Array<{ execution_id: string }> } };
    expect(body.scope_id).toBe("scope-a");
    expect(body.process_executions.active.length).toBeGreaterThanOrEqual(1);
    expect(body.process_executions.active[0].execution_id).toBe("pe-1");
  });

  it("returns failures", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/failures`;
    const body = (await httpGetJson(url)) as { scope_id: string; work_items: unknown[]; process_executions: unknown[] };
    expect(body.scope_id).toBe("scope-a");
    // No failed data seeded, but endpoint should return empty arrays
    expect(Array.isArray(body.work_items)).toBe(true);
    expect(Array.isArray(body.process_executions)).toBe(true);
  });

  it("returns workers", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/workers`;
    const body = (await httpGetJson(url)) as { scope_id: string; workers: Array<{ worker_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0].worker_id).toBe("process_executor");
  });

  it("returns health", async () => {
    const url = `${server.getUrl()}/health`;
    const body = (await httpGetJson(url)) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("serves the UI shell at root", async () => {
    const url = `${server.getUrl()}/`;
    const html = await new Promise<string>((resolve, reject) => {
      get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });
    expect(html).toContain("Narada Operator Console");
    expect(html).toContain("Overview");
    expect(html).toContain("Facts");
    expect(html).toContain("Contexts");
    expect(html).toContain("Work");
    expect(html).toContain("Intents");
    expect(html).toContain("Executions");
    expect(html).toContain("Workers");
    expect(html).toContain("Failures");
  });

  it("returns 404 for unknown scope", async () => {
    const url = `${server.getUrl()}/scopes/unknown/snapshot`;
    const body = (await httpGetJson(url)) as { error: string };
    expect(body.error).toBe("Scope not found");
  });
});
