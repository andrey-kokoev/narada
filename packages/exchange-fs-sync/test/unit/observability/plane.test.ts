import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { DefaultWorkerRegistry, ObservationPlane } from "../../../src/index.js";
import type { WorkerIdentity } from "../../../src/workers/types.js";

describe("observation plane", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let executionStore: SqliteProcessExecutionStore;
  let registry: DefaultWorkerRegistry;
  let plane: ObservationPlane;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    executionStore = new SqliteProcessExecutionStore({ db });

    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();
    executionStore.initSchema();

    registry = new DefaultWorkerRegistry();
    plane = new ObservationPlane({
      registry,
      coordinatorStore,
      outboundStore,
      intentStore,
      executionStore,
    });

    // Seed conversation record for FK compliance
    coordinatorStore.upsertConversationRecord({
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      primary_charter: "support_steward",
      secondary_charters_json: "[]",
      status: "active",
      assigned_agent: null,
      last_message_at: new Date().toISOString(),
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  function registerWorker(identity: WorkerIdentity): void {
    registry.register({
      identity,
      fn: async () => ({ processed: false }),
    });
  }

  function insertWorkItem(status: string): void {
    const now = new Date().toISOString();
    coordinatorStore.insertWorkItem({
      work_item_id: `wi-${Math.random().toString(36).slice(2)}`,
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      status: status as any,
      priority: 0,
      opened_for_revision_id: "rev-1",
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  function insertIntent(overrides?: Partial<{ intent_id: string; status: string; executor_family: string }>): void {
    intentStore.admit({
      intent_id: overrides?.intent_id ?? `int-${Math.random().toString(36).slice(2)}`,
      intent_type: "process.run",
      executor_family: overrides?.executor_family ?? "process",
      payload_json: "{}",
      idempotency_key: `key-${Math.random().toString(36).slice(2)}`,
      status: (overrides?.status as any) ?? "admitted",
      context_id: "ctx-1",
      target_id: null,
      terminal_reason: null,
    });
  }

  function insertProcessExecution(status: string): void {
    executionStore.create({
      execution_id: `pe-${Math.random().toString(36).slice(2)}`,
      intent_id: "int-1",
      command: "echo",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: status as any,
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: status === "running" ? new Date().toISOString() : null,
      completed_at: status === "failed" ? new Date().toISOString() : null,
      lease_expires_at: null,
      lease_runner_id: null,
    });
  }

  describe("worker observations", () => {
    it("shows registered workers with durable-state activity", () => {
      registerWorker({
        worker_id: "process_executor",
        executor_family: "process",
        concurrency_policy: "singleton",
        description: "Process runner",
      });
      insertProcessExecution("running");
      insertIntent({ status: "admitted", executor_family: "process" });

      const snapshot = plane.snapshot();
      expect(snapshot.workers).toHaveLength(1);
      const w = snapshot.workers[0]!;
      expect(w.worker_id).toBe("process_executor");
      expect(w.registered).toBe(true);
      expect(w.has_active_work).toBe(true);
      expect(w.pending_count).toBe(1);
    });

    it("shows control-plane worker activity when work items are active", () => {
      registerWorker({
        worker_id: "mailbox_worker",
        executor_family: "mail",
        concurrency_policy: "singleton",
      });
      insertWorkItem("executing");

      const snapshot = plane.snapshot();
      const w = snapshot.workers[0]!;
      expect(w.has_active_work).toBe(true);
    });

    it("shows zero pending when no intents exist", () => {
      registerWorker({
        worker_id: "process_executor",
        executor_family: "process",
        concurrency_policy: "singleton",
      });

      const snapshot = plane.snapshot();
      const w = snapshot.workers[0]!;
      expect(w.pending_count).toBe(0);
      expect(w.has_active_work).toBe(false);
    });
  });

  describe("process execution observations", () => {
    it("surfaces active, recent, and failed process executions", () => {
      insertProcessExecution("running");
      insertProcessExecution("completed");
      insertProcessExecution("failed");

      const snapshot = plane.snapshot();
      expect(snapshot.process_executions.active).toHaveLength(1);
      expect(snapshot.process_executions.recent).toHaveLength(2);
      expect(snapshot.process_executions.failed_recent).toHaveLength(1);
      expect(snapshot.process_executions.total_count).toBe(3);
    });
  });

  describe("intent observations", () => {
    it("surfaces pending, executing, and failed terminal intents", () => {
      insertIntent({ intent_id: "int-pending", status: "admitted" });
      insertIntent({ intent_id: "int-exec", status: "executing" });
      insertIntent({ intent_id: "int-fail", status: "failed_terminal" });

      const snapshot = plane.snapshot();
      expect(snapshot.intents.pending).toHaveLength(1);
      expect(snapshot.intents.executing).toHaveLength(1);
      expect(snapshot.intents.failed_terminal).toHaveLength(1);
      expect(snapshot.intents.total_count).toBe(3);
    });
  });

  describe("reconstructibility invariants", () => {
    it("observation plane snapshot is reconstructible from durable state", () => {
      registerWorker({ worker_id: "process_executor", executor_family: "process", concurrency_policy: "singleton" });
      insertWorkItem("executing");
      insertIntent({ status: "executing" });
      insertProcessExecution("running");

      const before = plane.snapshot();

      // Reconstruct: the same durable state should yield the same snapshot shape
      const after = plane.snapshot();
      expect(after.workers).toHaveLength(before.workers.length);
      expect(after.control_plane.work_items.total_count).toBe(before.control_plane.work_items.total_count);
      expect(after.process_executions.total_count).toBe(before.process_executions.total_count);
      expect(after.intents.total_count).toBe(before.intents.total_count);
    });

    it("rotating logs does not affect observation plane correctness", () => {
      registerWorker({ worker_id: "process_executor", executor_family: "process", concurrency_policy: "singleton" });
      insertWorkItem("failed_terminal");
      insertIntent({ status: "failed_terminal" });
      insertProcessExecution("failed");

      // Create ephemeral log table
      db.exec(`create table ephemeral_logs (id integer primary key, message text)`);
      db.prepare(`insert into ephemeral_logs values (?, ?)`).run(1, "log entry");

      const before = plane.snapshot();

      // Rotate logs by dropping the ephemeral table
      db.exec(`drop table ephemeral_logs`);

      const after = plane.snapshot();
      expect(after.control_plane.work_items.failed_recent).toHaveLength(1);
      expect(after.intents.failed_terminal).toHaveLength(1);
      expect(after.process_executions.failed_recent).toHaveLength(1);
      expect(after.workers[0]!.registered).toBe(true);
    });
  });
});
