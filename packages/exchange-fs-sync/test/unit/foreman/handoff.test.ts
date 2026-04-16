import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { OutboundHandoff } from "../../../src/foreman/handoff.js";
import type { ForemanDecisionRow, WorkItem } from "../../../src/coordinator/types.js";

describe("OutboundHandoff", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let handoff: OutboundHandoff;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    handoff = new OutboundHandoff({ coordinatorStore, outboundStore });

    // Seed thread and conversation records so foreign keys are satisfied
    coordinatorStore.upsertThread({
      conversation_id: "thread-1",
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
      conversation_id: "thread-1",
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
    coordinatorStore.close();
    db.close();
  });

  function insertWorkItem(overrides?: Partial<WorkItem>): WorkItem {
    const item: WorkItem = {
      work_item_id: "wi-1",
      context_id: "thread-1",
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
      ...overrides,
    };
    coordinatorStore.insertWorkItem(item);
    return item;
  }

  function makeDecision(overrides?: Partial<ForemanDecisionRow>): ForemanDecisionRow {
    const now = new Date().toISOString();
    return {
      decision_id: "fd-1",
      conversation_id: "thread-1",
      mailbox_id: "mb-1",
      source_charter_ids_json: '["support_steward"]',
      approved_action: "send_reply",
      payload_json: JSON.stringify({ subject: "Hello" }),
      rationale: "test",
      decided_at: now,
      outbound_id: null,
      created_by: "foreman:fm-test/charter:support_steward",
      ...overrides,
    };
  }

  describe("createCommandFromDecision", () => {
    it("creates an outbound command and links the decision", () => {
      const decision = makeDecision();
      coordinatorStore.insertDecision(decision);

      db.transaction(() => {
        const outboundId = handoff.createCommandFromDecision(decision);
        expect(outboundId).toBe("ob_fd-1");
      })();

      const cmd = outboundStore.getCommand("ob_fd-1");
      expect(cmd).toBeDefined();
      expect(cmd!.status).toBe("pending");
      expect(cmd!.action_type).toBe("send_reply");

      const updatedDecision = coordinatorStore.getDecisionById("fd-1");
      expect(updatedDecision!.outbound_id).toBe("ob_fd-1");
    });

    it("is idempotent: returns existing outbound_id without creating a duplicate", () => {
      const decision = makeDecision();
      coordinatorStore.insertDecision(decision);

      db.transaction(() => {
        handoff.createCommandFromDecision(decision);
      })();

      db.transaction(() => {
        const outboundId = handoff.createCommandFromDecision(decision);
        expect(outboundId).toBe("ob_fd-1");
      })();

      const count = (db.prepare("select count(*) as c from outbound_commands where outbound_id = ?").get("ob_fd-1") as { c: number }).c;
      expect(count).toBe(1);
    });

    it("handles unique-constraint collision gracefully on partial retry", () => {
      const decision = makeDecision();
      coordinatorStore.insertDecision(decision);

      // First call creates the command
      db.transaction(() => {
        handoff.createCommandFromDecision(decision);
      })();

      // Mark the command terminal so the active-unsent check passes on retry
      outboundStore.updateCommandStatus("ob_fd-1", "confirmed", { confirmed_at: new Date().toISOString() });

      // Simulate partial retry: decision row unlinked (should not happen in practice,
      // but verifies robustness against duplicate outbound_id creation)
      coordinatorStore.linkDecisionToOutbound("fd-1", null as unknown as string);

      db.transaction(() => {
        const outboundId = handoff.createCommandFromDecision(decision);
        expect(outboundId).toBe("ob_fd-1");
      })();

      const updatedDecision = coordinatorStore.getDecisionById("fd-1");
      expect(updatedDecision!.outbound_id).toBe("ob_fd-1");
    });

    it("creates a new command when payload differs (different idempotency key)", () => {
      const decision1 = makeDecision({ decision_id: "fd-1", approved_action: "send_reply" });
      coordinatorStore.insertDecision(decision1);
      const ob1 = db.transaction(() => handoff.createCommandFromDecision(decision1))();

      const decision2 = makeDecision({
        decision_id: "fd-2",
        approved_action: "send_reply",
        payload_json: JSON.stringify({ subject: "different" }),
      });
      coordinatorStore.insertDecision(decision2);

      const ob2 = db.transaction(() => handoff.createCommandFromDecision(decision2))();
      expect(ob2).not.toBe(ob1);
      expect(outboundStore.getCommand(ob2)).toBeDefined();
    });
  });

  describe("recoverWorkItemIfCommandExists", () => {
    it("returns null when no materialized decision exists", () => {
      insertWorkItem();
      const result = handoff.recoverWorkItemIfCommandExists("wi-1", "thread-1", "mb-1");
      expect(result).toBeNull();
    });

    it("resolves the work item and returns outbound_id when command exists (Path B)", () => {
      insertWorkItem();
      const decision = makeDecision({ decision_id: "fd_wi-1_send_reply", outbound_id: "ob_fd-1" });
      coordinatorStore.insertDecision(decision);
      outboundStore.createCommand(
        {
          outbound_id: "ob_fd-1",
          conversation_id: "thread-1",
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

      const result = handoff.recoverWorkItemIfCommandExists("wi-1", "thread-1", "mb-1");
      expect(result).toBe("ob_fd-1");

      const workItem = coordinatorStore.getWorkItem("wi-1");
      expect(workItem!.status).toBe("resolved");
      expect(workItem!.resolution_outcome).toBe("action_created");
    });
  });

  describe("cancelUnsentCommandsForThread", () => {
    it("cancels pending and draft_ready commands for the thread", () => {
      outboundStore.createCommand(
        {
          outbound_id: "o1",
          conversation_id: "thread-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "agent",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-o1",
        },
        {
          outbound_id: "o1",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-o1",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );

      outboundStore.createCommand(
        {
          outbound_id: "o2",
          conversation_id: "thread-1",
          mailbox_id: "mb-1",
          action_type: "mark_read",
          status: "confirmed",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "agent",
          submitted_at: null,
          confirmed_at: new Date().toISOString(),
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-o2",
        },
        {
          outbound_id: "o2",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-o2",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          superseded_at: null,
        },
      );

      const cancelled = handoff.cancelUnsentCommandsForThread("thread-1", "superseded_by_new_revision");
      expect(cancelled).toBe(1);

      const cmd1 = outboundStore.getCommand("o1");
      expect(cmd1!.status).toBe("cancelled");
      expect(cmd1!.terminal_reason).toBe("superseded_by_new_revision");

      const cmd2 = outboundStore.getCommand("o2");
      expect(cmd2!.status).toBe("confirmed");

      const transitions = outboundStore.db
        .prepare("select * from outbound_transitions where outbound_id = ? order by id desc")
        .all("o1") as Array<Record<string, unknown>>;
      expect(transitions[0]!.to_status).toBe("cancelled");
      expect(transitions[0]!.reason).toBe("superseded_by_new_revision");
    });
  });
});
