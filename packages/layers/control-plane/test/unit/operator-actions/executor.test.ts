import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { executeOperatorAction } from "../../../src/operator-actions/executor.js";
import type { OutboundCommand, OutboundVersion } from "../../../src/outbound/types.js";

function createCommand(overrides?: Partial<OutboundCommand>): OutboundCommand {
  const now = new Date().toISOString();
  return {
    outbound_id: `out-${Date.now()}`,
    context_id: "thread-1",
    scope_id: "mailbox-1",
    action_type: "send_reply",
    status: "draft_ready",
    latest_version: 1,
    created_at: now,
    created_by: "test",
    submitted_at: null,
    confirmed_at: null,
    blocked_reason: null,
    terminal_reason: null,
    idempotency_key: "key-001",
    reviewed_at: null,
    reviewer_notes: null,
    external_reference: null,
    approved_at: null,
    ...overrides,
  };
}

function createVersion(outboundId: string, overrides?: Partial<OutboundVersion>): OutboundVersion {
  return {
    outbound_id: outboundId,
    version: 1,
    reply_to_message_id: "msg-1",
    to: ["alice@example.com"],
    cc: [],
    bcc: [],
    subject: "Re: Hello",
    body_text: "Reply text",
    body_html: "<p>Reply text</p>",
    idempotency_key: "key-001",
    policy_snapshot_json: "{}",
    payload_json: "{}",
    created_at: new Date().toISOString(),
    superseded_at: null,
    ...overrides,
  };
}

describe("executeOperatorAction — approve_draft_for_send", () => {
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let db: import("better-sqlite3").Database;

  beforeEach(() => {
    const Database = require("better-sqlite3");
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    coordinatorStore.initSchema();
    outboundStore = new SqliteOutboundStore({ db });
    outboundStore.initSchema();
    intentStore = new SqliteIntentStore({ db });
    intentStore.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  it("approves a send_reply in draft_ready", async () => {
    const cmd = createCommand({ action_type: "send_reply", status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("executed");

    const updated = outboundStore.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("approved_for_send");
    expect(updated?.approved_at).not.toBeNull();

    const transitions = outboundStore.db
      .prepare("select * from outbound_transitions where outbound_id = ? order by id")
      .all(cmd.outbound_id) as Array<{ from_status: string | null; to_status: string; reason: string | null }>;

    const approvalTransition = transitions.find((t) => t.to_status === "approved_for_send");
    expect(approvalTransition).toBeDefined();
    expect(approvalTransition!.reason).toBe("operator_approved_for_send");
  });

  it("approves a send_new_message in draft_ready", async () => {
    const cmd = createCommand({ action_type: "send_new_message", status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(true);
    const updated = outboundStore.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("approved_for_send");
  });

  it("rejects when command is not in draft_ready", async () => {
    const cmd = createCommand({ action_type: "send_reply", status: "pending" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("not in draft_ready status");

    const updated = outboundStore.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("pending");
  });

  it("rejects when action_type is draft_reply", async () => {
    const cmd = createCommand({ action_type: "draft_reply", status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("not eligible for send approval");
  });

  it("rejects when action_type is mark_read", async () => {
    const cmd = createCommand({ action_type: "mark_read", status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("not eligible for send approval");
  });

  it("rejects when outbound_id does not exist", async () => {
    const result = await executeOperatorAction(
      {
        scope_id: "mailbox-1",
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: "nonexistent",
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("not found");
  });

  it("inserts an operator action audit row", async () => {
    const cmd = createCommand({ action_type: "send_reply", status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "approve_draft_for_send",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(true);

    const auditRows = coordinatorStore.db
      .prepare("select * from operator_action_requests where action_type = ? order by requested_at desc")
      .all("approve_draft_for_send") as Array<{ status: string; target_id: string }>;

    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const latest = auditRows[0]!;
    expect(latest.status).toBe("executed");
    expect(latest.target_id).toBe(cmd.outbound_id);
  });
});

describe("executeOperatorAction — retry_auth_failed", () => {
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let db: import("better-sqlite3").Database;

  beforeEach(() => {
    const Database = require("better-sqlite3");
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    coordinatorStore.initSchema();
    outboundStore = new SqliteOutboundStore({ db });
    outboundStore.initSchema();
    intentStore = new SqliteIntentStore({ db });
    intentStore.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  it("retries a specific send_reply auth failure back to approved_for_send", async () => {
    const cmd = createCommand({
      action_type: "send_reply",
      status: "failed_terminal",
      terminal_reason: "Auth error sending draft: Unauthorized",
    });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "retry_auth_failed",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(true);
    const updated = outboundStore.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("approved_for_send");
    expect(updated?.terminal_reason).toBeNull();
  });

  it("retries a specific draft_reply auth failure back to draft_ready", async () => {
    const cmd = createCommand({
      action_type: "draft_reply",
      status: "failed_terminal",
      terminal_reason: "Auth error creating draft: Unauthorized",
    });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "retry_auth_failed",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(true);
    const updated = outboundStore.getCommand(cmd.outbound_id);
    expect(updated?.status).toBe("draft_ready");
  });

  it("scans scope for auth failures when no target_id is given", async () => {
    const cmd1 = createCommand({
      outbound_id: "out-scan-001",
      action_type: "send_reply",
      status: "failed_terminal",
      terminal_reason: "Auth error sending draft: Unauthorized",
      scope_id: "mailbox-1",
      idempotency_key: "key-scan-001",
    });
    const cmd2 = createCommand({
      outbound_id: "out-scan-002",
      action_type: "mark_read",
      status: "failed_terminal",
      terminal_reason: "Auth error executing mark_read: Forbidden",
      scope_id: "mailbox-1",
      idempotency_key: "key-scan-002",
    });
    const cmd3 = createCommand({
      outbound_id: "out-scan-003",
      action_type: "move_message",
      status: "failed_terminal",
      terminal_reason: "Network timeout",
      scope_id: "mailbox-1",
      idempotency_key: "key-scan-003",
    });

    outboundStore.createCommand(cmd1, createVersion(cmd1.outbound_id, { idempotency_key: "key-scan-001" }));
    outboundStore.createCommand(cmd2, createVersion(cmd2.outbound_id, { idempotency_key: "key-scan-002" }));
    outboundStore.createCommand(cmd3, createVersion(cmd3.outbound_id, { idempotency_key: "key-scan-003" }));

    const result = await executeOperatorAction(
      {
        scope_id: "mailbox-1",
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "retry_auth_failed",
      },
    );

    expect(result.success).toBe(true);
    expect(outboundStore.getCommand(cmd1.outbound_id)?.status).toBe("approved_for_send");
    expect(outboundStore.getCommand(cmd2.outbound_id)?.status).toBe("draft_ready");
    expect(outboundStore.getCommand(cmd3.outbound_id)?.status).toBe("failed_terminal");
  });

  it("rejects when target is not failed_terminal", async () => {
    const cmd = createCommand({ action_type: "send_reply", status: "draft_ready" });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "retry_auth_failed",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not in failed_terminal status");
  });

  it("rejects when terminal_reason does not indicate auth failure", async () => {
    const cmd = createCommand({
      action_type: "send_reply",
      status: "failed_terminal",
      terminal_reason: "Network timeout",
    });
    const ver = createVersion(cmd.outbound_id);
    outboundStore.createCommand(cmd, ver);

    const result = await executeOperatorAction(
      {
        scope_id: cmd.scope_id,
        coordinatorStore,
        outboundStore,
        intentStore,
      },
      {
        action_type: "retry_auth_failed",
        target_id: cmd.outbound_id,
      },
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("does not indicate an auth failure");
  });
});
