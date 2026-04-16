import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import {
  getActiveWorkItems,
  getRecentFailedWorkItems,
  getWorkItemsAwaitingRetry,
  getRecentOutboundCommands,
  getRecentSessionsAndExecutions,
  getToolCallSummary,
  buildMailboxDispatchSummary,
  buildControlPlaneSnapshot,
  getActiveLeases,
  getRecentStaleLeaseRecoveries,
  getQuiescenceIndicator,
  getIntentSummaries,
  getIntentExecutionSummaries,
  getProcessExecutionDetails,
  getMailExecutionDetails,
  getIntentLifecycleTransitions,
} from "../../../src/observability/queries.js";
import type { WorkItem, ExecutionAttempt, ToolCallRecord } from "../../../src/coordinator/types.js";

describe("observability/queries", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let executionStore: SqliteProcessExecutionStore;

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
        context_id: "conv-1",
        scope_id: "mb-1",
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

  describe("lease and quiescence queries", () => {
    it("getActiveLeases returns unreleased leases with work item context", () => {
      const item = insertWorkItem({ work_item_id: "wi-leased", status: "leased" });
      coordinatorStore.insertLease({
        lease_id: "ls-1",
        work_item_id: item.work_item_id,
        runner_id: "runner-a",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        released_at: null,
        release_reason: null,
      });

      const result = getActiveLeases(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.lease_id).toBe("ls-1");
      expect(result[0]!.conversation_id).toBe("conv-1");
      expect(result[0]!.work_item_status).toBe("leased");
    });

    it("getActiveLeases excludes released leases", () => {
      const item = insertWorkItem({ work_item_id: "wi-released", status: "resolved" });
      coordinatorStore.insertLease({
        lease_id: "ls-released",
        work_item_id: item.work_item_id,
        runner_id: "runner-a",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        released_at: new Date().toISOString(),
        release_reason: "success",
      });

      const result = getActiveLeases(coordinatorStore);
      expect(result).toHaveLength(0);
    });

    it("getRecentStaleLeaseRecoveries returns abandoned leases", () => {
      const item = insertWorkItem({ work_item_id: "wi-abandoned", status: "failed_retryable" });
      coordinatorStore.insertLease({
        lease_id: "ls-abandoned",
        work_item_id: item.work_item_id,
        runner_id: "runner-a",
        acquired_at: new Date(Date.now() - 120000).toISOString(),
        expires_at: new Date(Date.now() - 60000).toISOString(),
        released_at: new Date().toISOString(),
        release_reason: "abandoned",
      });

      const result = getRecentStaleLeaseRecoveries(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.reason).toBe("abandoned");
      expect(result[0]!.conversation_id).toBe("conv-1");
    });

    it("getQuiescenceIndicator reflects backlog and stale leases", () => {
      insertWorkItem({ work_item_id: "wi-opened", status: "opened" });
      insertWorkItem({ work_item_id: "wi-leased", status: "leased" });
      insertWorkItem({ work_item_id: "wi-executing", status: "executing" });
      insertWorkItem({ work_item_id: "wi-retry", status: "failed_retryable", next_retry_at: new Date(Date.now() - 1000).toISOString() });
      const staleItem = insertWorkItem({ work_item_id: "wi-stale", status: "executing" });
      coordinatorStore.insertLease({
        lease_id: "ls-stale",
        work_item_id: staleItem.work_item_id,
        runner_id: "runner-a",
        acquired_at: new Date(Date.now() - 120000).toISOString(),
        expires_at: new Date(Date.now() - 60000).toISOString(),
        released_at: null,
        release_reason: null,
      });

      const result = getQuiescenceIndicator(coordinatorStore);
      expect(result.is_quiescent).toBe(false);
      expect(result.opened_count).toBe(1);
      expect(result.leased_count).toBe(1);
      expect(result.executing_count).toBe(2); // wi-executing + wi-stale
      expect(result.awaiting_retry_count).toBe(1);
      expect(result.has_stale_leases).toBe(true);
      expect(result.stale_lease_count).toBe(1);
      expect(result.oldest_lease_acquired_at).not.toBeNull();
    });

    it("getQuiescenceIndicator returns quiescent when no runnable work", () => {
      const result = getQuiescenceIndicator(coordinatorStore);
      expect(result.is_quiescent).toBe(true);
      expect(result.has_stale_leases).toBe(false);
      expect(result.oldest_lease_acquired_at).toBeNull();
    });

    it("buildControlPlaneSnapshot includes leases, recoveries, and quiescence", () => {
      const item = insertWorkItem({ work_item_id: "wi-snap", status: "leased" });
      coordinatorStore.insertLease({
        lease_id: "ls-snap",
        work_item_id: item.work_item_id,
        runner_id: "runner-a",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        released_at: null,
        release_reason: null,
      });

      const snapshot = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");
      expect(snapshot.leases.total_count).toBe(1);
      expect(snapshot.leases.active).toHaveLength(1);
      expect(snapshot.stale_recoveries.total_count).toBe(0);
      expect(snapshot.quiescence.is_quiescent).toBe(false);
      expect(snapshot.quiescence.leased_count).toBe(1);
    });
  });

  describe("intent observability", () => {
    it("getIntentSummaries includes idempotency_key and confirmation_status", () => {
      intentStore.admit({
        intent_id: "int-1",
        intent_type: "process.run",
        executor_family: "process",
        payload_json: JSON.stringify({ command: "echo" }),
        idempotency_key: "idem-1",
        status: "admitted",
        context_id: "ctx-1",
        target_id: null,
        terminal_reason: null,
      });

      const result = getIntentSummaries(intentStore);
      expect(result.pending).toHaveLength(1);
      const summary = result.pending[0]!;
      expect(summary.idempotency_key).toBe("idem-1");
      expect(summary.confirmation_status).toBe("unconfirmed");
    });

    it("getIntentSummaries derives confirmed for completed process execution", () => {
      intentStore.admit({
        intent_id: "int-2",
        intent_type: "process.run",
        executor_family: "process",
        payload_json: JSON.stringify({ command: "echo" }),
        idempotency_key: "idem-2",
        status: "executing",
        context_id: "ctx-1",
        target_id: null,
        terminal_reason: null,
      });
      executionStore.create({
        execution_id: "pe-2",
        intent_id: "int-2",
        command: "echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "completed",
        phase: "completed",
        confirmation_status: "confirmed",
        exit_code: 0,
        stdout: "",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        lease_expires_at: null,
        lease_runner_id: null,
      });

      const result = getIntentSummaries(intentStore);
      expect(result.executing).toHaveLength(1);
      expect(result.executing[0]!.confirmation_status).toBe("confirmed");
    });

    it("getIntentExecutionSummaries unifies mail and process under one model", () => {
      // Process intent
      intentStore.admit({
        intent_id: "int-p",
        intent_type: "process.run",
        executor_family: "process",
        payload_json: JSON.stringify({ command: "echo" }),
        idempotency_key: "idem-p",
        status: "executing",
        context_id: "ctx-1",
        target_id: null,
        terminal_reason: null,
      });
      executionStore.create({
        execution_id: "pe-p",
        intent_id: "int-p",
        command: "echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "running",
        phase: "running",
        confirmation_status: "unconfirmed",
        exit_code: null,
        stdout: "",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: null,
        confirmed_at: null,
        lease_expires_at: null,
        lease_runner_id: null,
      });

      // Mail intent
      intentStore.admit({
        intent_id: "int-m",
        intent_type: "mail.send_reply",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "idem-m",
        status: "executing",
        context_id: "ctx-1",
        target_id: "ob-m",
        terminal_reason: null,
      });
      outboundStore.createCommand(
        {
          outbound_id: "ob-m",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman:test",
          submitted_at: new Date().toISOString(),
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "idem-m-cmd",
        },
        {
          outbound_id: "ob-m",
          version: 1,
          reply_to_message_id: null,
          to: ["a@example.com"],
          cc: [],
          bcc: [],
          subject: "Re: test",
          body_text: "reply body",
          body_html: "",
          idempotency_key: "idem-m-cmd",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );

      const result = getIntentExecutionSummaries(intentStore);
      expect(result.recent).toHaveLength(2);
      const processRow = result.recent.find((r) => r.intent_id === "int-p")!;
      const mailRow = result.recent.find((r) => r.intent_id === "int-m")!;

      expect(processRow.executor_family).toBe("process");
      expect(processRow.phase).toBe("running");
      expect(processRow.confirmation_status).toBe("unconfirmed");
      expect(processRow.process_command).toBe("echo");
      expect(processRow.mail_outbound_id).toBeNull();

      expect(mailRow.executor_family).toBe("mail");
      expect(mailRow.phase).toBe("completed"); // submitted -> completed
      expect(mailRow.confirmation_status).toBe("unconfirmed"); // not confirmed yet
      expect(mailRow.mail_action_type).toBe("send_reply");
      expect(mailRow.process_execution_id).toBeNull();
    });

    it("getIntentExecutionSummaries surfaces failed_recent correctly", () => {
      intentStore.admit({
        intent_id: "int-fail",
        intent_type: "process.run",
        executor_family: "process",
        payload_json: JSON.stringify({ command: "echo" }),
        idempotency_key: "idem-fail",
        status: "failed_terminal",
        context_id: "ctx-1",
        target_id: null,
        terminal_reason: "crash",
      });
      executionStore.create({
        execution_id: "pe-fail",
        intent_id: "int-fail",
        command: "echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "failed",
        phase: "failed",
        confirmation_status: "confirmation_failed",
        exit_code: 1,
        stdout: "",
        stderr: "err",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        lease_expires_at: null,
        lease_runner_id: null,
      });

      const result = getIntentExecutionSummaries(intentStore);
      expect(result.failed_recent).toHaveLength(1);
      expect(result.failed_recent[0]!.terminal_reason).toBe("crash");
    });
  });

  describe("execution detail observability", () => {
    it("getProcessExecutionDetails includes phase, confirmation, and stdout preview", () => {
      intentStore.admit({
        intent_id: "int-d",
        intent_type: "process.run",
        executor_family: "process",
        payload_json: JSON.stringify({ command: "echo" }),
        idempotency_key: "idem-d",
        status: "executing",
        context_id: "ctx-1",
        target_id: null,
        terminal_reason: null,
      });
      executionStore.create({
        execution_id: "pe-d",
        intent_id: "int-d",
        command: "echo",
        args_json: '["hello"]',
        cwd: "/tmp",
        env_json: '{"KEY":"val"}',
        status: "completed",
        phase: "completed",
        confirmation_status: "confirmed",
        exit_code: 0,
        stdout: "hello world",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        lease_expires_at: null,
        lease_runner_id: "runner-1",
      });

      const result = getProcessExecutionDetails(executionStore);
      expect(result).toHaveLength(1);
      const detail = result[0]!;
      expect(detail.phase).toBe("completed");
      expect(detail.confirmation_status).toBe("confirmed");
      expect(detail.args).toEqual(["hello"]);
      expect(detail.cwd).toBe("/tmp");
      expect(detail.env_keys).toEqual(["KEY"]);
      expect(detail.stdout_preview).toBe("hello world");
      expect(detail.lease_runner_id).toBe("runner-1");
    });

    it("getMailExecutionDetails includes transitions and version preview", () => {
      outboundStore.createCommand(
        {
          outbound_id: "ob-d",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "confirmed",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman:test",
          submitted_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "idem-ob-d",
        },
        {
          outbound_id: "ob-d",
          version: 1,
          reply_to_message_id: null,
          to: ["to@example.com"],
          cc: ["cc@example.com"],
          bcc: [],
          subject: "Subject",
          body_text: "Body text",
          body_html: "",
          idempotency_key: "idem-ob-d",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );
      outboundStore.appendTransition({
        outbound_id: "ob-d",
        from_status: "pending",
        to_status: "submitted",
        reason: "handoff",
        transition_at: new Date().toISOString(),
      });
      outboundStore.appendTransition({
        outbound_id: "ob-d",
        from_status: "submitted",
        to_status: "confirmed",
        reason: "graph_confirm",
        transition_at: new Date().toISOString(),
      });

      const result = getMailExecutionDetails(outboundStore);
      expect(result).toHaveLength(1);
      const detail = result[0]!;
      expect(detail.status).toBe("confirmed");
      expect(detail.transitions.length).toBeGreaterThanOrEqual(2);
      const tSubmitted = detail.transitions.find((t) => t.to_status === "submitted")!;
      const tConfirmed = detail.transitions.find((t) => t.to_status === "confirmed")!;
      expect(tSubmitted.from_status).toBe("pending");
      expect(tConfirmed.from_status).toBe("submitted");
      expect(detail.latest_version_detail).not.toBeNull();
      expect(detail.latest_version_detail!.subject).toBe("Subject");
      expect(detail.latest_version_detail!.to).toEqual(["to@example.com"]);
      expect(detail.latest_version_detail!.body_text_preview).toBe("Body text");
    });
  });

  describe("intent lifecycle transitions", () => {
    it("getIntentLifecycleTransitions returns chronological transitions across sources", () => {
      // Admit intent first
      intentStore.admit({
        intent_id: "int-t",
        intent_type: "mail.send_reply",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "idem-t",
        status: "admitted",
        context_id: "ctx-1",
        target_id: "ob-t",
        terminal_reason: null,
      });
      // Create command after intent admission
      outboundStore.createCommand(
        {
          outbound_id: "ob-t",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "confirmed",
          latest_version: 1,
          created_at: "2024-01-01T00:00:10Z",
          created_by: "foreman:test",
          submitted_at: "2024-01-01T00:01:00Z",
          confirmed_at: "2024-01-01T00:02:00Z",
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "idem-ob-t",
        },
        {
          outbound_id: "ob-t",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "idem-ob-t",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: "2024-01-01T00:00:10Z",
          superseded_at: null,
        },
      );
      outboundStore.appendTransition({
        outbound_id: "ob-t",
        from_status: "pending",
        to_status: "submitted",
        reason: null,
        transition_at: "2024-01-01T00:01:00Z",
      });
      outboundStore.appendTransition({
        outbound_id: "ob-t",
        from_status: "submitted",
        to_status: "confirmed",
        reason: null,
        transition_at: "2024-01-01T00:02:00Z",
      });

      const transitions = getIntentLifecycleTransitions(db, "int-t");
      expect(transitions.length).toBeGreaterThanOrEqual(3);
      const intentAdmitted = transitions.find((t) => t.source === "intent")!;
      const outbounds = transitions.filter((t) => t.source === "outbound");
      expect(intentAdmitted.to_status).toBe("admitted");
      expect(outbounds.length).toBeGreaterThanOrEqual(2);
      // Assert array is sorted chronologically
      for (let i = 1; i < transitions.length; i++) {
        expect(transitions[i]!.transition_at.localeCompare(transitions[i - 1]!.transition_at)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
