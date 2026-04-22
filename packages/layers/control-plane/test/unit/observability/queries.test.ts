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
  buildScopeDispatchSummary,
  buildControlPlaneSnapshot,
  getActiveLeases,
  getRecentStaleLeaseRecoveries,
  getQuiescenceIndicator,
  getIntentSummaries,
  getIntentExecutionSummaries,
  getProcessExecutionDetails,
  getIntentLifecycleTransitions,
  getWorkItemAffinityOutcomes,
  getEvaluationDetail,
  getDecisionDetail,
  getExecutionDetail,
  getEvaluationsByContextDetail,
  getStuckWorkItems,
  getStuckWorkItemSummary,
  getStuckOutboundCommands,
  getStuckOutboundSummary,
  getRecentOperatorActions,
  getOperatorActionsForScope,
  getOperatorActionsForContext,
  getDraftReviewDetail,
  getDraftReviewDetails,
} from "../../../src/observability/queries.js";
import { getMailExecutionDetails } from "../../../src/observability/mailbox.js";
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

    // Seed context record for FK compliance
    coordinatorStore.upsertContextRecord({
      context_id: "conv-1",
      scope_id: "mb-1",
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
      context_json: null,
      created_at: now,
      updated_at: now,
      preferred_session_id: null,
      preferred_agent_id: null,
      affinity_group_id: null,
      affinity_strength: 0,
      affinity_expires_at: null,
      affinity_reason: null,
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

    it("getActiveWorkItems includes affinity fields", () => {
      insertWorkItem({
        work_item_id: "wi-affinity",
        status: "opened",
        preferred_session_id: "sess-1",
        affinity_strength: 2,
        affinity_expires_at: "2099-01-01T00:00:00Z",
        affinity_reason: "same_context",
      });

      const result = getActiveWorkItems(coordinatorStore);
      expect(result).toHaveLength(1);
      const item = result[0]!;
      expect(item.preferred_session_id).toBe("sess-1");
      expect(item.affinity_strength).toBe(2);
      expect(item.affinity_expires_at).toBe("2099-01-01T00:00:00Z");
      expect(item.affinity_reason).toBe("same_context");
    });
  });

  describe("affinity outcome queries", () => {
    it("classifies no-affinity work items correctly", () => {
      insertWorkItem({ work_item_id: "wi-no-affinity", status: "opened" });

      const result = getWorkItemAffinityOutcomes(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.had_affinity).toBe(false);
      expect(result[0]!.outcome).toBe("no_preference");
      expect(result[0]!.preferred_session_available).toBeNull();
    });

    it("classifies active affinity as ordering_boost", () => {
      insertWorkItem({
        work_item_id: "wi-active-affinity",
        status: "opened",
        preferred_session_id: "sess-1",
        affinity_strength: 1,
        affinity_expires_at: "2099-01-01T00:00:00Z",
        affinity_reason: "same_context",
      });

      const result = getWorkItemAffinityOutcomes(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.had_affinity).toBe(true);
      expect(result[0]!.affinity_expired).toBe(false);
      expect(result[0]!.outcome).toBe("ordering_boost");
    });

    it("classifies expired affinity as expired_before_scan", () => {
      insertWorkItem({
        work_item_id: "wi-expired",
        status: "opened",
        preferred_session_id: "sess-1",
        affinity_strength: 1,
        affinity_expires_at: "2020-01-01T00:00:00Z",
        affinity_reason: "same_context",
      });

      const result = getWorkItemAffinityOutcomes(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.had_affinity).toBe(true);
      expect(result[0]!.affinity_expired).toBe(true);
      expect(result[0]!.outcome).toBe("expired_before_scan");
    });

    it("includes actual_session_id when execution exists", () => {
      insertWorkItem({
        work_item_id: "wi-executed",
        status: "resolved",
        preferred_session_id: "sess-pref",
        affinity_strength: 1,
        affinity_expires_at: "2099-01-01T00:00:00Z",
      });
      const attempt: ExecutionAttempt = {
        execution_id: "ex-1",
        work_item_id: "wi-executed",
        revision_id: "rev-1",
        session_id: "sess-actual",
        status: "succeeded",
        started_at: new Date().toISOString(),
        completed_at: null,
        runtime_envelope_json: "{}",
        outcome_json: null,
        error_message: null,
      };
      coordinatorStore.insertExecutionAttempt(attempt);

      const result = getWorkItemAffinityOutcomes(coordinatorStore);
      expect(result).toHaveLength(1);
      expect(result[0]!.actual_session_id).toBe("sess-actual");
      // v2 deferred fields remain null
      expect(result[0]!.executed_by_preferred_session).toBeNull();
    });

    it("deduplicates work items with multiple execution attempts", () => {
      insertWorkItem({ work_item_id: "wi-multi-ex", status: "resolved" });
      coordinatorStore.insertExecutionAttempt({
        execution_id: "ex-a",
        work_item_id: "wi-multi-ex",
        revision_id: "rev-1",
        session_id: "sess-a",
        status: "succeeded",
        started_at: new Date().toISOString(),
        completed_at: null,
        runtime_envelope_json: "{}",
        outcome_json: null,
        error_message: null,
      });
      coordinatorStore.insertExecutionAttempt({
        execution_id: "ex-b",
        work_item_id: "wi-multi-ex",
        revision_id: "rev-1",
        session_id: "sess-b",
        status: "succeeded",
        started_at: new Date().toISOString(),
        completed_at: null,
        runtime_envelope_json: "{}",
        outcome_json: null,
        error_message: null,
      });

      const result = getWorkItemAffinityOutcomes(coordinatorStore);
      expect(result).toHaveLength(1);
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
          context_id: "conv-1",
          scope_id: "mb-1",
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
    it("buildScopeDispatchSummary aggregates counts per scope", () => {
      insertWorkItem({ work_item_id: "wi-1", status: "opened" });
      insertWorkItem({ work_item_id: "wi-2", status: "executing" });
      insertWorkItem({ work_item_id: "wi-3", status: "failed_retryable" });
      insertWorkItem({ work_item_id: "wi-4", status: "failed_terminal" });

      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          context_id: "conv-1",
          scope_id: "mb-1",
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

      const summary = buildScopeDispatchSummary(coordinatorStore, outboundStore, "mb-1");
      expect(summary.scope_id).toBe("mb-1");
      expect(summary.active_work_items).toBe(1);
      expect(summary.executing_work_items).toBe(1);
      expect(summary.failed_retryable_work_items).toBe(1);
      expect(summary.failed_terminal_work_items).toBe(1);
      expect(summary.pending_outbound_handoffs).toBe(1);
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
          context_id: "conv-1",
          scope_id: "mb-1",
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
      expect(snapshot.scope_summary).not.toBeNull();
      expect(snapshot.scope_summary!.pending_outbound_handoffs).toBe(1);
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
      expect(result[0]!.context_id).toBe("conv-1");
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
      expect(result[0]!.context_id).toBe("conv-1");
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
          context_id: "conv-1",
          scope_id: "mb-1",
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
          context_id: "conv-1",
          scope_id: "mb-1",
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
          context_id: "conv-1",
          scope_id: "mb-1",
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

  describe("deep-dive detail queries", () => {
    it("getEvaluationDetail returns parsed evaluation with JSON fields", () => {
      const wi = insertWorkItem({ work_item_id: "wi-eval-1" });
      coordinatorStore.insertExecutionAttempt({
        execution_id: "exec-eval-1",
        work_item_id: wi.work_item_id,
        revision_id: "rev-eval-1",
        session_id: null,
        status: "succeeded",
        started_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T00:01:00Z",
        runtime_envelope_json: "{}",
        outcome_json: "{}",
        error_message: null,
      });
      coordinatorStore.insertEvaluation({
        evaluation_id: "eval-1",
        execution_id: "exec-eval-1",
        work_item_id: wi.work_item_id,
        context_id: "conv-1",
        scope_id: "mb-1",
        charter_id: "support_steward",
        role: "primary",
        output_version: "1",
        analyzed_at: "2024-01-01T00:01:00Z",
        outcome: "proposed_action",
        confidence_json: JSON.stringify({ score: 0.95 }),
        summary: "Draft reply proposed",
        classifications_json: JSON.stringify({ spam: false }),
        facts_json: JSON.stringify(["fact-1"]),
        escalations_json: JSON.stringify([]),
        proposed_actions_json: JSON.stringify([{ action: "draft_reply" }]),
        tool_requests_json: JSON.stringify([]),
        recommended_action_class: "draft_reply",
        created_at: "2024-01-01T00:01:00Z",
      });

      const detail = getEvaluationDetail(coordinatorStore, "eval-1")!;
      expect(detail.evaluation_id).toBe("eval-1");
      expect(detail.charter_id).toBe("support_steward");
      expect(detail.proposed_actions).toEqual([{ action: "draft_reply" }]);
      expect(detail.confidence).toEqual({ score: 0.95 });
      expect(detail.classifications).toEqual({ spam: false });
      expect(detail.facts).toEqual(["fact-1"]);
      expect(detail.escalations).toEqual([]);
      expect(detail.tool_requests).toEqual([]);
    });

    it("getEvaluationDetail returns undefined for missing evaluation", () => {
      expect(getEvaluationDetail(coordinatorStore, "nonexistent")).toBeUndefined();
    });

    it("getDecisionDetail returns parsed decision with JSON fields", () => {
      coordinatorStore.insertDecision({
        decision_id: "dec-1",
        context_id: "conv-1",
        scope_id: "mb-1",
        source_charter_ids_json: JSON.stringify(["support_steward"]),
        approved_action: "draft_reply",
        payload_json: JSON.stringify({ to: "user@example.com", subject: "Re: Help" }),
        rationale: "User asked for help",
        decided_at: "2024-01-01T00:02:00Z",
        outbound_id: null,
        created_by: "foreman:test/charter:support_steward",
      });

      const detail = getDecisionDetail(coordinatorStore, "dec-1")!;
      expect(detail.decision_id).toBe("dec-1");
      expect(detail.approved_action).toBe("draft_reply");
      expect(detail.source_charter_ids).toEqual(["support_steward"]);
      expect(detail.payload).toEqual({ to: "user@example.com", subject: "Re: Help" });
      expect(detail.rationale).toBe("User asked for help");
      expect(detail.created_by).toBe("foreman:test/charter:support_steward");
    });

    it("getDecisionDetail returns undefined for missing decision", () => {
      expect(getDecisionDetail(coordinatorStore, "nonexistent")).toBeUndefined();
    });

    it("getExecutionDetail returns parsed execution with JSON fields", () => {
      const wi = insertWorkItem({ work_item_id: "wi-exec-1" });
      coordinatorStore.insertExecutionAttempt({
        execution_id: "exec-1",
        work_item_id: wi.work_item_id,
        revision_id: "rev-1",
        session_id: "session-1",
        status: "succeeded",
        started_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T00:01:00Z",
        runtime_envelope_json: JSON.stringify({ messages: [{ id: "msg-1" }] }),
        outcome_json: JSON.stringify({ action: "draft_reply", payload: {} }),
        error_message: null,
      });

      const detail = getExecutionDetail(coordinatorStore, "exec-1")!;
      expect(detail.execution_id).toBe("exec-1");
      expect(detail.session_id).toBe("session-1");
      expect(detail.status).toBe("succeeded");
      expect(detail.runtime_envelope).toEqual({ messages: [{ id: "msg-1" }] });
      expect(detail.outcome).toEqual({ action: "draft_reply", payload: {} });
    });

    it("getExecutionDetail returns undefined for missing execution", () => {
      expect(getExecutionDetail(coordinatorStore, "nonexistent")).toBeUndefined();
    });

    it("getEvaluationsByContextDetail returns all evaluations for a context", () => {
      const wi = insertWorkItem({ work_item_id: "wi-ctx-1" });
      coordinatorStore.insertExecutionAttempt({
        execution_id: "exec-ctx-1",
        work_item_id: wi.work_item_id,
        revision_id: "rev-ctx-1",
        session_id: null,
        status: "succeeded",
        started_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T00:01:00Z",
        runtime_envelope_json: "{}",
        outcome_json: "{}",
        error_message: null,
      });
      coordinatorStore.insertEvaluation({
        evaluation_id: "eval-ctx-1",
        execution_id: "exec-ctx-1",
        work_item_id: wi.work_item_id,
        context_id: "conv-1",
        scope_id: "mb-1",
        charter_id: "support_steward",
        role: "primary",
        output_version: "1",
        analyzed_at: "2024-01-01T00:01:00Z",
        outcome: "proposed_action",
        confidence_json: "{}",
        summary: "First",
        classifications_json: "[]",
        facts_json: "[]",
        escalations_json: "[]",
        proposed_actions_json: "[]",
        tool_requests_json: "[]",
        recommended_action_class: null,
        created_at: "2024-01-01T00:01:00Z",
      });

      const results = getEvaluationsByContextDetail(coordinatorStore, "conv-1", "mb-1");
      expect(results.length).toBe(1);
      expect(results[0]!.evaluation_id).toBe("eval-ctx-1");
      expect(results[0]!.summary).toBe("First");
    });
  });

  describe("stuck work item detection", () => {
    it("detects stuck_opened when created_at exceeds threshold", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z"; // 24 hours ago
      insertWorkItem({ work_item_id: "wi-old-opened", status: "opened", created_at: old, updated_at: old });
      insertWorkItem({ work_item_id: "wi-fresh-opened", status: "opened", created_at: now, updated_at: now });

      const result = getStuckWorkItems(coordinatorStore, { opened_max_age_minutes: 60 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.work_item_id).toBe("wi-old-opened");
      expect(result[0]!.classification).toBe("stuck_opened");
    });

    it("detects stuck_leased when updated_at exceeds threshold", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      insertWorkItem({ work_item_id: "wi-old-leased", status: "leased", created_at: old, updated_at: old });
      insertWorkItem({ work_item_id: "wi-fresh-leased", status: "leased", created_at: old, updated_at: now });

      const result = getStuckWorkItems(coordinatorStore, { leased_max_age_minutes: 60 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.work_item_id).toBe("wi-old-leased");
      expect(result[0]!.classification).toBe("stuck_leased");
    });

    it("detects stuck_executing when updated_at exceeds threshold", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      insertWorkItem({ work_item_id: "wi-old-exec", status: "executing", created_at: old, updated_at: old });
      insertWorkItem({ work_item_id: "wi-fresh-exec", status: "executing", created_at: old, updated_at: now });

      const result = getStuckWorkItems(coordinatorStore, { executing_max_age_minutes: 60 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.work_item_id).toBe("wi-old-exec");
      expect(result[0]!.classification).toBe("stuck_executing");
    });

    it("detects stuck_retry_exhausted when retry_count >= max_retries and next_retry_at is past", () => {
      const now = "2024-01-02T00:00:00Z";
      const past = "2024-01-01T00:00:00Z";
      const future = "2024-01-03T00:00:00Z";
      insertWorkItem({
        work_item_id: "wi-retry-exhausted",
        status: "failed_retryable",
        retry_count: 3,
        next_retry_at: past,
        created_at: past,
        updated_at: past,
      });
      insertWorkItem({
        work_item_id: "wi-retry-ok",
        status: "failed_retryable",
        retry_count: 1,
        next_retry_at: past,
        created_at: past,
        updated_at: past,
      });
      insertWorkItem({
        work_item_id: "wi-retry-future",
        status: "failed_retryable",
        retry_count: 3,
        next_retry_at: future,
        created_at: past,
        updated_at: past,
      });

      const result = getStuckWorkItems(coordinatorStore, { max_retries: 3 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.work_item_id).toBe("wi-retry-exhausted");
      expect(result[0]!.classification).toBe("stuck_retry_exhausted");
    });

    it("getStuckWorkItemSummary returns counts by classification", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      insertWorkItem({ work_item_id: "wi-a", status: "opened", created_at: old, updated_at: old });
      insertWorkItem({ work_item_id: "wi-b", status: "opened", created_at: old, updated_at: old });
      insertWorkItem({ work_item_id: "wi-c", status: "leased", created_at: old, updated_at: old });

      const summary = getStuckWorkItemSummary(coordinatorStore, { opened_max_age_minutes: 60, leased_max_age_minutes: 60 }, now);
      const opened = summary.find((s) => s.classification === "stuck_opened");
      const leased = summary.find((s) => s.classification === "stuck_leased");
      expect(opened?.count).toBe(2);
      expect(leased?.count).toBe(1);
    });
  });

  describe("stuck outbound detection", () => {
    function insertOutboundWithStatus(
      outboundId: string,
      status: import("../../../src/outbound/types.js").OutboundStatus,
      createdAt: string,
      transitionAt?: string,
    ) {
      outboundStore.createCommand(
        {
          outbound_id: outboundId,
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status,
          latest_version: 1,
          created_at: createdAt,
          created_by: "foreman:test/charter:support_steward",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: `key-${outboundId}`,
        },
        {
          outbound_id: outboundId,
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: `key-${outboundId}`,
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: createdAt,
          superseded_at: null,
        },
      );
      if (transitionAt && status !== "pending") {
        outboundStore.appendTransition({
          outbound_id: outboundId,
          version: 1,
          from_status: "pending",
          to_status: status,
          reason: "test",
          transition_at: transitionAt,
        });
      }
    }

    it("detects stuck_pending when created_at exceeds threshold", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      insertOutboundWithStatus("ob-old-pending", "pending", old);
      insertOutboundWithStatus("ob-fresh-pending", "pending", now);

      const result = getStuckOutboundCommands(outboundStore, { pending_max_age_minutes: 60 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.outbound_id).toBe("ob-old-pending");
      expect(result[0]!.classification).toBe("stuck_pending");
    });

    it("detects stuck_draft_creating when transition exceeds threshold", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      const fresh = "2024-01-01T23:00:00Z";
      insertOutboundWithStatus("ob-old-draft", "draft_creating", old, old);
      insertOutboundWithStatus("ob-fresh-draft", "draft_creating", old, fresh);

      const result = getStuckOutboundCommands(outboundStore, { draft_creating_max_age_minutes: 60 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.outbound_id).toBe("ob-old-draft");
      expect(result[0]!.classification).toBe("stuck_draft_creating");
    });

    it("detects stuck_draft_ready when transition exceeds threshold in hours", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      const fresh = "2024-01-01T23:00:00Z";
      insertOutboundWithStatus("ob-old-ready", "draft_ready", old, old);
      insertOutboundWithStatus("ob-fresh-ready", "draft_ready", old, fresh);

      const result = getStuckOutboundCommands(outboundStore, { draft_ready_max_age_hours: 2 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.outbound_id).toBe("ob-old-ready");
      expect(result[0]!.classification).toBe("stuck_draft_ready");
    });

    it("detects stuck_sending when transition exceeds threshold", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      const fresh = "2024-01-01T23:00:00Z";
      insertOutboundWithStatus("ob-old-sending", "sending", old, old);
      insertOutboundWithStatus("ob-fresh-sending", "sending", old, fresh);

      const result = getStuckOutboundCommands(outboundStore, { sending_max_age_minutes: 60 }, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.outbound_id).toBe("ob-old-sending");
      expect(result[0]!.classification).toBe("stuck_sending");
    });

    it("getStuckOutboundSummary returns counts by classification", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      insertOutboundWithStatus("ob-a", "pending", old);
      insertOutboundWithStatus("ob-b", "pending", old);
      insertOutboundWithStatus("ob-c", "draft_creating", old, old);

      const summary = getStuckOutboundSummary(outboundStore, { pending_max_age_minutes: 60, draft_creating_max_age_minutes: 60 }, now);
      const pending = summary.find((s) => s.classification === "stuck_pending");
      const draft = summary.find((s) => s.classification === "stuck_draft_creating");
      expect(pending?.count).toBe(2);
      expect(draft?.count).toBe(1);
    });
  });

  describe("operator action audit queries", () => {
    function insertAction(overrides: Partial<import("../../../src/coordinator/types.js").OperatorActionRequest> & { scope_id?: string }): void {
      const now = new Date().toISOString();
      const req: import("../../../src/coordinator/types.js").OperatorActionRequest = {
        request_id: `req-${Math.random().toString(36).slice(2)}`,
        scope_id: "mb-1",
        action_type: "trigger_sync",
        target_id: null,
        payload_json: null,
        source_message_id: null,
        status: "executed",
        requested_by: "operator",
        requested_at: now,
        executed_at: now,
        ...overrides,
      };
      coordinatorStore.insertOperatorActionRequest(req);
    }

    it("getRecentOperatorActions returns actions across all scopes ordered by requested_at desc", () => {
      insertAction({ request_id: "req-a", action_type: "trigger_sync", requested_at: "2024-01-02T00:00:00Z" });
      insertAction({ request_id: "req-b", action_type: "request_redispatch", requested_at: "2024-01-03T00:00:00Z" });
      insertAction({ request_id: "req-c", action_type: "rebuild_projections", requested_at: "2024-01-01T00:00:00Z" });

      const actions = getRecentOperatorActions({ db }, 10);
      expect(actions).toHaveLength(3);
      expect(actions[0]!.action_id).toBe("req-b");
      expect(actions[1]!.action_id).toBe("req-a");
      expect(actions[2]!.action_id).toBe("req-c");
    });

    it("getOperatorActionsForScope filters by scope_id", () => {
      insertAction({ request_id: "req-a", scope_id: "mb-1", requested_at: "2024-01-01T00:00:00Z" });
      insertAction({ request_id: "req-b", scope_id: "mb-2", requested_at: "2024-01-01T00:00:00Z" });

      const actions = getOperatorActionsForScope({ db }, "mb-1", 10);
      expect(actions).toHaveLength(1);
      expect(actions[0]!.action_id).toBe("req-a");
    });

    it("getOperatorActionsForContext includes actions where target_id is the context", () => {
      insertAction({ request_id: "req-a", action_type: "derive_work", target_id: "conv-1", requested_at: "2024-01-01T00:00:00Z" });
      insertAction({ request_id: "req-b", action_type: "trigger_sync", requested_at: "2024-01-01T00:00:00Z" });

      const actions = getOperatorActionsForContext({ db }, "conv-1", 10);
      expect(actions).toHaveLength(1);
      expect(actions[0]!.action_id).toBe("req-a");
      expect(actions[0]!.context_id).toBe("conv-1");
    });

    it("getOperatorActionsForContext includes actions where target_id is a work_item for that context", () => {
      coordinatorStore.db.prepare(`
        insert into work_items (work_item_id, context_id, scope_id, opened_for_revision_id, status)
        values (?, ?, ?, ?, ?)
      `).run("wi-audit-1", "conv-1", "mb-1", "rev-1", "opened");

      insertAction({ request_id: "req-a", action_type: "retry_work_item", target_id: "wi-audit-1", requested_at: "2024-01-01T00:00:00Z" });
      insertAction({ request_id: "req-b", action_type: "trigger_sync", requested_at: "2024-01-01T00:00:00Z" });

      const actions = getOperatorActionsForContext({ db }, "conv-1", 10);
      expect(actions).toHaveLength(1);
      const retry = actions.find((a) => a.action_id === "req-a");
      expect(retry).toBeDefined();
      expect(retry!.work_item_id).toBe("wi-audit-1");
      expect(retry!.context_id).toBe("conv-1");
    });

    it("redacts preview_work payloads to summary-only", () => {
      insertAction({
        request_id: "req-preview",
        action_type: "preview_work",
        target_id: "conv-1",
        payload_json: JSON.stringify({ contextId: "conv-1", fact_ids: ["f-1", "f-2"], preview_duration_ms: 120, error: "none" }),
        requested_at: "2024-01-01T00:00:00Z",
      });

      const actions = getOperatorActionsForScope({ db }, "mb-1", 10);
      const preview = actions.find((a) => a.action_id === "req-preview");
      expect(preview).toBeDefined();
      expect(preview!.payload_summary).not.toContain("f-1");
      expect(preview!.payload_summary).not.toContain("f-2");
      const summary = JSON.parse(preview!.payload_summary);
      expect(summary.scope_id).toBe("mb-1");
      expect(summary.context_id).toBe("conv-1");
      expect(summary.fact_count).toBe(2);
      expect(summary.preview_duration_ms).toBe(120);
      expect(summary.error).toBe("none");
    });

    it("redacts snake_case context_id and raw facts content without leakage", () => {
      insertAction({
        request_id: "req-snake",
        action_type: "preview_work",
        target_id: "conv-2",
        payload_json: JSON.stringify({
          context_id: "conv-2",
          facts: [
            { fact_id: "f-3", content: "sensitive body text" },
            { fact_id: "f-4", content: "more sensitive data" },
          ],
          preview_duration_ms: 250,
          error: "timeout",
        }),
        requested_at: "2024-01-01T00:00:00Z",
      });

      const actions = getOperatorActionsForScope({ db }, "mb-1", 10);
      const preview = actions.find((a) => a.action_id === "req-snake");
      expect(preview).toBeDefined();

      // Raw fact IDs must not leak
      expect(preview!.payload_summary).not.toContain("f-3");
      expect(preview!.payload_summary).not.toContain("f-4");
      // Raw fact content must not leak
      expect(preview!.payload_summary).not.toContain("sensitive body text");
      expect(preview!.payload_summary).not.toContain("more sensitive data");

      const summary = JSON.parse(preview!.payload_summary);
      expect(summary.scope_id).toBe("mb-1");
      expect(summary.context_id).toBe("conv-2");
      expect(summary.fact_count).toBe(2);
      expect(summary.preview_duration_ms).toBe(250);
      expect(summary.error).toBe("timeout");
    });

    it("exposes safe target reference for non-preview actions", () => {
      insertAction({ request_id: "req-retry", action_type: "retry_work_item", target_id: "wi-1", requested_at: "2024-01-01T00:00:00Z" });

      const actions = getOperatorActionsForScope({ db }, "mb-1", 10);
      const retry = actions.find((a) => a.action_id === "req-retry");
      expect(retry).toBeDefined();
      expect(retry!.payload_summary).toBe("target: wi-1");
    });

    it("reads requested_by from row", () => {
      insertAction({ request_id: "req-by", requested_by: "admin", requested_at: "2024-01-01T00:00:00Z" });

      const actions = getRecentOperatorActions({ db }, 10);
      const action = actions.find((a) => a.action_id === "req-by");
      expect(action).toBeDefined();
      expect(action!.actor).toBe("admin");
    });

    it("defaults actor to operator when requested_by is missing", () => {
      // Simulate a legacy row by bypassing the typed insert
      db.prepare(`
        insert into operator_action_requests (request_id, scope_id, action_type, target_id, payload_json, status, requested_at, executed_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("req-legacy", "mb-1", "trigger_sync", null, null, "executed", "2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z");

      const actions = getRecentOperatorActions({ db }, 10);
      const legacy = actions.find((a) => a.action_id === "req-legacy");
      expect(legacy).toBeDefined();
      expect(legacy!.actor).toBe("operator");
    });

    it("since parameter filters by requested_at", () => {
      insertAction({ request_id: "req-old", requested_at: "2024-01-01T00:00:00Z" });
      insertAction({ request_id: "req-new", requested_at: "2024-01-03T00:00:00Z" });

      const actions = getRecentOperatorActions({ db }, 10, "2024-01-02T00:00:00Z");
      expect(actions).toHaveLength(1);
      expect(actions[0]!.action_id).toBe("req-new");
    });
  });

  describe("control plane snapshot stuck integration", () => {
    it("buildControlPlaneSnapshot includes stuck work items and outbound commands", () => {
      const now = "2024-01-02T00:00:00Z";
      const old = "2024-01-01T00:00:00Z";
      insertWorkItem({ work_item_id: "wi-stuck", status: "opened", created_at: old, updated_at: old });
      outboundStore.createCommand(
        {
          outbound_id: "ob-stuck",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: old,
          created_by: "test",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-stuck",
        },
        {
          outbound_id: "ob-stuck",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-stuck",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: old,
          superseded_at: null,
        },
      );

      const snapshot = buildControlPlaneSnapshot(coordinatorStore, outboundStore, "mb-1");
      expect(snapshot.stuck).toBeDefined();
      expect(snapshot.stuck.work_items.length).toBeGreaterThan(0);
      expect(snapshot.stuck.work_items[0]!.classification).toBe("stuck_opened");
      expect(snapshot.stuck.outbound_handoffs.length).toBeGreaterThan(0);
      expect(snapshot.stuck.outbound_handoffs[0]!.classification).toBe("stuck_pending");
    });
  });

  describe("draft review detail queries", () => {
    function seedOutbound(overrides?: {
      outbound_id?: string;
      status?: import("../../../src/outbound/types.js").OutboundStatus;
      action_type?: string;
      reviewed_at?: string | null;
      approved_at?: string | null;
    }) {
      const id = overrides?.outbound_id ?? "ob-draft-1";
      const now = new Date().toISOString();
      outboundStore.createCommand(
        {
          outbound_id: id,
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: overrides?.action_type ?? "send_reply",
          status: overrides?.status ?? "draft_ready",
          latest_version: 1,
          created_at: now,
          created_by: "test",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: `key-${id}`,
          reviewed_at: null,
          reviewer_notes: null,
          external_reference: null,
          approved_at: null,
        },
        {
          outbound_id: id,
          version: 1,
          reply_to_message_id: null,
          to: ["to@example.com"],
          cc: [],
          bcc: [],
          subject: "Test Subject",
          body_text: "Hello world",
          body_html: "",
          idempotency_key: `key-${id}`,
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: now,
          superseded_at: null,
        },
      );
      if (overrides?.reviewed_at) {
        outboundStore.updateCommandStatus(id, overrides.status ?? "draft_ready", { reviewed_at: overrides.reviewed_at });
      }
      if (overrides?.approved_at) {
        outboundStore.updateCommandStatus(id, overrides.status ?? "draft_ready", { approved_at: overrides.approved_at });
      }
      return id;
    }

    function seedDecision(outboundId: string, rationale: string) {
      coordinatorStore.insertDecision({
        decision_id: `fd-${outboundId}`,
        context_id: "conv-1",
        scope_id: "mb-1",
        source_charter_ids_json: '["support_steward"]',
        approved_action: "send_reply",
        payload_json: "{}",
        rationale,
        decided_at: new Date().toISOString(),
        outbound_id: outboundId,
        created_by: "foreman:test/charter:support_steward",
      });
    }

    function seedEvaluation(summary: string) {
      const now = new Date().toISOString();
      // Seed required FK rows
      coordinatorStore.insertWorkItem({
        work_item_id: "wi-1",
        context_id: "conv-1",
        scope_id: "mb-1",
        status: "resolved",
        priority: 0,
        opened_for_revision_id: "rev-1",
        resolved_revision_id: null,
        resolution_outcome: "action_created",
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
        context_json: null,
        created_at: now,
        updated_at: now,
        preferred_session_id: null,
        preferred_agent_id: null,
        affinity_group_id: null,
        affinity_strength: 0,
        affinity_expires_at: null,
        affinity_reason: null,
      });
      coordinatorStore.insertExecutionAttempt({
        execution_id: "ex-1",
        work_item_id: "wi-1",
        revision_id: "rev-1",
        session_id: null,
        status: "succeeded",
        started_at: now,
        completed_at: now,
        runtime_envelope_json: "{}",
        outcome_json: null,
        error_message: null,
      });
      coordinatorStore.insertEvaluation({
        evaluation_id: "eval-1",
        execution_id: "ex-1",
        work_item_id: "wi-1",
        context_id: "conv-1",
        scope_id: "mb-1",
        charter_id: "support_steward",
        role: "primary",
        output_version: "1",
        analyzed_at: now,
        outcome: "accepted",
        confidence_json: "{}",
        summary,
        classifications_json: "[]",
        facts_json: "[]",
        escalations_json: "[]",
        proposed_actions_json: "[]",
        tool_requests_json: "[]",
        recommended_action_class: null,
        created_at: now,
      });
    }

    it("getDraftReviewDetail returns undefined for missing outbound", () => {
      const detail = getDraftReviewDetail(outboundStore, coordinatorStore, "ob-missing");
      expect(detail).toBeUndefined();
    });

    it("getDraftReviewDetail surfaces outbound, decision, and evaluation lineage", () => {
      const id = seedOutbound();
      seedDecision(id, "Reply needed for refund");
      seedEvaluation("Customer asks for refund");

      const detail = getDraftReviewDetail(outboundStore, coordinatorStore, id);
      expect(detail).toBeDefined();
      expect(detail!.outbound_id).toBe(id);
      expect(detail!.status).toBe("draft_ready");
      expect(detail!.review_status).toBe("awaiting_review");
      expect(detail!.subject).toBe("Test Subject");
      expect(detail!.body_preview).toBe("Hello world");
      expect(detail!.to).toEqual(["to@example.com"]);
      expect(detail!.decision_id).toBe(`fd-${id}`);
      expect(detail!.decision_rationale).toBe("Reply needed for refund");
      expect(detail!.evaluation_id).toBe("eval-1");
      expect(detail!.charter_id).toBe("support_steward");
      expect(detail!.evaluation_summary).toBe("Customer asks for refund");
      expect(detail!.available_actions).toContain("approve_draft_for_send");
      expect(detail!.available_actions).toContain("mark_reviewed");
      expect(detail!.available_actions).toContain("reject_draft");
      expect(detail!.available_actions).toContain("handled_externally");
    });

    it("getDraftReviewDetail returns correct review_status for reviewed and approved drafts", () => {
      const idReviewed = seedOutbound({ outbound_id: "ob-reviewed", reviewed_at: new Date().toISOString() });
      const idApproved = seedOutbound({ outbound_id: "ob-approved", approved_at: new Date().toISOString(), status: "approved_for_send" });

      const reviewed = getDraftReviewDetail(outboundStore, coordinatorStore, idReviewed);
      expect(reviewed!.review_status).toBe("awaiting_review");
      expect(reviewed!.reviewed_at).not.toBeNull();

      const approved = getDraftReviewDetail(outboundStore, coordinatorStore, idApproved);
      expect(approved!.review_status).toBe("approved_for_send");
    });

    it("getDraftReviewDetail omits approve action for non-send action types", () => {
      const id = seedOutbound({ outbound_id: "ob-draft", action_type: "draft_reply" });
      const detail = getDraftReviewDetail(outboundStore, coordinatorStore, id);
      expect(detail!.available_actions).not.toContain("approve_draft_for_send");
      expect(detail!.available_actions).toContain("mark_reviewed");
    });

    it("getDraftReviewDetails filters by scope and status", () => {
      seedOutbound({ outbound_id: "ob-a", status: "draft_ready" });
      seedOutbound({ outbound_id: "ob-b", status: "confirmed" });
      seedOutbound({ outbound_id: "ob-c", status: "draft_ready" });

      const all = getDraftReviewDetails(outboundStore, coordinatorStore, "mb-1");
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some((d) => d.outbound_id === "ob-b")).toBe(false);

      const limited = getDraftReviewDetails(outboundStore, coordinatorStore, "mb-1", ["draft_ready"]);
      expect(limited.every((d) => d.status === "draft_ready")).toBe(true);
    });
  });
});
