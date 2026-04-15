import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { DefaultForemanFacade } from "../../../src/foreman/facade.js";
import type { SyncCompletionSignal, EvaluationEnvelope } from "../../../src/foreman/types.js";
import type { WorkItem } from "../../../src/coordinator/types.js";
import type { RuntimePolicy } from "../../../src/config/types.js";

function makeRuntimePolicy(overrides?: Partial<RuntimePolicy>): RuntimePolicy {
  return {
    primary_charter: "support_steward",
    allowed_actions: ["draft_reply", "send_reply", "mark_read", "no_action"],
    ...overrides,
  };
}

describe("DefaultForemanFacade", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let facade: DefaultForemanFacade;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore = new SqliteIntentStore({ db });
    intentStore.initSchema();
    facade = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => makeRuntimePolicy(),
    });
  });

  afterEach(() => {
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  function makeSignal(changed: SyncCompletionSignal["changed_conversations"]): SyncCompletionSignal {
    return {
      signal_id: "sn-1",
      mailbox_id: "mb-1",
      synced_at: new Date().toISOString(),
      changed_conversations: changed,
    };
  }

  function insertConversation(conversationId: string, mailboxId: string = "mb-1"): void {
    coordinatorStore.upsertConversationRecord({
      conversation_id: conversationId,
      mailbox_id: mailboxId,
      primary_charter: "support_steward",
      secondary_charters_json: "[]",
      status: "active",
      assigned_agent: null,
      last_message_at: null,
      last_inbound_at: null,
      last_outbound_at: null,
      last_analyzed_at: null,
      last_triaged_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  function insertWorkItem(
    conversationId: string,
    status: WorkItem["status"],
    openedForRevisionId: string,
  ): WorkItem {
    const item: WorkItem = {
      work_item_id: `wi_${conversationId}_${Date.now()}`,
      conversation_id: conversationId,
      mailbox_id: "mb-1",
      status,
      priority: 0,
      opened_for_revision_id: openedForRevisionId,
      resolved_revision_id: null,
      resolution_outcome: null,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    coordinatorStore.insertWorkItem(item);
    return item;
  }

  function insertExecutionAttempt(
    workItemId: string,
    executionId: string,
    envelope: Record<string, unknown>,
    status = "succeeded",
  ): void {
    coordinatorStore.insertExecutionAttempt({
      execution_id: executionId,
      work_item_id: workItemId,
      revision_id: "rev-1",
      session_id: null,
      status: status as any,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      runtime_envelope_json: JSON.stringify(envelope),
      outcome_json: null,
      error_message: null,
    });
  }

  function makeEvaluation(
    workItemId: string,
    executionId: string,
    overrides?: Partial<EvaluationEnvelope>,
  ): EvaluationEnvelope {
    return {
      evaluation_id: `eval_${executionId}`,
      execution_id: executionId,
      work_item_id: workItemId,
      conversation_id: "conv-1",
      charter_id: "support_steward",
      role: "primary",
      output_version: "2.0",
      analyzed_at: new Date().toISOString(),
      outcome: "complete",
      confidence: { overall: "high", uncertainty_flags: [] },
      summary: "test",
      classifications: [],
      facts: [],
      proposed_actions: [
        { action_type: "send_reply", authority: "recommended", payload_json: JSON.stringify({ to: ["a@b.com"], body_text: "Hello", subject: "Hi" }), rationale: "" },
      ],
      tool_requests: [],
      escalations: [],
      ...overrides,
    };
  }

  describe("onSyncCompleted", () => {
    it("opens a new work item and session for a changed conversation", async () => {
      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: null, current_revision_ordinal: 1, change_kinds: ["new_message"] },
      ]);

      const result = await facade.onSyncCompleted(signal);

      expect(result.opened).toHaveLength(1);
      expect(result.opened[0]!.conversation_id).toBe("conv-1");
      expect(result.nooped).toHaveLength(0);

      const record = coordinatorStore.getConversationRecord("conv-1");
      expect(record).toBeDefined();

      const active = coordinatorStore.getActiveWorkItemForConversation("conv-1");
      expect(active).toBeDefined();
      expect(active!.status).toBe("opened");

      const session = coordinatorStore.getSessionForWorkItem(active!.work_item_id);
      expect(session).toBeDefined();
      expect(session!.status).toBe("opened");
      expect(session!.conversation_id).toBe("conv-1");
    });

    it("no-ops when change is only draft_observed", async () => {
      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: null, current_revision_ordinal: 1, change_kinds: ["draft_observed"] },
      ]);

      const result = await facade.onSyncCompleted(signal);

      expect(result.opened).toHaveLength(0);
      expect(result.nooped).toContain("conv-1");
    });

    it("supersedes an opened work item and session when new message arrives with higher revision", async () => {
      insertConversation("conv-1");
      coordinatorStore.nextRevisionOrdinal("conv-1"); // ordinal 1
      const existing = insertWorkItem("conv-1", "opened", "conv-1:rev:1");
      coordinatorStore.insertAgentSession({
        session_id: "sess-old",
        conversation_id: "conv-1",
        work_item_id: existing.work_item_id,
        started_at: new Date().toISOString(),
        ended_at: null,
        updated_at: new Date().toISOString(),
        status: "opened",
        resume_hint: null,
      });

      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: 1, current_revision_ordinal: 2, change_kinds: ["new_message"] },
      ]);

      const result = await facade.onSyncCompleted(signal);

      expect(result.superseded).toHaveLength(1);
      expect(result.superseded[0]!.work_item_id).toBe(existing.work_item_id);
      expect(result.opened).toHaveLength(1);

      const oldItem = coordinatorStore.getWorkItem(existing.work_item_id);
      expect(oldItem!.status).toBe("superseded");

      const oldSession = coordinatorStore.getSessionForWorkItem(existing.work_item_id);
      expect(oldSession).toBeDefined();
      expect(oldSession!.status).toBe("superseded");

      const newItem = coordinatorStore.getWorkItem(result.opened[0]!.work_item_id);
      const newSession = coordinatorStore.getSessionForWorkItem(newItem!.work_item_id);
      expect(newSession).toBeDefined();
      expect(newSession!.status).toBe("opened");
    });

    it("does not supersede a leased work item when revision is same", async () => {
      insertConversation("conv-1");
      coordinatorStore.nextRevisionOrdinal("conv-1"); // ordinal 1
      const existing = insertWorkItem("conv-1", "leased", "conv-1:rev:1");

      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: 1, current_revision_ordinal: 1, change_kinds: ["new_message"] },
      ]);

      const result = await facade.onSyncCompleted(signal);

      expect(result.superseded).toHaveLength(0);
      expect(result.nooped).toContain("conv-1");

      const item = coordinatorStore.getWorkItem(existing.work_item_id);
      expect(item!.status).toBe("leased");
    });
  });

  describe("resolveWorkItem", () => {
    it("resolves no_op outcome without creating command", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "executing", "conv-1:rev:1");
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply", "no_action"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId, { outcome: "no_op", proposed_actions: [] });
      const result = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe("no_op");

      const updated = coordinatorStore.getWorkItem(wi.work_item_id);
      expect(updated!.status).toBe("resolved");
      expect(updated!.resolution_outcome).toBe("no_op");
    });

    it("resolves escalation outcome with audit decision but no command", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "executing", "conv-1:rev:1");
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId, { outcome: "escalation", proposed_actions: [] });
      const result = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe("escalated");
      expect(result.decision_id).toBeDefined();
      expect(result.outbound_id).toBeUndefined();

      const decision = coordinatorStore.getDecisionById(result.decision_id!);
      expect(decision).toBeDefined();
      expect(decision!.outbound_id).toBeNull();
    });

    it("creates outbound command atomically on complete + valid action", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "executing", "conv-1:rev:1");
      coordinatorStore.insertAgentSession({
        session_id: "sess-exec",
        conversation_id: "conv-1",
        work_item_id: wi.work_item_id,
        started_at: new Date().toISOString(),
        ended_at: null,
        updated_at: new Date().toISOString(),
        status: "active",
        resume_hint: null,
      });
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe("action_created");
      expect(result.decision_id).toBeDefined();
      expect(result.outbound_id).toBeDefined();

      // Verify decision
      const decision = coordinatorStore.getDecisionById(result.decision_id!);
      expect(decision).toBeDefined();
      expect(decision!.outbound_id).toBe(result.outbound_id);

      // Verify command
      const command = outboundStore.getCommand(result.outbound_id!);
      expect(command).toBeDefined();
      expect(command!.status).toBe("pending");
      expect(command!.action_type).toBe("send_reply");

      // Verify work item resolved
      const updated = coordinatorStore.getWorkItem(wi.work_item_id);
      expect(updated!.status).toBe("resolved");

      // Verify session completed
      const session = coordinatorStore.getSessionForWorkItem(wi.work_item_id);
      expect(session).toBeDefined();
      expect(session!.status).toBe("completed");
    });

    it("is idempotent: skips command creation if decision already has outbound_id", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "executing", "conv-1:rev:1");
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId);

      // First resolution
      const result1 = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(result1.success).toBe(true);

      // Reset work item to executing to simulate retry
      coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing");

      // Second resolution with same evaluation
      const result2 = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(result2.success).toBe(true);

      // Should still resolve but not create a duplicate command
      const commands = db.prepare(`select count(*) as c from outbound_commands where conversation_id = ?`).get("conv-1") as { c: number };
      expect(commands.c).toBe(1);
    });

    it("idempotently returns success when work item is already resolved", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "resolved", "conv-1:rev:1");
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId);
      const result = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe(wi.resolution_outcome ?? "no_op");
    });

    it("strips invalid actions and resolves no_op when none remain", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "executing", "conv-1:rev:1");
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["mark_read"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId, {
        proposed_actions: [
          { action_type: "send_reply", authority: "recommended", payload_json: "{}", rationale: "" },
        ],
      });
      const result = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe("no_op");
    });

    it("recovers Path B: resolves work item when decision+command already exist", async () => {
      insertConversation("conv-1");
      const wi = insertWorkItem("conv-1", "executing", "conv-1:rev:1");
      const exId = `ex_${wi.work_item_id}`;
      insertExecutionAttempt(wi.work_item_id, exId, {
        execution_id: exId,
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const evaluation = makeEvaluation(wi.work_item_id, exId);

      // First resolution succeeds
      const result1 = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(result1.success).toBe(true);

      // Simulate crash: reset work item to executing (command and decision still exist)
      coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", {
        resolution_outcome: null,
      });

      const result2 = await facade.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
      expect(result2.success).toBe(true);
      expect(result2.resolution_outcome).toBe("action_created");
      expect(result2.outbound_id).toBe(result1.outbound_id);

      const commands = db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
      expect(commands.c).toBe(1);
    });
  });

  describe("supersession handling", () => {
    it("cancels pending commands for a conversation when its work item is superseded", async () => {
      insertConversation("conv-1");
      coordinatorStore.nextRevisionOrdinal("conv-1"); // ordinal 1
      const existing = insertWorkItem("conv-1", "opened", "conv-1:rev:1");

      // Pre-seed a pending outbound command for conv-1
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-001",
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

      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: 1, current_revision_ordinal: 2, change_kinds: ["new_message"] },
      ]);

      const result = await facade.onSyncCompleted(signal);

      expect(result.superseded).toHaveLength(1);
      expect(result.superseded[0]!.work_item_id).toBe(existing.work_item_id);

      const cmd = outboundStore.getCommand("ob-1");
      expect(cmd!.status).toBe("cancelled");
      expect(cmd!.terminal_reason).toBe("superseded_by_new_revision");
    });

    it("leaves sent/submitted commands alone during supersession", async () => {
      insertConversation("conv-1");
      coordinatorStore.nextRevisionOrdinal("conv-1"); // ordinal 1
      const existing = insertWorkItem("conv-1", "opened", "conv-1:rev:1");

      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "foreman",
          submitted_at: new Date().toISOString(),
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-001",
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

      const signal = makeSignal([
        { conversation_id: "conv-1", previous_revision_ordinal: 1, current_revision_ordinal: 2, change_kinds: ["new_message"] },
      ]);

      const result = await facade.onSyncCompleted(signal);
      expect(result.superseded).toHaveLength(1);

      const cmd = outboundStore.getCommand("ob-1");
      expect(cmd!.status).toBe("submitted");
    });
  });

  describe("policy routing", () => {
    it("creates conversation records using the configured primary charter", async () => {
      const policyFacade = new DefaultForemanFacade({
        coordinatorStore,
        outboundStore,
        intentStore,
        db,
        foremanId: "fm-test",
        getRuntimePolicy: () => makeRuntimePolicy({ primary_charter: "custom_charter" }),
      });
      const signal = makeSignal([
        { conversation_id: "conv-policy", previous_revision_ordinal: 0, current_revision_ordinal: 1, change_kinds: ["new_message"] },
      ]);
      await policyFacade.onSyncCompleted(signal);
      const record = coordinatorStore.getConversationRecord("conv-policy");
      expect(record).toBeDefined();
      expect(record!.primary_charter).toBe("custom_charter");
    });

    it("persists secondary charters from policy", async () => {
      const policyFacade = new DefaultForemanFacade({
        coordinatorStore,
        outboundStore,
        intentStore,
        db,
        foremanId: "fm-test",
        getRuntimePolicy: () => makeRuntimePolicy({ secondary_charters: ["helper_1", "helper_2"] }),
      });
      const signal = makeSignal([
        { conversation_id: "conv-secondary", previous_revision_ordinal: 0, current_revision_ordinal: 1, change_kinds: ["new_message"] },
      ]);
      await policyFacade.onSyncCompleted(signal);
      const record = coordinatorStore.getConversationRecord("conv-secondary");
      expect(record).toBeDefined();
      expect(JSON.parse(record!.secondary_charters_json)).toEqual(["helper_1", "helper_2"]);
    });

    it("records pending approval decision and does not create outbound command when approval is required", async () => {
      const policyFacade = new DefaultForemanFacade({
        coordinatorStore,
        outboundStore,
        intentStore,
        db,
        foremanId: "fm-test",
        getRuntimePolicy: () => makeRuntimePolicy({ require_human_approval: true }),
      });
      insertConversation("conv-approval");
      const workItem = insertWorkItem("conv-approval", "executing", "rev-1");
      const executionId = "ex-approval-1";
      insertExecutionAttempt(workItem.work_item_id, executionId, {
        execution_id: executionId,
        work_item_id: workItem.work_item_id,
        conversation_id: "conv-approval",
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const result = await policyFacade.resolveWorkItem({
        work_item_id: workItem.work_item_id,
        execution_id: executionId,
        evaluation: makeEvaluation(workItem.work_item_id, executionId, {
          proposed_actions: [{
            action_type: "send_reply",
            authority: "recommended",
            payload_json: JSON.stringify({ to: ["a@b.com"], body_text: "Hello" }),
            rationale: "",
          }],
        }),
      });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe("pending_approval");
      expect(result.decision_id).toBeDefined();
      expect(result.outbound_id).toBeUndefined();

      const decision = coordinatorStore.getDecisionById(result.decision_id!);
      expect(decision).toBeDefined();
      expect(decision!.outbound_id).toBeNull();

      const commands = db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-approval") as { c: number };
      expect(commands.c).toBe(0);

      const updated = coordinatorStore.getWorkItem(workItem.work_item_id);
      expect(updated!.status).toBe("resolved");
      expect(updated!.resolution_outcome).toBe("pending_approval");
    });

    it("rejects invalid payload before outbound handoff", async () => {
      insertConversation("conv-payload");
      const workItem = insertWorkItem("conv-payload", "executing", "rev-1");
      const executionId = "ex-payload-1";
      insertExecutionAttempt(workItem.work_item_id, executionId, {
        execution_id: executionId,
        work_item_id: workItem.work_item_id,
        conversation_id: "conv-payload",
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const result = await facade.resolveWorkItem({
        work_item_id: workItem.work_item_id,
        execution_id: executionId,
        evaluation: makeEvaluation(workItem.work_item_id, executionId, {
          proposed_actions: [{
            action_type: "send_reply",
            authority: "recommended",
            payload_json: JSON.stringify({ body_text: "Hello" }), // missing recipient
            rationale: "",
          }],
        }),
      });

      expect(result.success).toBe(false);
      expect(result.resolution_outcome).toBe("failed");
      expect(result.error).toMatch(/invalid payload/);

      const updated = coordinatorStore.getWorkItem(workItem.work_item_id);
      expect(updated!.status).toBe("failed_terminal");

      const commands = db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-payload") as { c: number };
      expect(commands.c).toBe(0);
    });

    it("downgrades low-confidence evaluation to escalation", async () => {
      insertConversation("conv-lowconf");
      const workItem = insertWorkItem("conv-lowconf", "executing", "rev-1");
      const executionId = "ex-lowconf-1";
      insertExecutionAttempt(workItem.work_item_id, executionId, {
        execution_id: executionId,
        work_item_id: workItem.work_item_id,
        conversation_id: "conv-lowconf",
        charter_id: "support_steward",
        role: "primary",
        allowed_actions: ["send_reply"],
        available_tools: [],
      });

      const result = await facade.resolveWorkItem({
        work_item_id: workItem.work_item_id,
        execution_id: executionId,
        evaluation: makeEvaluation(workItem.work_item_id, executionId, {
          confidence: { overall: "low", uncertainty_flags: [] },
          proposed_actions: [{
            action_type: "send_reply",
            authority: "recommended",
            payload_json: JSON.stringify({ to: ["a@b.com"], body_text: "Hello" }),
            rationale: "",
          }],
        }),
      });

      expect(result.success).toBe(true);
      expect(result.resolution_outcome).toBe("escalated");
      expect(result.decision_id).toBeDefined();

      const updated = coordinatorStore.getWorkItem(workItem.work_item_id);
      expect(updated!.status).toBe("resolved");
      expect(updated!.resolution_outcome).toBe("escalated");

      const commands = db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-lowconf") as { c: number };
      expect(commands.c).toBe(0);
    });
  });
});
