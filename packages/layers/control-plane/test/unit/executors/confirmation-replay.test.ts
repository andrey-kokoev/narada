import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { ConfirmationReplay } from "../../../src/executors/confirmation-replay.js";
import type { FoundMessage, MessageFinder } from "../../../src/outbound/reconciler.js";

class MockMessageFinder implements MessageFinder {
  byOutboundId = new Map<string, FoundMessage>();
  byMessageId = new Map<string, FoundMessage>();

  async findByOutboundId(_mailboxId: string, outboundId: string): Promise<FoundMessage | undefined> {
    return this.byOutboundId.get(outboundId);
  }

  async findByMessageId(_mailboxId: string, messageId: string): Promise<FoundMessage | undefined> {
    return this.byMessageId.get(messageId);
  }
}

describe("ConfirmationReplay", () => {
  let db: Database.Database;
  let processStore: SqliteProcessExecutionStore;
  let intentStore: SqliteIntentStore;
  let outboundStore: SqliteOutboundStore;
  let finder: MockMessageFinder;
  let replay: ConfirmationReplay;

  beforeEach(() => {
    db = new Database(":memory:");
    processStore = new SqliteProcessExecutionStore({ db });
    intentStore = new SqliteIntentStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    processStore.initSchema();
    intentStore.initSchema();
    outboundStore.initSchema();
    finder = new MockMessageFinder();
    replay = new ConfirmationReplay({
      processStore,
      outboundStore,
      intentStore,
      messageFinder: finder,
      confirmWindowMs: 1000,
    });
  });

  afterEach(() => {
    processStore.close();
    intentStore.close();
    outboundStore.close();
    db.close();
  });

  describe("process family", () => {
    it("confirms a completed successful execution", async () => {
      processStore.create({
        execution_id: "pe-1",
        intent_id: "int-1",
        command: "/bin/echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "completed",
        phase: "completed",
        confirmation_status: "unconfirmed",
        exit_code: 0,
        stdout: "hello",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: null,
        error_message: null,
        artifact_id: null,
        result_json: "{}",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      const result = await replay.replay({ limit: 10 });

      expect(result.processed).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.still_unconfirmed).toBe(0);
      expect(result.details[0]!.new_status).toBe("confirmed");
      expect(result.details[0]!.previous_status).toBe("unconfirmed");

      const execution = processStore.getById("pe-1")!;
      expect(execution.confirmation_status).toBe("confirmed");
      expect(execution.confirmed_at).not.toBeNull();
    });

    it("marks a failed execution as confirmation_failed", async () => {
      processStore.create({
        execution_id: "pe-2",
        intent_id: "int-2",
        command: "/bin/false",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "failed",
        phase: "failed",
        confirmation_status: "unconfirmed",
        exit_code: 1,
        stdout: "",
        stderr: "error",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: null,
        error_message: "Process exited with code 1",
        artifact_id: null,
        result_json: "{}",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      const result = await replay.replay({ limit: 10 });

      expect(result.processed).toBe(1);
      expect(result.confirmation_failed).toBe(1);
      expect(result.details[0]!.new_status).toBe("confirmation_failed");

      const execution = processStore.getById("pe-2")!;
      expect(execution.confirmation_status).toBe("confirmation_failed");
    });

    it("does not re-execute effects (process confirmation is read-write on store only)", async () => {
      // The confirmation replay operator must not spawn processes.
      // We verify this by checking that the execution record is only mutated
      // in confirmation fields, not in execution fields like stdout/exit_code.
      processStore.create({
        execution_id: "pe-3",
        intent_id: "int-3",
        command: "/bin/echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "completed",
        phase: "completed",
        confirmation_status: "unconfirmed",
        exit_code: 0,
        stdout: "original",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: null,
        error_message: null,
        artifact_id: null,
        result_json: "{}",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      await replay.replay({ limit: 10 });

      const execution = processStore.getById("pe-3")!;
      expect(execution.stdout).toBe("original");
      expect(execution.exit_code).toBe(0);
      expect(execution.phase).toBe("completed");
    });

    it("respects intentIds selection", async () => {
      processStore.create({
        execution_id: "pe-a",
        intent_id: "int-a",
        command: "/bin/echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "completed",
        phase: "completed",
        confirmation_status: "unconfirmed",
        exit_code: 0,
        stdout: "",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: null,
        error_message: null,
        artifact_id: null,
        result_json: "{}",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      processStore.create({
        execution_id: "pe-b",
        intent_id: "int-b",
        command: "/bin/echo",
        args_json: "[]",
        cwd: null,
        env_json: null,
        status: "completed",
        phase: "completed",
        confirmation_status: "unconfirmed",
        exit_code: 0,
        stdout: "",
        stderr: "",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_at: null,
        error_message: null,
        artifact_id: null,
        result_json: "{}",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      const result = await replay.replay({ intentIds: ["int-b"], limit: 10 });
      expect(result.processed).toBe(1);
      expect(result.details[0]!.intent_id).toBe("int-b");
    });
  });

  describe("mail family", () => {
    it("confirms a send_reply command when the message is found by outbound_id", async () => {
      const now = new Date().toISOString();
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: now,
          created_by: "test",
          submitted_at: now,
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
          created_at: now,
          superseded_at: null,
        },
      );

      intentStore.admit({
        intent_id: "int-1",
        intent_type: "mail.send_reply",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "key-int-1",
        status: "admitted",
        context_id: "conv-1",
        target_id: "ob-1",
        terminal_reason: null,
      });

      finder.byOutboundId.set("ob-1", { messageId: "msg-123" });

      const result = await replay.replay({ limit: 10 });

      expect(result.processed).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.details[0]!.new_status).toBe("confirmed");
      expect(result.details[0]!.previous_status).toBe("submitted");

      const updated = outboundStore.getCommand("ob-1")!;
      expect(updated.status).toBe("confirmed");
      expect(updated.confirmed_at).not.toBeNull();
    });

    it("does not confirm and does not re-send when message is not found within window", async () => {
      const old = new Date(Date.now() - 2000).toISOString();
      outboundStore.createCommand(
        {
          outbound_id: "ob-2",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: old,
          created_by: "test",
          submitted_at: old,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-2",
        },
        {
          outbound_id: "ob-2",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-2",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: old,
          superseded_at: null,
        },
      );

      intentStore.admit({
        intent_id: "int-2",
        intent_type: "mail.send_reply",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "key-int-2",
        status: "admitted",
        context_id: "conv-1",
        target_id: "ob-2",
        terminal_reason: null,
      });

      // No message found
      const result = await replay.replay({ limit: 10 });

      expect(result.processed).toBe(1);
      // retry_wait is counted as confirmation_failed in aggregates
      expect(result.confirmation_failed).toBe(1);
      expect(result.details[0]!.new_status).toBe("retry_wait");

      const updated = outboundStore.getCommand("ob-2")!;
      expect(updated.status).toBe("retry_wait");
    });

    it("confirms mark_read when message is_read=true", async () => {
      const now = new Date().toISOString();
      outboundStore.createCommand(
        {
          outbound_id: "ob-3",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "mark_read",
          status: "submitted",
          latest_version: 1,
          created_at: now,
          created_by: "test",
          submitted_at: now,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-3",
        },
        {
          outbound_id: "ob-3",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-3",
          policy_snapshot_json: "{}",
          payload_json: JSON.stringify({ target_message_id: "msg-456" }),
          created_at: now,
          superseded_at: null,
        },
      );

      intentStore.admit({
        intent_id: "int-3",
        intent_type: "mail.mark_read",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "key-int-3",
        status: "admitted",
        context_id: "conv-1",
        target_id: "ob-3",
        terminal_reason: null,
      });

      finder.byMessageId.set("msg-456", { messageId: "msg-456", isRead: true });

      const result = await replay.replay({ limit: 10 });

      expect(result.processed).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.details[0]!.new_status).toBe("confirmed");
    });

    it("respects outboundIds selection", async () => {
      const now = new Date().toISOString();
      outboundStore.createCommand(
        {
          outbound_id: "ob-x",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: now,
          created_by: "test",
          submitted_at: now,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-x",
        },
        {
          outbound_id: "ob-x",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-x",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: now,
          superseded_at: null,
        },
      );

      outboundStore.createCommand(
        {
          outbound_id: "ob-y",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: now,
          created_by: "test",
          submitted_at: now,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-y",
        },
        {
          outbound_id: "ob-y",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-y",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: now,
          superseded_at: null,
        },
      );

      finder.byOutboundId.set("ob-y", { messageId: "msg-y" });

      const result = await replay.replay({ outboundIds: ["ob-y"], limit: 10 });

      expect(result.processed).toBe(1);
      expect(result.details[0]!.outbound_id).toBe("ob-y");
      expect(outboundStore.getCommand("ob-x")!.status).toBe("submitted");
      expect(outboundStore.getCommand("ob-y")!.status).toBe("confirmed");
    });

    it("does not re-execute mail effects (only reconciles)", async () => {
      // Confirmation replay for mail must not call Graph API to create drafts or send.
      // The MockMessageFinder never mutates remote state; we verify that the
      // outbound command status transitions only via reconciliation, not via worker mutation.
      const now = new Date().toISOString();
      outboundStore.createCommand(
        {
          outbound_id: "ob-safe",
          context_id: "conv-1",
          scope_id: "mb-1",
          action_type: "send_reply",
          status: "submitted",
          latest_version: 1,
          created_at: now,
          created_by: "test",
          submitted_at: now,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: null,
          idempotency_key: "key-safe",
        },
        {
          outbound_id: "ob-safe",
          version: 1,
          reply_to_message_id: null,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body_text: "",
          body_html: "",
          idempotency_key: "key-safe",
          policy_snapshot_json: "{}",
          payload_json: "{}",
          created_at: now,
          superseded_at: null,
        },
      );

      // Message not found, window not expired
      const result = await replay.replay({ limit: 10 });

      expect(result.processed).toBe(1);
      // Status should remain submitted (not sending/draft_creating/etc.)
      expect(outboundStore.getCommand("ob-safe")!.status).toBe("submitted");
    });
  });

  describe("bounded selection", () => {
    it("respects the limit across families", async () => {
      // Create 3 process executions
      for (let i = 0; i < 3; i++) {
        processStore.create({
          execution_id: `pe-${i}`,
          intent_id: `int-p-${i}`,
          command: "/bin/echo",
          args_json: "[]",
          cwd: null,
          env_json: null,
          status: "completed",
          phase: "completed",
          confirmation_status: "unconfirmed",
          exit_code: 0,
          stdout: "",
          stderr: "",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          confirmed_at: null,
          error_message: null,
          artifact_id: null,
          result_json: "{}",
          lease_expires_at: null,
          lease_runner_id: null,
        });
      }

      const result = await replay.replay({ limit: 2 });
      expect(result.processed).toBe(2);
    });
  });
});
