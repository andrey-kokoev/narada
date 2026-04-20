import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { get, request as httpRequest } from "node:http";
import Database from "better-sqlite3";
import {
  SqliteCoordinatorStore,
  SqliteOutboundStore,
  SqliteIntentStore,
  SqliteProcessExecutionStore,
  SqliteFactStore,
  DefaultWorkerRegistry,
} from "@narada2/control-plane";
import { createObservationServer, type ObservationApiScope } from "../../src/observation/observation-server.js";

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

async function httpPostJson(url: string, body: unknown): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function httpRequestJson(url: string, method: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method, headers: { "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data });
          }
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
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
  coordinatorStore.upsertContextRecord({
    context_id: "ctx-1",
    scope_id: "scope-a",
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
    preferred_session_id: null,
    preferred_agent_id: null,
    affinity_group_id: null,
    affinity_strength: 0,
    affinity_expires_at: null,
    affinity_reason: null,
  });

  coordinatorStore.insertWorkItem({
    work_item_id: "wi-failed",
    context_id: "ctx-1",
    scope_id: "scope-a",
    status: "failed_retryable",
    priority: 1,
    opened_for_revision_id: "rev-1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: "Test failure",
    retry_count: 2,
    next_retry_at: "2099-01-01T00:00:00Z",
    context_json: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
    preferred_session_id: null,
    preferred_agent_id: null,
    affinity_group_id: null,
    affinity_strength: 0,
    affinity_expires_at: null,
    affinity_reason: null,
  });

  coordinatorStore.insertWorkItem({
    work_item_id: "wi-failed-2",
    context_id: "ctx-1",
    scope_id: "scope-a",
    status: "failed_retryable",
    priority: 1,
    opened_for_revision_id: "rev-1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: "Another test failure",
    retry_count: 1,
    next_retry_at: "2099-01-02T00:00:00Z",
    context_json: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
    preferred_session_id: null,
    preferred_agent_id: null,
    affinity_group_id: null,
    affinity_strength: 0,
    affinity_expires_at: null,
    affinity_reason: null,
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

  // Seed lease data for Task 077
  db.prepare(`
    insert into work_item_leases (lease_id, work_item_id, runner_id, acquired_at, expires_at, released_at, release_reason)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run("lease-1", "wi-1", "runner-a", "2026-04-13T12:00:00Z", "2099-01-01T00:00:00Z", null, null);

  db.prepare(`
    insert into work_item_leases (lease_id, work_item_id, runner_id, acquired_at, expires_at, released_at, release_reason)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run("lease-stale", "wi-failed", "runner-b", "2026-04-13T11:00:00Z", "2026-04-13T11:05:00Z", "2026-04-13T11:10:00Z", "abandoned");

  // Task 084 — Non-mail vertical fixtures via neutral context adapter (no mailbox-shaped seeding)
  coordinatorStore.upsertContextRecord({
    context_id: "timer:job-1",
    scope_id: "scope-a",
    primary_charter: "timer_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
  });
  coordinatorStore.recordContextRevision("timer:job-1", 1, "fact-timer-1");

  coordinatorStore.insertWorkItem({
    work_item_id: "wi-timer-1",
    context_id: "timer:job-1",
    scope_id: "scope-a",
    status: "opened",
    priority: 1,
    opened_for_revision_id: "rev-timer-1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
    context_json: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
    preferred_session_id: null,
    preferred_agent_id: null,
    affinity_group_id: null,
    affinity_strength: 0,
    affinity_expires_at: null,
    affinity_reason: null,
  });

  coordinatorStore.upsertContextRecord({
    context_id: "filesystem:scan-1",
    scope_id: "scope-a",
    primary_charter: "fs_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
  });
  coordinatorStore.recordContextRevision("filesystem:scan-1", 1, "fact-fs-1");

  coordinatorStore.insertWorkItem({
    work_item_id: "wi-fs-1",
    context_id: "filesystem:scan-1",
    scope_id: "scope-a",
    status: "opened",
    priority: 1,
    opened_for_revision_id: "rev-fs-1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
    context_json: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
    preferred_session_id: null,
    preferred_agent_id: null,
    affinity_group_id: null,
    affinity_strength: 0,
    affinity_expires_at: null,
    affinity_reason: null,
  });

  coordinatorStore.upsertContextRecord({
    context_id: "webhook:evt-1",
    scope_id: "scope-a",
    primary_charter: "webhook_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
  });
  coordinatorStore.recordContextRevision("webhook:evt-1", 1, "fact-webhook-1");

  coordinatorStore.insertWorkItem({
    work_item_id: "wi-wh-1",
    context_id: "webhook:evt-1",
    scope_id: "scope-a",
    status: "opened",
    priority: 1,
    opened_for_revision_id: "rev-wh-1",
    resolved_revision_id: null,
    resolution_outcome: null,
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
    context_json: null,
    created_at: "2026-04-13T12:00:00Z",
    updated_at: "2026-04-13T12:00:00Z",
    preferred_session_id: null,
    preferred_agent_id: null,
    affinity_group_id: null,
    affinity_strength: 0,
    affinity_expires_at: null,
    affinity_reason: null,
  });

  factStore.ingest({
    fact_id: "fact-timer-1",
    fact_type: "timer.tick",
    provenance: {
      source_id: "timer",
      source_record_id: "tick-1",
      observed_at: "2026-04-13T12:00:00Z",
    },
    payload_json: "{}",
  });

  factStore.ingest({
    fact_id: "fact-fs-1",
    fact_type: "filesystem.change",
    provenance: {
      source_id: "filesystem",
      source_record_id: "chg-1",
      observed_at: "2026-04-13T12:00:00Z",
    },
    payload_json: "{}",
  });

  factStore.ingest({
    fact_id: "fact-webhook-1",
    fact_type: "webhook.received",
    provenance: {
      source_id: "webhook",
      source_record_id: "wh-1",
      observed_at: "2026-04-13T12:00:00Z",
    },
    payload_json: "{}",
  });

  intentStore.admit({
    intent_id: "int-timer-1",
    intent_type: "process.run",
    executor_family: "process",
    payload_json: JSON.stringify({ command: "echo timer" }),
    idempotency_key: "ik-timer-1",
    status: "admitted",
    context_id: "timer:job-1",
    target_id: null,
    terminal_reason: null,
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

  const scopeApiB: ObservationApiScope = {
    scope_id: "scope-b",
    coordinatorStore,
    outboundStore,
    intentStore,
    executionStore,
    workerRegistry,
    factStore,
  };

  const server = createObservationServer(
    { port: 0, verbose: false },
    new Map([
      ["scope-a", scopeApi],
      ["scope-b", scopeApiB],
    ]),
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
    expect(body.scopes).toHaveLength(2);
    expect(body.scopes.map(s => s.scope_id).sort()).toEqual(["scope-a", "scope-b"]);
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
    expect(body.facts.map(f => f.fact_id)).toContain("fact-1");
  });

  it("returns contexts", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/contexts`;
    const body = (await httpGetJson(url)) as { scope_id: string; contexts: Array<{ context_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.contexts.length).toBeGreaterThanOrEqual(1);
    expect(body.contexts.map(c => c.context_id)).toContain("ctx-1");
  });

  it("returns active work items", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/work-items`;
    const body = (await httpGetJson(url)) as { scope_id: string; items: Array<{ work_item_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.map(i => i.work_item_id)).toContain("wi-1");
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

  it("returns intent executions", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/intent-executions`;
    const body = (await httpGetJson(url)) as { scope_id: string; recent: Array<{ intent_id: string }>; total_count: number };
    expect(body.scope_id).toBe("scope-a");
    expect(Array.isArray(body.recent)).toBe(true);
    expect(typeof body.total_count).toBe("number");
  });

  it("returns intent lifecycle transitions", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/intents/int-1/lifecycle`;
    const body = (await httpGetJson(url)) as { scope_id: string; intent_id: string; transitions: unknown[] };
    expect(body.scope_id).toBe("scope-a");
    expect(body.intent_id).toBe("int-1");
    expect(Array.isArray(body.transitions)).toBe(true);
  });

  it("returns process execution details", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/process-executions`;
    const body = (await httpGetJson(url)) as { scope_id: string; executions: Array<{ execution_id: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(Array.isArray(body.executions)).toBe(true);
    expect(body.executions.length).toBeGreaterThanOrEqual(1);
    expect(body.executions[0].execution_id).toBe("pe-1");
  });

  it("returns mail execution details", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/mail-executions`;
    const body = (await httpGetJson(url)) as { scope_id: string; executions: unknown[] };
    expect(body.scope_id).toBe("scope-a");
    expect(Array.isArray(body.executions)).toBe(true);
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

  it("returns unified timeline", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/timeline`;
    const body = (await httpGetJson(url)) as { scope_id: string; events: unknown[] };
    expect(body.scope_id).toBe("scope-a");
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThanOrEqual(1);
  });

  it("returns fact timeline", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/facts/fact-1/timeline`;
    const body = (await httpGetJson(url)) as { scope_id: string; fact_id: string; timeline: { fact: { fact_id: string } | null } };
    expect(body.scope_id).toBe("scope-a");
    expect(body.fact_id).toBe("fact-1");
    expect(body.timeline.fact?.fact_id).toBe("fact-1");
  });

  it("returns context timeline", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/contexts/ctx-1/timeline`;
    const body = (await httpGetJson(url)) as { scope_id: string; context_id: string; timeline: { context: { context_id: string } | null } };
    expect(body.scope_id).toBe("scope-a");
    expect(body.context_id).toBe("ctx-1");
    expect(body.timeline.context?.context_id).toBe("ctx-1");
  });

  it("returns work item timeline", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/work-items/wi-1/timeline`;
    const body = (await httpGetJson(url)) as { scope_id: string; work_item_id: string; timeline: { work_item: { work_item_id: string } | null } };
    expect(body.scope_id).toBe("scope-a");
    expect(body.work_item_id).toBe("wi-1");
    expect(body.timeline.work_item?.work_item_id).toBe("wi-1");
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
    expect(html).toContain("Timeline");
    expect(html).toContain("Facts");
    expect(html).toContain("Contexts");
    expect(html).toContain("Work");
    expect(html).toContain("Intents");
    expect(html).toContain("Executions");
    expect(html).toContain("Workers");
    expect(html).toContain("Failures");
    expect(html).toContain("Verticals");
    expect(html).toContain("Timer");
    expect(html).toContain("Filesystem");
    expect(html).toContain("Webhook");
  });

  it("returns 404 for unknown scope", async () => {
    const url = `${server.getUrl()}/scopes/unknown/snapshot`;
    const body = (await httpGetJson(url)) as { error: string };
    expect(body.error).toBe("Scope not found");
  });

  it("observation namespace no longer hosts actions", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/actions`;
    const { status } = await httpPostJson(url, { action_type: "retry_work_item", target_id: "wi-failed" });
    expect(status).toBe(405);
  });

  it("executes retry_work_item action via control namespace", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "retry_work_item", target_id: "wi-failed" });
    expect(status).toBe(200);
    expect((data as { success: boolean }).success).toBe(true);

    const item = coordinatorStore.getWorkItem("wi-failed");
    expect(item?.status).toBe("failed_retryable");
    expect(item?.next_retry_at).toBeNull();
  });

  it("executes retry_failed_work_items action via control namespace", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "retry_failed_work_items" });
    expect(status).toBe(200);
    expect((data as { success: boolean }).success).toBe(true);

    const item1 = coordinatorStore.getWorkItem("wi-failed");
    const item2 = coordinatorStore.getWorkItem("wi-failed-2");
    expect(item1?.status).toBe("failed_retryable");
    expect(item2?.status).toBe("failed_retryable");
    expect(item1?.next_retry_at).toBeNull();
    expect(item2?.next_retry_at).toBeNull();
  });

  it("executes acknowledge_alert action", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "acknowledge_alert", target_id: "wi-failed" });
    expect(status).toBe(200);
    expect((data as { success: boolean }).success).toBe(true);

    const item = coordinatorStore.getWorkItem("wi-failed");
    expect(item?.status).toBe("failed_terminal");
    expect(item?.error_message).toContain("acknowledged by operator");
  });

  it("rejects action for unknown work item", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "retry_work_item", target_id: "no-such-item" });
    expect(status).toBe(422);
    expect((data as { success: boolean }).success).toBe(false);
  });

  // Task 077 — Lease, quiescence, and backlog operability
  it("returns active leases", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/leases`;
    const body = (await httpGetJson(url)) as { scope_id: string; leases: Array<{ lease_id: string; work_item_status: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.leases).toHaveLength(1);
    expect(body.leases[0].lease_id).toBe("lease-1");
    expect(body.leases[0].work_item_status).toBe("opened");
  });

  it("returns recent stale lease recoveries", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/lease-recoveries`;
    const body = (await httpGetJson(url)) as { scope_id: string; recoveries: Array<{ lease_id: string; reason: string }> };
    expect(body.scope_id).toBe("scope-a");
    expect(body.recoveries).toHaveLength(1);
    expect(body.recoveries[0].lease_id).toBe("lease-stale");
    expect(body.recoveries[0].reason).toBe("abandoned");
  });

  it("returns quiescence indicator", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/quiescence`;
    const body = (await httpGetJson(url)) as {
      scope_id: string;
      indicator: {
        opened_count: number;
        leased_count: number;
        stale_lease_count: number;
        is_quiescent: boolean;
        has_stale_leases: boolean;
        oldest_lease_acquired_at: string | null;
      };
    };
    expect(body.scope_id).toBe("scope-a");
    expect(body.indicator.opened_count).toBe(4);
    expect(body.indicator.leased_count).toBe(0);
    expect(body.indicator.stale_lease_count).toBe(0);
    expect(body.indicator.is_quiescent).toBe(false);
    expect(body.indicator.has_stale_leases).toBe(false);
  });

  it("returns 404 for leases on unknown scope", async () => {
    const url = `${server.getUrl()}/scopes/unknown/leases`;
    const { status, data } = await httpRequestJson(url, "GET");
    expect(status).toBe(404);
    expect((data as { error: string }).error).toBe("Scope not found");
  });

  it("returns 404 for quiescence on unknown scope", async () => {
    const url = `${server.getUrl()}/scopes/unknown/quiescence`;
    const { status, data } = await httpRequestJson(url, "GET");
    expect(status).toBe(404);
    expect((data as { error: string }).error).toBe("Scope not found");
  });

  // Task 078 — Scope and vertical overview surface
  it("returns scope overview", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/overview`;
    const body = (await httpGetJson(url)) as {
      scope_id: string;
      overview: {
        scopes: Array<{ scope_id: string; active_verticals: string[] }>;
        global: { total_work_items: number };
        recent_failures: unknown[];
      };
    };
    expect(body.scope_id).toBe("scope-a");
    expect(body.overview.scopes.length).toBeGreaterThanOrEqual(1);
    const scope = body.overview.scopes.find(s => s.scope_id === "scope-a");
    expect(scope).toBeDefined();
    expect(body.overview.global.total_work_items).toBeGreaterThanOrEqual(2);
  });

  it("returns 404 for overview on unknown scope", async () => {
    const url = `${server.getUrl()}/scopes/unknown/overview`;
    const { status, data } = await httpRequestJson(url, "GET");
    expect(status).toBe(404);
    expect((data as { error: string }).error).toBe("Scope not found");
  });

  it("returns 404 for actions on unknown scope", async () => {
    const url = `${server.getUrl()}/control/scopes/unknown/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "retry_work_item", target_id: "wi-failed" });
    expect(status).toBe(404);
    expect((data as { error: string }).error).toBe("Scope not found");
  });

  // Task 081 — Non-mail vertical fixtures render correctly
  it("returns non-mail facts", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/facts`;
    const body = (await httpGetJson(url)) as { scope_id: string; facts: Array<{ fact_id: string; fact_type: string }> };
    const types = body.facts.map(f => f.fact_type);
    expect(types).toContain("timer.tick");
    expect(types).toContain("filesystem.change");
    expect(types).toContain("webhook.received");
  });

  it("returns non-mail contexts", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/contexts`;
    const body = (await httpGetJson(url)) as { scope_id: string; contexts: Array<{ context_id: string }> };
    const ids = body.contexts.map(c => c.context_id);
    expect(ids).toContain("timer:job-1");
    expect(ids).toContain("filesystem:scan-1");
    expect(ids).toContain("webhook:evt-1");
  });

  it("returns non-mail work items", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/work-items`;
    const body = (await httpGetJson(url)) as { scope_id: string; items: Array<{ work_item_id: string; context_id: string }> };
    const ids = body.items.map(i => i.work_item_id);
    expect(ids).toContain("wi-timer-1");
    expect(ids).toContain("wi-fs-1");
    expect(ids).toContain("wi-wh-1");
  });

  it("includes non-mail events in unified timeline", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/timeline`;
    const body = (await httpGetJson(url)) as { scope_id: string; events: Array<{ context_id?: string; fact_id?: string }> };
    const contextIds = body.events.map(e => e.context_id).filter(Boolean);
    const factIds = body.events.map(e => e.fact_id).filter(Boolean);
    expect(contextIds).toContain("timer:job-1");
    expect(factIds).toContain("fact-fs-1");
  });

  it("neutral context adapter stores and retrieves non-mail contexts", async () => {
    const record = coordinatorStore.getContextRecord("timer:job-1");
    expect(record).toBeDefined();
    expect(record!.context_id).toBe("timer:job-1");
    expect(record!.scope_id).toBe("scope-a");
  });

  it("context timeline includes non-mail revisions from neutral adapter", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/contexts/timer%3Ajob-1/timeline`;
    const body = (await httpGetJson(url)) as {
      scope_id: string;
      context_id: string;
      timeline: { revisions: Array<{ ordinal: number; trigger_event_id: string | null }> };
    };
    expect(body.scope_id).toBe("scope-a");
    expect(body.context_id).toBe("timer:job-1");
    expect(body.timeline.revisions.length).toBeGreaterThanOrEqual(1);
    expect(body.timeline.revisions[0].trigger_event_id).toBe("fact-timer-1");
  });

  it("shows non-mail verticals in overview", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/overview`;
    const body = (await httpGetJson(url)) as {
      scope_id: string;
      overview: {
        scopes: Array<{ scope_id: string; active_verticals: string[] }>;
        facts: { by_vertical: Record<string, number> };
      };
    };
    const scope = body.overview.scopes.find(s => s.scope_id === "scope-a");
    expect(scope).toBeDefined();
    expect(scope!.active_verticals).toContain("timer");
    expect(scope!.active_verticals).toContain("filesystem");
    expect(scope!.active_verticals).toContain("webhook");
    expect(body.overview.facts.by_vertical).toHaveProperty("timer");
    expect(body.overview.facts.by_vertical).toHaveProperty("filesystem");
    expect(body.overview.facts.by_vertical).toHaveProperty("webhook");
  });

  it("shows non-mail intents", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/intents`;
    const body = (await httpGetJson(url)) as { scope_id: string; pending: Array<{ intent_id: string; context_id: string }>; total_count: number };
    const ids = body.pending.map(i => i.intent_id);
    expect(ids).toContain("int-timer-1");
    expect(body.pending.some(i => i.context_id === "timer:job-1")).toBe(true);
  });

  it("mailbox view excludes non-mail contexts", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/mailbox`;
    const body = (await httpGetJson(url)) as { scope_id: string; view: { conversations: Array<{ context_id: string }> } };
    const ids = body.view.conversations.map(c => c.context_id);
    expect(ids).toContain("ctx-1");
    expect(ids).not.toContain("timer:job-1");
    expect(ids).not.toContain("filesystem:scan-1");
    expect(ids).not.toContain("webhook:evt-1");
  });

  it("generic pages remain useful for scope with zero mailbox data", async () => {
    const facts = (await httpGetJson(`${server.getUrl()}/scopes/scope-b/facts`)) as { scope_id: string; facts: Array<{ fact_id: string }> };
    expect(facts.scope_id).toBe("scope-b");
    expect(facts.facts.length).toBeGreaterThan(0);

    const contexts = (await httpGetJson(`${server.getUrl()}/scopes/scope-b/contexts`)) as { scope_id: string; contexts: Array<{ context_id: string }> };
    expect(contexts.scope_id).toBe("scope-b");
    expect(contexts.contexts.length).toBeGreaterThan(0);

    const work = (await httpGetJson(`${server.getUrl()}/scopes/scope-b/work-items`)) as { scope_id: string; items: Array<{ work_item_id: string }> };
    expect(work.scope_id).toBe("scope-b");
    expect(work.items.length).toBeGreaterThan(0);
  });

  it("mailbox view is empty for scope with zero mailbox data", async () => {
    const url = `${server.getUrl()}/scopes/scope-b/mailbox`;
    const body = (await httpGetJson(url)) as { scope_id: string; view: { conversations: unknown[] } };
    expect(body.scope_id).toBe("scope-b");
    expect(body.view.conversations).toHaveLength(0);
  });

  it("rejects rebuild_views when callback unavailable", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "rebuild_views" });
    expect(status).toBe(422);
    expect((data as { success: boolean }).success).toBe(false);
    expect((data as { reason?: string }).reason).toContain("not available");
  });

  it("rejects request_redispatch when callback unavailable", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "request_redispatch" });
    expect(status).toBe(422);
    expect((data as { success: boolean }).success).toBe(false);
    expect((data as { reason?: string }).reason).toContain("not available");
  });

  // Task 073 — UI authority guardrails
  it("rejects DELETE, PUT, and PATCH with 405", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/snapshot`;
    for (const method of ["DELETE", "PUT", "PATCH"]) {
      const { status, data } = await httpRequestJson(url, method);
      expect(status).toBe(405);
      expect((data as { error: string }).error).toBe("Method not allowed");
    }
  });

  it("rejects POST to unknown observation paths with 405", async () => {
    const url = `${server.getUrl()}/scopes/scope-a/nonexistent`;
    const { status } = await httpPostJson(url, { action_type: "retry_work_item" });
    expect(status).toBe(405);
  });

  it("rejects POST to unknown non-observation paths with 404", async () => {
    const url = `${server.getUrl()}/unknown/path`;
    const { status } = await httpPostJson(url, { action_type: "retry_work_item" });
    expect(status).toBe(404);
  });

  it("rejects unknown action types", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "inject_decision", target_id: "wi-1" });
    expect(status).toBe(422);
    expect((data as { success: boolean }).success).toBe(false);
    expect((data as { reason?: string }).reason).toContain("Unknown action type");
  });

  it("does not allow direct work item creation via actions", async () => {
    const beforeCount = coordinatorStore.db.prepare("select count(*) as c from work_items").get() as { c: number };
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { action_type: "create_work_item", target_id: "new-wi" });
    expect(status).toBe(422);
    expect((data as { success: boolean }).success).toBe(false);
    const afterCount = coordinatorStore.db.prepare("select count(*) as c from work_items").get() as { c: number };
    expect(afterCount.c).toBe(beforeCount.c);
  });

  // Task 080 — Authority guardrails and regression tests
  it("rejects malformed JSON to actions", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpRequestJson(url, "POST", "not-json");
    expect(status).toBe(400);
    expect((data as { error: string }).error).toBe("Invalid JSON");
  });

  it("rejects actions missing action_type", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    const { status, data } = await httpPostJson(url, { target_id: "wi-1" });
    expect(status).toBe(400);
    expect((data as { error: string }).error).toBe("Missing or invalid action_type");
  });

  it("rejects POST to observation endpoints with 405", async () => {
    const endpoints = [
      "/scopes/scope-a/snapshot",
      "/scopes/scope-a/overview",
      "/scopes/scope-a/leases",
      "/scopes/scope-a/quiescence",
      "/scopes/scope-a/work-items",
    ];
    for (const path of endpoints) {
      const url = `${server.getUrl()}${path}`;
      const { status } = await httpPostJson(url, { action_type: "retry_work_item" });
      expect(status).toBe(405);
    }
  });

  it("rejects PUT and PATCH to actions endpoint", async () => {
    const url = `${server.getUrl()}/control/scopes/scope-a/actions`;
    for (const method of ["PUT", "PATCH"]) {
      const { status, data } = await httpRequestJson(url, method);
      expect(status).toBe(405);
      expect((data as { error: string }).error).toBe("Method not allowed");
    }
  });
});
