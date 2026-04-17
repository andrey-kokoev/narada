import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { IntentHandoff } from "../../../src/intent/handoff.js";
import type { ForemanDecisionRow, WorkItem } from "../../../src/coordinator/types.js";

describe("IntentHandoff", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let handoff: IntentHandoff;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();
    handoff = new IntentHandoff({ coordinatorStore, outboundStore, intentStore });

    coordinatorStore.upsertThread({
      conversation_id: "ctx-1",
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
    coordinatorStore.upsertConversationRecord({
      conversation_id: "ctx-1",
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

  afterEach(() => {
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  function makeDecision(overrides?: Partial<ForemanDecisionRow>): ForemanDecisionRow {
    const now = new Date().toISOString();
    return {
      decision_id: "fd-1",
      context_id: "ctx-1",
      scope_id: "mb-1",
      source_charter_ids_json: '["support_steward"]',
      approved_action: "send_reply",
      payload_json: JSON.stringify({ subject: "Hello", to: ["a@b.com"], body_text: "Hi" }),
      rationale: "test",
      decided_at: now,
      outbound_id: null,
      created_by: "foreman:fm-test/charter:support_steward",
      ...overrides,
    };
  }

  describe("admitIntentFromDecision", () => {
    it("admits an intent and creates an outbound command", () => {
      const decision = makeDecision();
      coordinatorStore.insertDecision(decision);

      const outboundId = db.transaction(() => handoff.admitIntentFromDecision(decision))();

      expect(outboundId).toBe("ob_fd-1");

      const intent = intentStore.getById(`int_${outboundId}`);
      // intent id is derived from idempotency key, not outbound_id
      // Let's just verify by idempotency key
      const byKey = intentStore.getByIdempotencyKey(
        db.prepare("select idempotency_key from outbound_commands where outbound_id = ?").pluck().get(outboundId) as string,
      );
      expect(byKey).toBeDefined();
      expect(byKey!.intent_type).toBe("mail.send_reply");
      expect(byKey!.executor_family).toBe("mail");
      expect(byKey!.target_id).toBe(outboundId);

      const cmd = outboundStore.getCommand(outboundId);
      expect(cmd).toBeDefined();
      expect(cmd!.status).toBe("pending");

      const updatedDecision = coordinatorStore.getDecisionById("fd-1");
      expect(updatedDecision!.outbound_id).toBe(outboundId);
    });

    it("is idempotent: returns existing outbound_id without duplicate intent or command", () => {
      const decision = makeDecision();
      coordinatorStore.insertDecision(decision);

      db.transaction(() => handoff.admitIntentFromDecision(decision))();
      const outboundId2 = db.transaction(() => handoff.admitIntentFromDecision(decision))();

      expect(outboundId2).toBe("ob_fd-1");

      const intentCount = (db.prepare("select count(*) as c from intents").get() as { c: number }).c;
      expect(intentCount).toBe(1);

      const cmdCount = (db.prepare("select count(*) as c from outbound_commands where outbound_id = ?").get("ob_fd-1") as { c: number }).c;
      expect(cmdCount).toBe(1);
    });

    it("returns existing outbound_id when decision already has outbound_id", () => {
      const decision = makeDecision({ outbound_id: "ob_fd-1" });
      coordinatorStore.insertDecision(decision);

      const outboundId = handoff.admitIntentFromDecision(decision);
      expect(outboundId).toBe("ob_fd-1");

      const cmdCount = (db.prepare("select count(*) as c from outbound_commands").get() as { c: number }).c;
      expect(cmdCount).toBe(0);
    });

    it("maps different action types to intent types", () => {
      const actions: Array<{ action: string; intentType: string }> = [
        { action: "send_reply", intentType: "mail.send_reply" },
        { action: "send_new_message", intentType: "mail.send_new_message" },
        { action: "mark_read", intentType: "mail.mark_read" },
        { action: "move_message", intentType: "mail.move_message" },
        { action: "draft_reply", intentType: "mail.draft_reply" },
        { action: "set_categories", intentType: "mail.set_categories" },
      ];

      for (const { action, intentType } of actions) {
        const decision = makeDecision({
          decision_id: `fd-${action}`,
          approved_action: action as ForemanDecisionRow["approved_action"],
          payload_json: JSON.stringify({ target_message_id: "m1" }),
        });
        coordinatorStore.insertDecision(decision);

        const outboundId = db.transaction(() => handoff.admitIntentFromDecision(decision))();
        expect(outboundId).toBeDefined();

        const key = db.prepare("select idempotency_key from outbound_commands where outbound_id = ?").pluck().get(outboundId) as string;
        const intent = intentStore.getByIdempotencyKey(key);
        expect(intent).toBeDefined();
        expect(intent!.intent_type).toBe(intentType);
      }
    });
  });

  describe("cancelUnsentCommandsForContext", () => {
    it("cancels pending commands and their associated admitted intents", () => {
      const decision = makeDecision();
      coordinatorStore.insertDecision(decision);
      db.transaction(() => handoff.admitIntentFromDecision(decision))();

      // Mark intent as admitted without target to test cancellation path
      intentStore.updateStatus("int_", "admitted", { target_id: null });
      // Actually the intent will have target_id set by admitIntentFromDecision.
      // Create another intent manually for testing the pending-intent cancellation.
      intentStore.admit({
        intent_id: "int-pending",
        intent_type: "mail.mark_read",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "pending-key",
        status: "admitted",
        context_id: "ctx-1",
        target_id: null,
        terminal_reason: null,
      });

      const cancelled = handoff.cancelUnsentCommandsForContext("ctx-1", "superseded");
      expect(cancelled).toBe(1);

      const cmd = outboundStore.getCommand("ob_fd-1");
      expect(cmd!.status).toBe("cancelled");

      const pendingIntent = intentStore.getById("int-pending")!;
      expect(pendingIntent.status).toBe("cancelled");
      expect(pendingIntent.terminal_reason).toBe("superseded");
    });
  });

  describe("recoverWorkItemIfCommandExists", () => {
    it("returns null when no materialized decision exists", () => {
      const result = handoff.recoverWorkItemIfCommandExists("wi-1", "ctx-1", "mb-1");
      expect(result).toBeNull();
    });

    it("resolves work item when command exists (Path B)", () => {
      coordinatorStore.insertWorkItem({
        work_item_id: "wi-1",
        context_id: "ctx-1",
        scope_id: "mb-1",
        status: "executing",
        priority: 0,
        opened_for_revision_id: "rev-1",
        resolved_revision_id: null,
        resolution_outcome: null,
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const decision = makeDecision({ decision_id: "fd_wi-1_send_reply", outbound_id: "ob_fd-1" });
      coordinatorStore.insertDecision(decision);
      outboundStore.createCommand(
        {
          outbound_id: "ob_fd-1",
          conversation_id: "ctx-1",
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
          outbound_id: "ob_fd-1",
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

      const result = handoff.recoverWorkItemIfCommandExists("wi-1", "ctx-1", "mb-1");
      expect(result).toBe("ob_fd-1");

      const workItem = coordinatorStore.getWorkItem("wi-1");
      expect(workItem!.status).toBe("resolved");
      expect(workItem!.resolution_outcome).toBe("action_created");
    });
  });
});
