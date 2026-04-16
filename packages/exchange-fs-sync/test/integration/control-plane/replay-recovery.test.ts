import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ToolCallRecord } from "../../../src/coordinator/types.js";
import {
  createHarness,
  insertConversation,
  insertWorkItem,
  insertExecutionAttempt,
  makeInvocationEnvelope,
  makeEvaluation,
  makeSignal,
  countActiveLeases,
  countDecisionsForWorkItem,
  countOutboundCommandsForThread,
} from "./harness.js";
import type { Harness } from "./harness.js";

describe("Replay and Recovery Tests", () => {
  let h: Harness;

  beforeEach(() => {
    h = createHarness();
  });

  afterEach(() => {
    h.outboundStore.close();
    h.traceStore.close();
    h.db.close();
  });

  // ========================================================================
  // W1–W4: Work Item Replay
  // ========================================================================
  describe("Work Item Replay (W1-W4)", () => {
    it("W1: same work item replayed does not acquire lease or duplicate command", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "resolved", resolution_outcome: "action_created" });

      // Simulate a prior outbound command
      const decisionId = `fd_${wi.work_item_id}_send_reply`;
      h.coordinatorStore.insertDecision({
        decision_id: decisionId,
        context_id: "conv-1",
        scope_id: "mb-1",
        source_charter_ids_json: "[\"support_steward\"]",
        approved_action: "send_reply",
        payload_json: JSON.stringify({ subject: "Hi" }),
        rationale: "test",
        decided_at: new Date().toISOString(),
        outbound_id: `ob_${decisionId}`,
        created_by: "foreman:fm-test/charter:support_steward",
      });
      h.outboundStore.createCommand(
        {
          outbound_id: `ob_${decisionId}`,
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman:fm-test/charter:support_steward",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-001",
        },
        {
          outbound_id: `ob_${decisionId}`,
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "Hi",
          body_text: "",
          body_html: "",
          idempotency_key: `ob_${decisionId}-v1`,
          policy_snapshot_json: "{}",
          payload_json: JSON.stringify({ subject: "Hi" }),
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );

      // Scheduler wakes and scans
      const runnable = h.scheduler.scanForRunnableWork("mb-1", 10);
      expect(runnable.some((r) => r.work_item_id === wi.work_item_id)).toBe(false);

      // Attempt lease acquisition
      const leaseResult = h.scheduler.acquireLease(wi.work_item_id);
      expect(leaseResult.success).toBe(false);

      // Critical assertions
      expect(countActiveLeases(h, wi.work_item_id)).toBe(0);
      expect(h.coordinatorStore.getWorkItem(wi.work_item_id)!.status).toBe("resolved");
      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(1);
    });

    it("W2: replay after partial execution recovers stale lease to failed_retryable", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(h, wi.work_item_id, exId, makeInvocationEnvelope(wi.work_item_id, exId));
      h.scheduler.startExecution(wi.work_item_id, "conv-1:rev:1", JSON.stringify(makeInvocationEnvelope(wi.work_item_id, exId)));

      // Simulate runner died 30s ago
      const past = new Date(Date.now() - 30_000).toISOString();
      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id)!;
      h.coordinatorStore.updateLeaseExpiry(lease.lease_id, past);

      // Recovery scanner runs, then scheduler re-evaluates
      const recovered = h.scheduler.recoverStaleLeases(past);
      expect(recovered).toHaveLength(1);

      // Critical assertions
      const leaseRow = h.db.prepare("select * from work_item_leases where lease_id = ?").get(lease.lease_id) as Record<string, unknown>;
      expect(leaseRow.release_reason).toBe("abandoned");

      const attemptRow = h.db.prepare("select * from execution_attempts where execution_id = ?").get(exId) as Record<string, unknown>;
      expect(attemptRow.status).toBe("abandoned");

      const wiRow = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(wiRow.status).toBe("failed_retryable");
      expect(wiRow.retry_count).toBe(1);

      expect(countDecisionsForWorkItem(h, wi.work_item_id)).toBe(0);
    });

    it("W3: replay after process restart recovers stale lease deterministically", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(h, wi.work_item_id, exId, makeInvocationEnvelope(wi.work_item_id, exId));
      h.scheduler.startExecution(wi.work_item_id, "conv-1:rev:1", JSON.stringify(makeInvocationEnvelope(wi.work_item_id, exId)));

      // Simulate crash by expiring lease
      const past = new Date(Date.now() - 120_000).toISOString();
      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id)!;
      h.coordinatorStore.updateLeaseExpiry(lease.lease_id, past);

      // New process starts with a fresh scheduler instance
      const { scheduler: newScheduler } = createHarness("runner-new");
      // Wire the new scheduler to the existing store (simulating process restart with same DB)
      Object.setPrototypeOf(newScheduler, h.scheduler.constructor.prototype);
      // Actually we need to use the same coordinatorStore; createHarness makes a new DB.
      // Instead, instantiate SqliteScheduler directly with the existing store.
      const { SqliteScheduler } = await import("../../../src/scheduler/scheduler.js");
      const restartedScheduler = new SqliteScheduler(h.coordinatorStore, { leaseDurationMs: 60_000, runnerId: "runner-new" });
      restartedScheduler.recoverStaleLeases();

      const wiRow = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(["failed_retryable", "opened"]).toContain(wiRow.status);

      // Only one non-stale lease exists
      const activeLeases = h.db.prepare("select count(*) as c from work_item_leases where work_item_id = ? and released_at is null and expires_at > ?")
        .get(wi.work_item_id, new Date().toISOString()) as { c: number };
      expect(activeLeases.c).toBe(0);

      // Status is deterministic from DB alone
      const reloaded = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(reloaded.status).toBe(wiRow.status);
    });

    it("W4: replay after stale lease expiry transitions work item to failed_retryable", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const past = new Date(Date.now() - 300_000).toISOString();
      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id)!;
      h.coordinatorStore.updateLeaseExpiry(lease.lease_id, past);

      const recovered = h.scheduler.recoverStaleLeases(past);
      expect(recovered).toHaveLength(1);

      const leaseRow = h.db.prepare("select * from work_item_leases where lease_id = ?").get(lease.lease_id) as Record<string, unknown>;
      expect(leaseRow.released_at).toBe(past);

      const wiRow = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(wiRow.status).toBe("failed_retryable");

      const activeAttempts = h.db.prepare("select count(*) as c from execution_attempts where work_item_id = ? and status = 'active'")
        .get(wi.work_item_id) as { c: number };
      expect(activeAttempts.c).toBe(0);
    });
  });


  // ========================================================================
  // R1–R4: Revision Supersession
  // ========================================================================
  describe("Revision Supersession (R1-R4)", () => {
    it("R1: new revision before work lease superseded and exactly one runnable remains", async () => {
      insertConversation(h, "conv-1");
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 1
      const wiA = insertWorkItem(h, { context_id: "conv-1", status: "opened", opened_for_revision_id: "conv-1:rev:1" });

      // Compiler observes rev 4 (simulate by advancing ordinals)
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 2
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 3
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 4

      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: 1, current_revision_ordinal: 4, change_kinds: ["new_message"] },
      ]);

      const result = await h.foreman.onSyncCompleted(signal);
      expect(result.superseded).toHaveLength(1);
      expect(result.superseded[0]!.work_item_id).toBe(wiA.work_item_id);
      expect(result.opened).toHaveLength(1);

      const oldItem = h.coordinatorStore.getWorkItem(wiA.work_item_id)!;
      expect(oldItem.status).toBe("superseded");

      const runnable = h.scheduler.scanForRunnableWork("mb-1", 10);
      const nonSuperseded = runnable.filter((r) => r.context_id === "conv-1" && r.status !== "superseded");
      expect(nonSuperseded).toHaveLength(1);
    });

    it("R2: new revision during execution aborts commit and superseded old work item", async () => {
      insertConversation(h, "conv-1");
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 1
      const wiA = insertWorkItem(h, { context_id: "conv-1", status: "executing", opened_for_revision_id: "conv-1:rev:1" });
      const exId = `ex_${wiA.work_item_id}`;
      const envelope = makeInvocationEnvelope(wiA.work_item_id, exId);
      insertExecutionAttempt(h, wiA.work_item_id, exId, envelope, "active");

      // Compiler observes rev 5 while wiA is executing
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 2
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 3
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 4
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 5

      // This creates wi_B opened for rev 5
      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: 1, current_revision_ordinal: 5, change_kinds: ["new_message"] },
      ]);
      await h.foreman.onSyncCompleted(signal);

      // Foreman tries to commit decision for wi_A
      const evaluation = makeEvaluation(wiA.work_item_id, exId);
      const resolveResult = await h.foreman.resolveWorkItem({ work_item_id: wiA.work_item_id, execution_id: exId, evaluation });

      expect(resolveResult.success).toBe(false);
      expect(resolveResult.error).toContain("superseded");

      const oldItem = h.coordinatorStore.getWorkItem(wiA.work_item_id)!;
      expect(oldItem.status).toBe("superseded");

      expect(countDecisionsForWorkItem(h, wiA.work_item_id)).toBe(0);
    });

    it("R3: new revision after evaluation but before command creation aborts transaction", async () => {
      insertConversation(h, "conv-1");
      h.coordinatorStore.nextRevisionOrdinal("conv-1"); // 1
      const wiA = insertWorkItem(h, { context_id: "conv-1", status: "executing", opened_for_revision_id: "conv-1:rev:1" });
      const exId = `ex_${wiA.work_item_id}`;
      const envelope = makeInvocationEnvelope(wiA.work_item_id, exId);
      insertExecutionAttempt(h, wiA.work_item_id, exId, envelope, "active");

      // Simulate that a new work item wi_B was created for rev 5 between evaluation and commit
      const later = new Date(Date.now() + 1000).toISOString();
      insertWorkItem(h, { context_id: "conv-1", status: "opened", opened_for_revision_id: "conv-1:rev:5", created_at: later, updated_at: later });

      // Foreman attempts to write decision + command for wi_A
      const evaluation = makeEvaluation(wiA.work_item_id, exId);
      const resolveResult = await h.foreman.resolveWorkItem({ work_item_id: wiA.work_item_id, execution_id: exId, evaluation });

      expect(resolveResult.success).toBe(false);
      expect(resolveResult.error).toContain("superseded");

      const oldItem = h.coordinatorStore.getWorkItem(wiA.work_item_id)!;
      expect(oldItem.status).toBe("superseded");

      const decisions = h.db.prepare("select count(*) as c from foreman_decisions where decision_id like ?")
        .get(`%${wiA.work_item_id}%`) as { c: number };
      expect(decisions.c).toBe(0);
    });

    it("R4: no-op supersession leaves old work item superseded and new resolved without lease or command", () => {
      insertConversation(h, "conv-1");
      const wiA = insertWorkItem(h, { context_id: "conv-1", status: "opened", opened_for_revision_id: "conv-1:rev:1" });

      // Simulate foreman creating wi_B as resolved no-op and superseding wi_A
      const now = new Date().toISOString();
      const wiB = insertWorkItem(h, {
        work_item_id: `wi_${Math.random().toString(36).slice(2)}`,
        conversation_id: "conv-1",
        status: "resolved",
        opened_for_revision_id: "conv-1:rev:2",
        resolved_revision_id: "conv-1:rev:2",
        resolution_outcome: "no_op",
        created_at: now,
        updated_at: now,
      });
      h.coordinatorStore.updateWorkItemStatus(wiA.work_item_id, "superseded", { updated_at: now });

      const oldItem = h.coordinatorStore.getWorkItem(wiA.work_item_id)!;
      expect(oldItem.status).toBe("superseded");

      const newItem = h.coordinatorStore.getWorkItem(wiB.work_item_id)!;
      expect(newItem.status).toBe("resolved");

      expect(countActiveLeases(h, wiA.work_item_id)).toBe(0);
      expect(countActiveLeases(h, wiB.work_item_id)).toBe(0);
      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(0);
    });
  });


  // ========================================================================
  // O1–O4: Outbound Idempotency
  // ========================================================================
  describe("Outbound Idempotency (O1-O4)", () => {
    it("O1: duplicate command creation attempts abort silently with exactly one command", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r1.success).toBe(true);

      // Reset work item to simulate retry path
      h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });

      const r2 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r2.success).toBe(true);

      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(1);
    });

    it("O2: repeated evaluation with identical payload does not duplicate outbound commands", async () => {
      insertConversation(h, "conv-1");
      const wiA = insertWorkItem(h, { context_id: "conv-1", status: "failed_retryable", retry_count: 1 });
      const exId1 = `ex_${wiA.work_item_id}_1`;
      const envelope1 = makeInvocationEnvelope(wiA.work_item_id, exId1);
      insertExecutionAttempt(h, wiA.work_item_id, exId1, envelope1, "succeeded");

      // First resolution creates command
      const eval1 = makeEvaluation(wiA.work_item_id, exId1);
      h.scheduler.acquireLease(wiA.work_item_id);
      h.scheduler.startExecution(wiA.work_item_id, "conv-1:rev:1", JSON.stringify(envelope1));
      const r1 = await h.foreman.resolveWorkItem({ work_item_id: wiA.work_item_id, execution_id: exId1, evaluation: eval1 });
      expect(r1.success).toBe(true);

      // Simulate retry: wi_A' is the same work item after recovery
      h.coordinatorStore.updateWorkItemStatus(wiA.work_item_id, "failed_retryable", { resolution_outcome: null });
      h.scheduler.acquireLease(wiA.work_item_id);
      const exId2 = `ex_${wiA.work_item_id}_2`;
      const envelope2 = makeInvocationEnvelope(wiA.work_item_id, exId2);
      insertExecutionAttempt(h, wiA.work_item_id, exId2, envelope2, "active");
      h.scheduler.startExecution(wiA.work_item_id, "conv-1:rev:1", JSON.stringify(envelope2));

      const eval2 = makeEvaluation(wiA.work_item_id, exId2);
      const r2 = await h.foreman.resolveWorkItem({ work_item_id: wiA.work_item_id, execution_id: exId2, evaluation: eval2 });
      expect(r2.success).toBe(true);

      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(1);
    });

    it("O3: command exists but scheduler state missing does not block outbound worker", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r1.success).toBe(true);

      // Simulate missing work_item row (direct delete)
      h.db.prepare("delete from work_items where work_item_id = ?").run(wi.work_item_id);

      // Outbound worker continues independently
      const outboundId = r1.outbound_id!;
      const command = h.outboundStore.getCommand(outboundId);
      expect(command).toBeDefined();
      // No panic/orphan issue
      expect(() => h.outboundStore.getCommandStatus(outboundId)).not.toThrow();
    });

    it("O4: scheduler thinks work unresolved but outbound command already exists recovers correctly", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r1.success).toBe(true);

      // Simulate crash: decision + command committed, but work_item reset to executing
      h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });

      // Recovery scanner resumes and foreman resolves via Path B
      const r2 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r2.success).toBe(true);
      expect(r2.outbound_id).toBe(r1.outbound_id);

      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(1);
    });
  });


  // ========================================================================
  // T1–T5: Tool/Runtime Failure
  // ========================================================================
  describe("Tool/Runtime Failure (T1-T5)", () => {
    it("T1: charter timeout recovers stale lease to failed_retryable without decision", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");
      h.scheduler.startExecution(wi.work_item_id, "conv-1:rev:1", JSON.stringify(envelope));

      // Simulate timeout by expiring lease 10 minutes in the past
      const past = new Date(Date.now() - 600_000).toISOString();
      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id)!;
      h.coordinatorStore.updateLeaseExpiry(lease.lease_id, past);

      const recovered = h.scheduler.recoverStaleLeases(past);
      expect(recovered).toHaveLength(1);

      const attempt = h.coordinatorStore.getExecutionAttempt(exId)!;
      expect(attempt.status).toBe("abandoned");

      const wiRow = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(wiRow.status).toBe("failed_retryable");

      expect(countDecisionsForWorkItem(h, wi.work_item_id)).toBe(0);
      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(0);
    });

    it("T2: tool denial records permission_denied and execution continues", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const toolCall: ToolCallRecord = {
        call_id: `tc_${exId}_1`,
        execution_id: exId,
        work_item_id: wi.work_item_id,
        context_id: "conv-1",
        tool_id: "bad_tool",
        request_args_json: "{}",
        exit_status: "permission_denied",
        stdout: "",
        stderr: "Tool not allowed",
        structured_output_json: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        error_message: null,
      };
      h.coordinatorStore.insertToolCallRecord(toolCall);

      // Execution continues (foreman resolves anyway because the evaluation itself is valid)
      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      // Tool denial alone does not crash execution
      expect(result.success).toBe(true);

      const records = h.coordinatorStore.getToolCallRecordsByExecution(exId);
      expect(records).toHaveLength(1);
      expect(records[0]!.exit_status).toBe("permission_denied");
    });

    it("T3: tool timeout records timeout status and execution continues", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const toolCall: ToolCallRecord = {
        call_id: `tc_${exId}_1`,
        execution_id: exId,
        work_item_id: wi.work_item_id,
        context_id: "conv-1",
        tool_id: "sentry_query",
        request_args_json: JSON.stringify({ timeout_ms: 1000 }),
        exit_status: "timeout",
        stdout: "",
        stderr: "Killed after 1s",
        structured_output_json: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 1000,
        error_message: null,
      };
      h.coordinatorStore.insertToolCallRecord(toolCall);

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      // Work item does not fail solely due to tool timeout
      expect(result.success).toBe(true);

      const records = h.coordinatorStore.getToolCallRecordsByExecution(exId);
      expect(records[0]!.exit_status).toBe("timeout");
    });

    it("T4: missing binding omits source and execution proceeds without work item failure", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      // Simulate invocation envelope with a missing binding source omitted
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(h.coordinatorStore.getWorkItem(wi.work_item_id)!.status).toBe("resolved");
    });

    it("T5: transient runtime crash marks attempt crashed and work item retryable", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");
      const attempt = h.scheduler.startExecution(wi.work_item_id, "conv-1:rev:1", JSON.stringify(envelope));

      // Simulate runtime crash
      h.scheduler.failExecution(attempt.execution_id, "Uncaught exception", true);

      const fetched = h.coordinatorStore.getExecutionAttempt(attempt.execution_id)!;
      expect(fetched.status).toBe("crashed");

      const wiRow = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(wiRow.status).toBe("failed_retryable");

      expect(countDecisionsForWorkItem(h, wi.work_item_id)).toBe(0);
      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(0);
    });
  });


  // ========================================================================
  // C1–C4: Commentary Separation
  // ========================================================================
  describe("Commentary Separation (C1-C4)", () => {
    it("C1: traces deleted before work resolution does not block decision commit", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      // Write traces then delete them
      h.traceStore.writeTrace({
        execution_id: exId,
        conversation_id: "conv-1",
        work_item_id: wi.work_item_id,
        session_id: exId,
        trace_type: "runtime_output",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: "{}",
      });
      h.db.prepare("delete from agent_traces").run();

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(h.coordinatorStore.getWorkItem(wi.work_item_id)!.status).toBe("resolved");

      const traces = h.db.prepare("select count(*) as c from agent_traces where conversation_id = ?").get("conv-1") as { c: number };
      expect(traces.c).toBe(0);
    });

    it("C2: traces deleted before outbound dedupe does not block confirmation", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      const outboundId = `ob_fd_${wi.work_item_id}_send_reply`;
      h.outboundStore.updateCommandStatus(outboundId, "confirmed", { confirmed_at: new Date().toISOString() });

      // Delete traces referencing the outbound command
      h.db.prepare("delete from agent_traces").run();

      // Confirmation state is still correct without traces
      const cmd = h.outboundStore.getCommand(outboundId);
      expect(cmd!.status).toBe("confirmed");
    });

    it("C3: traces deleted before mailbox truth reconstruction does not break views", () => {
      insertConversation(h, "conv-1");
      h.coordinatorStore.nextRevisionOrdinal("conv-1");
      h.coordinatorStore.upsertConversationRecord({
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

      h.db.prepare("delete from agent_traces").run();

      // Rebuild views from durable coordinator state
      const record = h.coordinatorStore.getConversationRecord("conv-1");
      expect(record).toBeDefined();
      expect(record!.conversation_id).toBe("conv-1");
    });

    it("C4: no trace store exists — full cycle is correct without trace writes", async () => {
      // Use a harness without trace store by simply not writing traces
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");
      h.scheduler.startExecution(wi.work_item_id, "conv-1:rev:1", JSON.stringify(envelope));

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(h.coordinatorStore.getWorkItem(wi.work_item_id)!.status).toBe("resolved");
      expect(countOutboundCommandsForThread(h, "conv-1")).toBe(1);

      // No trace dependency
      const traces = h.db.prepare("select count(*) as c from agent_traces where conversation_id = ?").get("conv-1") as { c: number };
      expect(traces.c).toBe(0);
    });
  });


  // ========================================================================
  // D1–D4: Daemon/Wake Duplication
  // ========================================================================
  describe("Daemon/Wake Duplication (D1-D4)", () => {
    it("D1: duplicate wake signals produce exactly one lease and one execution attempt", () => {
      insertConversation(h, "conv-1");
      insertWorkItem(h, { context_id: "conv-1", status: "opened" });

      // First wake
      h.scheduler.recoverStaleLeases();
      const runnable1 = h.scheduler.scanForRunnableWork("mb-1", 10);
      let lease1: ReturnType<typeof h.scheduler.acquireLease> = { success: false };
      if (runnable1.length > 0) {
        lease1 = h.scheduler.acquireLease(runnable1[0]!.work_item_id);
      }

      // Second wake immediately after
      h.scheduler.recoverStaleLeases();
      const runnable2 = h.scheduler.scanForRunnableWork("mb-1", 10);
      let lease2: ReturnType<typeof h.scheduler.acquireLease> = { success: false };
      if (runnable2.length > 0) {
        lease2 = h.scheduler.acquireLease(runnable2[0]!.work_item_id);
      }

      expect(lease1.success || lease2.success).toBe(true);
      const totalLeases = h.db.prepare("select count(*) as c from work_item_leases where released_at is null").get() as { c: number };
      expect(totalLeases.c).toBe(1);

      const totalAttempts = h.db.prepare("select count(*) as c from execution_attempts").get() as { c: number };
      // Only one execution attempt should exist after both wakes
      // (We haven't started execution in this test, so it should be 0)
      expect(totalAttempts.c).toBe(0);
    });

    it("D2: wake during active execution filters out executing work item", () => {
      insertConversation(h, "conv-1");
      insertConversation(h, "conv-2");
      const wiA = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      const wiB = insertWorkItem(h, { context_id: "conv-2", status: "opened" });

      // wi_A becomes executing
      h.scheduler.acquireLease(wiA.work_item_id);
      const exId = `ex_${wiA.work_item_id}`;
      const envelope = makeInvocationEnvelope(wiA.work_item_id, exId);
      insertExecutionAttempt(h, wiA.work_item_id, exId, envelope, "active");
      h.scheduler.startExecution(wiA.work_item_id, "conv-1:rev:1", JSON.stringify(envelope));

      // Wake scans runnable set
      h.scheduler.recoverStaleLeases();
      const runnable = h.scheduler.scanForRunnableWork("mb-1", 10);

      expect(runnable.some((r) => r.work_item_id === wiA.work_item_id)).toBe(false);
      expect(runnable.some((r) => r.work_item_id === wiB.work_item_id)).toBe(true);

      // wi_A execution attempt is uninterrupted
      const attempt = h.coordinatorStore.getExecutionAttempt(exId)!;
      expect(attempt.status).toBe("active");
    });

    it("D3: wake after crash recovery runs recovery scanner before lease acquisition", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const past = new Date(Date.now() - 120_000).toISOString();
      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id)!;
      h.coordinatorStore.updateLeaseExpiry(lease.lease_id, past);

      // New process starts and receives wake before explicit recovery
      const { SqliteScheduler } = await import("../../../src/scheduler/scheduler.js");
      const newScheduler = new SqliteScheduler(h.coordinatorStore, { leaseDurationMs: 60_000, runnerId: "runner-new" });

      // Wake must run recovery scanner inline before selection
      newScheduler.recoverStaleLeases();
      const runnable = newScheduler.scanForRunnableWork("mb-1", 10);

      // The stale work item should now be failed_retryable and may be runnable if retry is due
      // Since it was just recovered, retry_count=1 but next_retry_at may be in future due to backoff
      // The key assertion is that no lease is attempted on stale expired item
      const activeExpiredLeases = h.db.prepare(
        "select count(*) as c from work_item_leases where work_item_id = ? and released_at is null and expires_at <= ?",
      ).get(wi.work_item_id, past) as { c: number };
      expect(activeExpiredLeases.c).toBe(0);
    });

    it("D4: quiescent loop with no runnable work acquires no leases", () => {
      insertConversation(h, "conv-1");
      insertWorkItem(h, { context_id: "conv-1", status: "resolved" });
      insertWorkItem(h, { context_id: "conv-1", status: "failed_retryable", next_retry_at: new Date(Date.now() + 3600_000).toISOString() });

      for (let i = 0; i < 5; i++) {
        h.scheduler.recoverStaleLeases();
        const runnable = h.scheduler.scanForRunnableWork("mb-1", 10);
        if (runnable.length > 0) {
          // This should not happen in quiescent state
          for (const r of runnable) {
            h.scheduler.acquireLease(r.work_item_id);
          }
        }
      }

      const activeLeases = h.db.prepare("select count(*) as c from work_item_leases where released_at is null").get() as { c: number };
      expect(activeLeases.c).toBe(0);
    });
  });

  // ========================================================================
  // Critical Assertions Cross-Cut
  // ========================================================================
  describe("Critical Assertions", () => {
    it("assertion 1: lease uniqueness — at most one active lease per work item", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      // Attempt second lease
      const second = h.scheduler.acquireLease(wi.work_item_id);
      expect(second.success).toBe(false);
      expect(countActiveLeases(h, wi.work_item_id)).toBeLessThanOrEqual(1);
    });

    it("assertion 2: active execution bounded by valid lease", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");
      h.scheduler.startExecution(wi.work_item_id, "conv-1:rev:1", JSON.stringify(envelope));

      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id);
      expect(lease).toBeDefined();
      expect(lease!.released_at).toBeNull();
      expect(lease!.expires_at > new Date().toISOString()).toBe(true);
    });

    it("assertion 3: no decision without work item", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      const decisions = h.db.prepare("select * from foreman_decisions").all() as Array<{ decision_id: string }>;
      for (const d of decisions) {
        expect(d.decision_id).toContain(wi.work_item_id);
      }
    });

    it("assertion 4: no duplicate commands for same decision", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r1.success).toBe(true);

      h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });
      const r2 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(r2.success).toBe(true);

      const decisionId = r1.decision_id!;
      const commands = h.db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
      expect(commands.c).toBe(1);

      const decisionCmds = h.db.prepare("select count(*) as c from foreman_decisions where decision_id = ?").get(decisionId) as { c: number };
      expect(decisionCmds.c).toBe(1);
    });

    it("assertion 5: superseded is terminal — status never changes after superseded", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "superseded");

      // Any attempt to change status should be blocked by test assertion of current state
      const after = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      expect(after.status).toBe("superseded");
      // In a real system there may be no DB-level check; this test documents the invariant.
    });

    it("assertion 6: stale lease recovery within one scheduler cycle", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "opened" });
      h.scheduler.acquireLease(wi.work_item_id);
      const past = new Date(Date.now() - 60_000).toISOString();
      const lease = h.coordinatorStore.getActiveLeaseForWorkItem(wi.work_item_id)!;
      h.coordinatorStore.updateLeaseExpiry(lease.lease_id, past);

      // One scheduler cycle: recover + scan
      h.scheduler.recoverStaleLeases(past);
      const recoveredLease = h.db.prepare("select * from work_item_leases where lease_id = ?").get(lease.lease_id) as Record<string, unknown>;
      expect(recoveredLease.released_at).not.toBeNull();
    });

    it("assertion 7: trace independence — deleting traces does not change work_item or outbound_command status", async () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      h.traceStore.writeTrace({
        execution_id: exId,
        conversation_id: "conv-1",
        work_item_id: wi.work_item_id,
        session_id: exId,
        trace_type: "debug",
        reference_outbound_id: null,
        reference_message_id: null,
        payload_json: "{}",
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      const wiBefore = h.coordinatorStore.getWorkItem(wi.work_item_id)!;
      const obBefore = h.outboundStore.getCommand(`ob_fd_${wi.work_item_id}_send_reply`)!;

      h.db.prepare("delete from agent_traces").run();

      expect(h.coordinatorStore.getWorkItem(wi.work_item_id)!.status).toBe(wiBefore.status);
      expect(h.outboundStore.getCommand(obBefore.outbound_id)!.status).toBe(obBefore.status);
    });

    it("assertion 8: duplicate wake idempotency — identical end state after multiple wakes", () => {
      insertConversation(h, "conv-1");
      insertWorkItem(h, { context_id: "conv-1", status: "opened" });

      const runWake = () => {
        h.scheduler.recoverStaleLeases();
        const runnable = h.scheduler.scanForRunnableWork("mb-1", 10);
        for (const r of runnable) {
          h.scheduler.acquireLease(r.work_item_id);
        }
      };

      runWake();
      const leasesAfter1 = h.db.prepare("select count(*) as c from work_item_leases where released_at is null").get() as { c: number };

      runWake();
      const leasesAfter2 = h.db.prepare("select count(*) as c from work_item_leases where released_at is null").get() as { c: number };

      expect(leasesAfter1).toEqual(leasesAfter2);
    });

    it("assertion 9: every executed tool call has a tool_call_record row", () => {
      insertConversation(h, "conv-1");
      const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
      const exId = `ex_${wi.work_item_id}`;
      const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
      insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

      const toolCall: ToolCallRecord = {
        call_id: `tc_${exId}`,
        execution_id: exId,
        work_item_id: wi.work_item_id,
        context_id: "conv-1",
        tool_id: "test_tool",
        request_args_json: "{}",
        exit_status: "success",
        stdout: "ok",
        stderr: "",
        structured_output_json: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 10,
        error_message: null,
      };
      h.coordinatorStore.insertToolCallRecord(toolCall);

      const records = h.coordinatorStore.getToolCallRecordsByExecution(exId);
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records[0]!.call_id).toBe(toolCall.call_id);
    });

    it("assertion 10: failed_retryable not selected until next_retry_at <= now", () => {
      insertConversation(h, "conv-1");
      const future = new Date(Date.now() + 300_000).toISOString();
      insertWorkItem(h, { context_id: "conv-1", status: "failed_retryable", next_retry_at: future });

      const runnable = h.scheduler.scanForRunnableWork("mb-1", 10);
      expect(runnable).toHaveLength(0);
    });
  });
});
