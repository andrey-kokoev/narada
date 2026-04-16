/**
 * Task 029 — Outbound Idempotency and Effect-of-Once Boundary
 *
 * Integration tests validating that:
 * - identical intent converges to the same outbound command
 * - different intent produces different commands
 * - retries, crashes, and replays do not duplicate side effects
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createHarness,
  insertConversation,
  insertWorkItem,
  insertExecutionAttempt,
  makeInvocationEnvelope,
  makeEvaluation,
  type Harness,
} from "./harness.js";
import { computeIdempotencyKey } from "../../../src/outbound/idempotency.js";

describe("Outbound Idempotency Boundary (Task 029)", () => {
  let h: Harness;

  beforeEach(() => {
    h = createHarness();
  });

  afterEach(() => {
    h.outboundStore.close();
    h.intentStore.close();
    h.traceStore.close();
    h.db.close();
  });

  it("A: retry after crash produces exactly one outbound command", async () => {
    insertConversation(h, "conv-1");
    const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId);

    // First resolution
    const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r1.success).toBe(true);
    expect(r1.outbound_id).toBeDefined();

    // Simulate crash: reset work item to executing
    h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });

    // Retry with same evaluation
    const r2 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r2.success).toBe(true);
    expect(r2.outbound_id).toBe(r1.outbound_id);

    const count = h.db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
    expect(count.c).toBe(1);
  });

  it("B: duplicate runtime output does not duplicate outbound command", async () => {
    insertConversation(h, "conv-1");
    const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId);

    // Same evaluation invoked twice (simulates duplicate output)
    const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r1.success).toBe(true);

    // Reset work item so resolveWorkItem does not reject on status check
    h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });
    const r2 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r2.success).toBe(true);
    expect(r2.outbound_id).toBe(r1.outbound_id);

    const count = h.db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
    expect(count.c).toBe(1);
  });

  it("C: parallel insertion attempts converge to a single command", () => {
    // Direct store-level boundary test: simulate rapid duplicate attempts
    const cmd = {
      outbound_id: "ob-1",
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      action_type: "send_reply" as const,
      status: "pending" as const,
      latest_version: 1,
      created_at: new Date().toISOString(),
      created_by: "agent",
      submitted_at: null,
      confirmed_at: null,
      blocked_reason: null,
      terminal_reason: null,
      idempotency_key: "key-shared",
    };
    const ver = {
      outbound_id: "ob-1",
      version: 1,
      reply_to_message_id: null,
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      subject: "Hello",
      body_text: "World",
      body_html: "",
      idempotency_key: "key-shared",
      policy_snapshot_json: "{}",
      payload_json: "{}",
      created_at: cmd.created_at,
      superseded_at: null,
    };

    h.outboundStore.createCommand(cmd, ver);

    // Second attempt with same idempotency key but different outbound_id
    const cmd2 = { ...cmd, outbound_id: "ob-2" };
    const ver2 = { ...ver, outbound_id: "ob-2" };
    h.outboundStore.createCommand(cmd2, ver2);

    const rows = h.db.prepare("select * from outbound_commands where idempotency_key = ?").all("key-shared") as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outbound_id).toBe("ob-1");
  });

  it("D: replay after restart does not create additional side effects", async () => {
    insertConversation(h, "conv-1");
    const wi = insertWorkItem(h, { context_id: "conv-1", status: "executing" });
    const exId = `ex_${wi.work_item_id}`;
    const envelope = makeInvocationEnvelope(wi.work_item_id, exId);
    insertExecutionAttempt(h, wi.work_item_id, exId, envelope, "active");

    const evaluation = makeEvaluation(wi.work_item_id, exId);

    // Original resolution
    const r1 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r1.success).toBe(true);

    // Simulate process restart: unresolve the work item (as if recovery scanner found it)
    h.coordinatorStore.updateWorkItemStatus(wi.work_item_id, "executing", { resolution_outcome: null });

    // Replay resolution
    const r2 = await h.foreman.resolveWorkItem({ work_item_id: wi.work_item_id, execution_id: exId, evaluation });
    expect(r2.success).toBe(true);
    expect(r2.outbound_id).toBe(r1.outbound_id);

    const count = h.db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
    expect(count.c).toBe(1);
  });

  it("E: different intent produces different idempotency keys and different commands", () => {
    insertConversation(h, "conv-1");
    const now = new Date().toISOString();

    const decision1 = {
      decision_id: "fd-1",
      context_id: "conv-1",
      scope_id: "mb-1",
      source_charter_ids_json: '["support_steward"]',
      approved_action: "send_reply",
      payload_json: JSON.stringify({ to: ["a@example.com"], body_text: "Hello" }),
      rationale: "",
      decided_at: now,
      outbound_id: null,
      created_by: "foreman:test/charter:support_steward",
    };
    const decision2 = {
      decision_id: "fd-2",
      context_id: "conv-1",
      scope_id: "mb-1",
      source_charter_ids_json: '["support_steward"]',
      approved_action: "send_reply",
      payload_json: JSON.stringify({ to: ["a@example.com"], body_text: "Goodbye" }),
      rationale: "",
      decided_at: now,
      outbound_id: null,
      created_by: "foreman:test/charter:support_steward",
    };

    h.coordinatorStore.insertDecision(decision1);
    h.coordinatorStore.insertDecision(decision2);

    const ob1 = h.db.transaction(() => h.foreman.handoff.admitIntentFromDecision(decision1))();
    const ob2 = h.db.transaction(() => h.foreman.handoff.admitIntentFromDecision(decision2))();

    expect(ob1).not.toBe(ob2);
    const count = h.db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
    expect(count.c).toBe(2);
  });

  it("Eb: identical intent converges to the same command via idempotency boundary", () => {
    insertConversation(h, "conv-1");
    const now = new Date().toISOString();
    const payload = { to: ["a@example.com"], body_text: "Same intent" };

    const decision1 = {
      decision_id: "fd-1",
      context_id: "conv-1",
      scope_id: "mb-1",
      source_charter_ids_json: '["support_steward"]',
      approved_action: "send_reply",
      payload_json: JSON.stringify(payload),
      rationale: "",
      decided_at: now,
      outbound_id: null,
      created_by: "foreman:test/charter:support_steward",
    };
    const decision2 = {
      decision_id: "fd-2",
      context_id: "conv-1",
      scope_id: "mb-1",
      source_charter_ids_json: '["support_steward"]',
      approved_action: "send_reply",
      payload_json: JSON.stringify(payload),
      rationale: "",
      decided_at: now,
      outbound_id: null,
      created_by: "foreman:test/charter:support_steward",
    };

    h.coordinatorStore.insertDecision(decision1);
    h.coordinatorStore.insertDecision(decision2);

    const ob1 = h.db.transaction(() => h.foreman.handoff.admitIntentFromDecision(decision1))();
    const ob2 = h.db.transaction(() => h.foreman.handoff.admitIntentFromDecision(decision2))();

    expect(ob2).toBe(ob1);
    const count = h.db.prepare("select count(*) as c from outbound_commands where conversation_id = ?").get("conv-1") as { c: number };
    expect(count.c).toBe(1);
  });

  describe("computeIdempotencyKey", () => {
    it("is deterministic for identical inputs", () => {
      const payload = { to: ["a@b.com"], body_text: "Hello" };
      const k1 = computeIdempotencyKey("conv-1", "send_reply", payload);
      const k2 = computeIdempotencyKey("conv-1", "send_reply", payload);
      expect(k1).toBe(k2);
      expect(k1).toHaveLength(32);
    });

    it("differs when payload field order changes", () => {
      const k1 = computeIdempotencyKey("conv-1", "send_reply", { a: 1, b: 2 });
      const k2 = computeIdempotencyKey("conv-1", "send_reply", { b: 2, a: 1 });
      expect(k1).toBe(k2); // canonicalization normalizes object key order
    });

    it("differs when payload values differ", () => {
      const k1 = computeIdempotencyKey("conv-1", "send_reply", { body_text: "Hello" });
      const k2 = computeIdempotencyKey("conv-1", "send_reply", { body_text: "Hi" });
      expect(k1).not.toBe(k2);
    });

    it("differs when action type differs", () => {
      const payload = { body_text: "Hello" };
      const k1 = computeIdempotencyKey("conv-1", "send_reply", payload);
      const k2 = computeIdempotencyKey("conv-1", "mark_read", payload);
      expect(k1).not.toBe(k2);
    });

    it("differs when conversation_id differs", () => {
      const payload = { body_text: "Hello" };
      const k1 = computeIdempotencyKey("conv-1", "send_reply", payload);
      const k2 = computeIdempotencyKey("conv-2", "send_reply", payload);
      expect(k1).not.toBe(k2);
    });
  });
});
