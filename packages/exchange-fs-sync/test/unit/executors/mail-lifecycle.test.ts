import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import {
  outboundCommandToExecutionLifecycle,
  MailLifecycleAdapter,
} from "../../../src/executors/mail-lifecycle.js";
import type { OutboundCommand } from "../../../src/outbound/types.js";

describe("mail lifecycle adapter", () => {
  let db: Database.Database;
  let outboundStore: SqliteOutboundStore;

  beforeEach(() => {
    db = new Database(":memory:");
    outboundStore = new SqliteOutboundStore({ db });
    outboundStore.initSchema();
  });

  function makeCommand(status: OutboundCommand["status"]): OutboundCommand {
    return {
      outbound_id: "ob-1",
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      action_type: "send_reply",
      status,
      latest_version: 1,
      created_at: "2024-01-01T00:00:00Z",
      created_by: "test",
      submitted_at: status === "submitted" || status === "confirmed" ? "2024-01-01T00:01:00Z" : null,
      confirmed_at: status === "confirmed" ? "2024-01-01T00:02:00Z" : null,
      blocked_reason: null,
      terminal_reason: status === "failed_terminal" ? "Send failed" : null,
      idempotency_key: "key-1",
    };
  }

  it("maps pending command to running/unconfirmed", () => {
    const lifecycle = outboundCommandToExecutionLifecycle(makeCommand("pending"), "int-1");
    expect(lifecycle.executor_family).toBe("mail");
    expect(lifecycle.phase).toBe("running");
    expect(lifecycle.confirmation_status).toBe("unconfirmed");
    expect(lifecycle.artifact_id).toBe("ob-1");
  });

  it("maps submitted command to completed/unconfirmed", () => {
    const lifecycle = outboundCommandToExecutionLifecycle(makeCommand("submitted"), "int-1");
    expect(lifecycle.phase).toBe("completed");
    expect(lifecycle.confirmation_status).toBe("unconfirmed");
    expect(lifecycle.completed_at).toBe("2024-01-01T00:01:00Z");
    expect(lifecycle.confirmed_at).toBeNull();
  });

  it("maps confirmed command to completed/confirmed", () => {
    const lifecycle = outboundCommandToExecutionLifecycle(makeCommand("confirmed"), "int-1");
    expect(lifecycle.phase).toBe("completed");
    expect(lifecycle.confirmation_status).toBe("confirmed");
    expect(lifecycle.confirmed_at).toBe("2024-01-01T00:02:00Z");
  });

  it("maps failed_terminal to failed/confirmation_failed", () => {
    const lifecycle = outboundCommandToExecutionLifecycle(makeCommand("failed_terminal"), "int-1");
    expect(lifecycle.phase).toBe("failed");
    expect(lifecycle.confirmation_status).toBe("confirmation_failed");
    expect(lifecycle.error_message).toBe("Send failed");
  });

  it("maps cancelled/superseded to failed/confirmation_failed", () => {
    expect(outboundCommandToExecutionLifecycle(makeCommand("cancelled"), "int-1").phase).toBe("failed");
    expect(outboundCommandToExecutionLifecycle(makeCommand("superseded"), "int-1").confirmation_status).toBe(
      "confirmation_failed",
    );
  });

  it("MailLifecycleAdapter reads from outbound store", () => {
    outboundStore.createCommand(
      {
        outbound_id: "ob-1",
        conversation_id: "conv-1",
        mailbox_id: "mb-1",
        action_type: "send_reply",
        status: "submitted",
        latest_version: 1,
        created_at: "2024-01-01T00:00:00Z",
        created_by: "test",
        submitted_at: "2024-01-01T00:01:00Z",
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

    const adapter = new MailLifecycleAdapter({ outboundStore });
    const lifecycle = adapter.getLifecycle("ob-1", "int-1")!;
    expect(lifecycle.phase).toBe("completed");
    expect(lifecycle.confirmation_status).toBe("unconfirmed");
    expect(lifecycle.intent_id).toBe("int-1");
  });

  it("MailLifecycleAdapter returns undefined for missing command", () => {
    const adapter = new MailLifecycleAdapter({ outboundStore });
    expect(adapter.getLifecycle("ob-missing", "int-1")).toBeUndefined();
  });
});
