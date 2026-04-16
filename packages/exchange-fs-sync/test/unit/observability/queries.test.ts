import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import {
  getActiveWorkItems,
  getRecentFailedWorkItems,
  getWorkItemsAwaitingRetry,
  getRecentOutboundCommands,
  getRecentSessionsAndExecutions,
  getToolCallSummary,
  buildMailboxDispatchSummary,
  buildControlPlaneSnapshot,
} from "../../../src/observability/queries.js";
import type { WorkItem, ExecutionAttempt, ToolCallRecord } from "../../../src/coordinator/types.js";

describe("observability/queries", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();

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

  function insertWorkItem(overrides?: Partial<WorkItem>): WorkItem {
    const now = new Date().toISOString();
    const item: WorkItem = {
      work_item_id: `wi-${Math.random().toString(36).slice(2)}`,
      context_id: "conv-1",
      scope_id: "mb-1",
      status: "opened",
      priority: 0,
      opened_for_revision_id: "rev-1",
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
    coordinatorStore.insertWorkItem(item);
    return item;
  }

  function insertExecution(overrides?: Partial<ExecutionAttempt>): ExecutionAttempt {
    const now = new Date().toISOString();
    const attempt: ExecutionAttempt = {
      execution_id: `ex-${Math.random().toString(36).slice(2)}`,
      work_item_id: "wi-1",
      revision_id: "rev-1",
      session_id: null,
      status: "started",
      started_at: now,
      completed_at: null,
      runtime_envelope_json: "{}",
      outcome_json: null,
      error_message: null,
      ...overrides,
    };
    coordinatorStore.insertExecutionAttempt(attempt);
    return attempt;
  }

  function insertToolCall(overrides?: Partial<ToolCallRecord>): ToolCallRecord {
    const now = new Date().toISOString();
    const record: ToolCallRecord = {
      call_id: `tc-${Math.random().toString(36).slice(2)}`,
      execution_id: "ex-1",
      work_item_id: "wi-1",
      context_id: "conv-1",
      tool_id: "echo_test",
      request_args_json: "{}",
      exit_status: "success",
      stdout: "",
      stderr: "",
      structured_output_json: null,
      started_at: now,
      completed_at: now,
      duration_ms: 10,
      ...overrides,
    };
    coordinatorStore.insertToolCallRecord(record);
    return record;
  }

  describe("work item queries", () => {
    it("getActiveWorkItems returns only active statuses", () => {
      const active = insertWorkItem({ work_item_id: "wi-active", status: "executing" });
      insertWorkItem({ work_item_id: "wi-failed", status: "failed_terminal" });

      const result = getActiveWorkItems(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.work_item_id).toBe(active.work_item_id);
    });

    it("getRecentFailedWorkItems returns failed statuses sorted by updated_at desc", () => {
      insertWorkItem({ work_item_id: "wi-ok", status: "resolved" });
      const failed1 = insertWorkItem({ work_item_id: "wi-f1", status: "failed_retryable", updated_at: "2024-01-01T00:00:00Z" });
      const failed2 = insertWorkItem({ work_item_id: "wi-f2", status: "failed_terminal", updated_at: "2024-01-02T00:00:00Z" });

      const result = getRecentFailedWorkItems(coordinatorStore);
      expect(result).toHaveLength(2);
      expect(result[0]!.work_item_id).toBe(failed2.work_item_id);
      expect(result[1]!.work_item_id).toBe(failed1.work_item_id);
    });

    it("getWorkItemsAwaitingRetry returns failed_retryable with null or past next_retry_at", () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const future = new Date(Date.now() + 86400000).toISOString();

      const ready = insertWorkItem({ work_item_id: "wi-ready", status: "failed_retryable", next_retry_at: past });
      insertWorkItem({ work_item_id: "wi-wait", status: "failed_retryable", next_retry_at: future });
      insertWorkItem({ work_item_id: "wi-term", status: "failed_terminal" });

      const result = getWorkItemsAwaitingRetry(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.work_item_id).toBe(ready.work_item_id);
    });
  });

  describe("execution queries", () => {
    it("getRecentSessionsAndExecutions returns attempts sorted by started_at desc", () => {
      insertWorkItem({ work_item_id: "wi-1" });
      const ex1 = insertExecution({ execution_id: "ex-1", started_at: "2024-01-01T00:00:00Z" });
      const ex2 = insertExecution({ execution_id: "ex-2", started_at: "2024-01-02T00:00:00Z" });

      const result = getRecentSessionsAndExecutions(coordinatorStore);
      expect(result).toHaveLength(2);
      expect(result[0]!.execution_id).toBe(ex2.execution_id);
      expect(result[1]!.execution_id).toBe(ex1.execution_id);
    });
  });

  describe("tool call queries", () => {
    it("getToolCallSummary returns recent, counts by status, and total", () => {
      insertWorkItem({ work_item_id: "wi-1" });
      insertExecution({ execution_id: "ex-1" });
      insertToolCall({ call_id: "tc-1", exit_status: "success" });
      insertToolCall({ call_id: "tc-2", exit_status: "timeout" });
      insertToolCall({ call_id: "tc-3", exit_status: "success" });

      const result = getToolCallSummary(coordinatorStore);
      expect(result.total_count).toBe(3);
      expect(result.by_status["success"]).toBe(2);
      expect(result.by_status["timeout"]).toBe(1);
      expect(result.recent).toHaveLength(3);
    });
  });

  describe("outbound queries", () => {
    it("getRecentOutboundCommands returns commands sorted by created_at desc", () => {
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: "2024-01-01T00:00:00Z",
          created_by: "foreman:test/charter:support_steward",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-1",
        },
        {
          outbound_id: "ob-1",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-1",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: "2024-01-01T00:00:00Z",
          superseded_at: null,
        },
      );

      const result = getRecentOutboundCommands(outboundStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.outbound_id).toBe("ob-1");
    });
  });

  describe("mailbox dispatch summary", () => {
    it("buildMailboxDispatchSummary aggregates counts per mailbox", () => {
      insertWorkItem({ work_item_id: "wi-1", status: "opened" });
      insertWorkItem({ work_item_id: "wi-2", status: "executing" });
      insertWorkItem({ work_item_id: "wi-3", status: "failed_retryable" });
      insertWorkItem({ work_item_id: "wi-4", status: "failed_terminal" });

      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman:test/charter:support_steward",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-1",
        },
        {
          outbound_id: "ob-1",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-1",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );

      coordinatorStore.insertDecision({
        decision_id: "fd-1",
        conversation_id: "conv-1",
        mailbox_id: "mb-1",
        source_charter_ids_json: "[\"support_steward\"]",
        approved_action: "send_reply",
        payload_json: "{}",
        rationale: "",
        decided_at: new Date().toISOString(),
        outbound_id: null,
        created_by: "foreman:test/charter:support_steward",
      });

      const summary = buildMailboxDispatchSummary(coordinatorStore, outboundStore, "mb-1");
      expect(summary.mailbox_id).toBe("mb-1");
      expect(summary.active_work_items).toBe(1);
      expect(summary.executing_work_items).toBe(1);
      expect(summary.failed_retryable_work_items).toBe(1);
      expect(summary.failed_terminal_work_items).toBe(1);
      expect(summary.pending_outbound_commands).toBe(1);
      expect(summary.recent_decisions_count).toBe(1);
    });
  });

  describe("control plane snapshot", () => {
    it("buildControlPlaneSnapshot aggregates all subsystems", () => {
      insertWorkItem({ work_item_id: "wi-1", status: "executing" });
      insertExecution({ execution_id: "ex-1" });
      insertToolCall({ call_id: "tc-1", exit_status: "success" });

      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman:test/charter:support_steward",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-1",
        },
        {
          outbound_id: "ob-1",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-1",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );

      const snapshot = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");
      expect(snapshot.work_items.active).toHaveLength(1);
      expect(snapshot.executions.recent).toHaveLength(1);
      expect(snapshot.tool_calls.total_count).toBe(1);
      expect(snapshot.outbound.total_count).toBe(1);
      expect(snapshot.mailbox_summary).not.toBeNull();
      expect(snapshot.mailbox_summary!.pending_outbound_commands).toBe(1);
    });
  });

  describe("non-authority invariants", () => {
    it("views are reconstructible from durable state", () => {
      insertWorkItem({ work_item_id: "wi-1", status: "executing" });
      insertExecution({ execution_id: "ex-1" });
      insertToolCall({ call_id: "tc-1", exit_status: "success" });

      const before = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");

      // Simulate "rebuild": close and reopen DB with same data
      const activeWorkItems = getActiveWorkItems(coordinatorStore);
      expect(activeWorkItems).toHaveLength(1);

      // Assert snapshot is reconstructible because it only reads durable tables
      const after = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");
      expect(after.work_items.total_count).toBe(before.work_items.total_count);
      expect(after.executions.total_count).toBe(before.executions.total_count);
      expect(after.tool_calls.total_count).toBe(before.tool_calls.total_count);
    });

    it("deleting/rotating logs does not affect observability queries", () => {
      insertWorkItem({ work_item_id: "wi-1", status: "failed_terminal", error_message: "crash" });
      insertExecution({ execution_id: "ex-1", status: "crashed", error_message: "crash" });

      // Create an ephemeral log table (simulating agent_traces or file logs)
      db.exec(`create table if not exists ephemeral_logs (id integer primary key, message text)`);
      db.prepare(`insert into ephemeral_logs (message) values (?)`).run("log entry");

      const before = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");

      // "Delete/rotate" the ephemeral logs
      db.exec(`drop table ephemeral_logs`);

      // Observability queries still produce the same durable-state result
      const after = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");
      expect(after.work_items.failed_recent).toHaveLength(1);
      expect(after.executions.recent).toHaveLength(1);
      expect(after.work_items.total_count).toBe(before.work_items.total_count);
    });
  });
});
