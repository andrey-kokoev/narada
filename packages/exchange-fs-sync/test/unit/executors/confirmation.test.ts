import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import {
  ProcessConfirmationResolver,
  MailConfirmationResolver,
  CompositeConfirmationResolver,
} from "../../../src/executors/confirmation.js";

describe("ConfirmationResolver", () => {
  describe("ProcessConfirmationResolver", () => {
    let db: Database.Database;
    let executionStore: SqliteProcessExecutionStore;
    let resolver: ProcessConfirmationResolver;

    beforeEach(() => {
      db = new Database(":memory:");
      executionStore = new SqliteProcessExecutionStore({ db });
      executionStore.initSchema();
      resolver = new ProcessConfirmationResolver({ executionStore });
    });

    afterEach(() => {
      executionStore.close();
      db.close();
    });

    it("returns unconfirmed when execution does not exist", () => {
      expect(resolver.resolve("int-missing")).toBe("unconfirmed");
    });

    it("returns unconfirmed while execution is still running", () => {
      executionStore.create({
        execution_id: "pe-1",
        intent_id: "int-1",
        command: "sleep",
        args_json: "[\"100\"]",
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
        error_message: null,
        artifact_id: null,
        result_json: "{}",
        lease_expires_at: null,
        lease_runner_id: null,
      });

      expect(resolver.resolve("int-1")).toBe("unconfirmed");
    });

    it("confirms a successful completed execution", () => {
      executionStore.create({
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

      const status = resolver.resolve("int-1");
      expect(status).toBe("confirmed");

      const execution = executionStore.getById("pe-1")!;
      expect(execution.confirmation_status).toBe("confirmed");
      expect(execution.confirmed_at).not.toBeNull();
    });

    it("marks confirmation_failed for failed execution", () => {
      executionStore.create({
        execution_id: "pe-1",
        intent_id: "int-1",
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

      const status = resolver.resolve("int-1");
      expect(status).toBe("confirmation_failed");

      const execution = executionStore.getById("pe-1")!;
      expect(execution.confirmation_status).toBe("confirmation_failed");
      expect(execution.confirmed_at).not.toBeNull();
    });

    it("is idempotent: repeated resolves return the same status without mutation", () => {
      executionStore.create({
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

      const s1 = resolver.resolve("int-1");
      const execution = executionStore.getById("pe-1")!;
      const confirmedAt1 = execution.confirmed_at;

      const s2 = resolver.resolve("int-1");
      const confirmedAt2 = executionStore.getById("pe-1")!.confirmed_at;

      expect(s1).toBe(s2);
      expect(confirmedAt2).toBe(confirmedAt1);
    });
  });

  describe("MailConfirmationResolver", () => {
    let db: Database.Database;
    let outboundStore: SqliteOutboundStore;
    let intentStore: SqliteIntentStore;
    let resolver: MailConfirmationResolver;

    beforeEach(() => {
      db = new Database(":memory:");
      outboundStore = new SqliteOutboundStore({ db });
      intentStore = new SqliteIntentStore({ db });
      outboundStore.initSchema();
      intentStore.initSchema();
      resolver = new MailConfirmationResolver({ outboundStore, intentStore });
    });

    afterEach(() => {
      outboundStore.close();
      intentStore.close();
      db.close();
    });

    it("returns unconfirmed when intent does not exist", () => {
      expect(resolver.resolve("int-missing")).toBe("unconfirmed");
    });

    it("returns unconfirmed when intent has no target_id", () => {
      intentStore.admit({
        intent_id: "int-1",
        intent_type: "mail.send_reply",
        executor_family: "mail",
        payload_json: "{}",
        idempotency_key: "key-1",
        status: "admitted",
        context_id: "conv-1",
        target_id: null,
        terminal_reason: null,
      });
      expect(resolver.resolve("int-1")).toBe("unconfirmed");
    });

    it("returns confirmed for confirmed outbound command", () => {
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "confirmed",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "test",
          submitted_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
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

      expect(resolver.resolve("int-1")).toBe("confirmed");
    });

    it("returns confirmation_failed for failed terminal command", () => {
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "failed_terminal",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "test",
          submitted_at: null,
          confirmed_at: null,
          blocked_reason: null,
          terminal_reason: "blocked",
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

      expect(resolver.resolve("int-1")).toBe("confirmation_failed");
    });

    it("returns unconfirmed for pending command", () => {
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "pending",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "test",
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

      expect(resolver.resolve("int-1")).toBe("unconfirmed");
    });
  });

  describe("CompositeConfirmationResolver", () => {
    let db: Database.Database;
    let executionStore: SqliteProcessExecutionStore;
    let outboundStore: SqliteOutboundStore;
    let intentStore: SqliteIntentStore;
    let resolver: CompositeConfirmationResolver;

    beforeEach(() => {
      db = new Database(":memory:");
      executionStore = new SqliteProcessExecutionStore({ db });
      outboundStore = new SqliteOutboundStore({ db });
      intentStore = new SqliteIntentStore({ db });
      executionStore.initSchema();
      outboundStore.initSchema();
      intentStore.initSchema();

      resolver = new CompositeConfirmationResolver({
        processResolver: new ProcessConfirmationResolver({ executionStore }),
        mailResolver: new MailConfirmationResolver({ outboundStore, intentStore }),
      });
    });

    afterEach(() => {
      executionStore.close();
      outboundStore.close();
      intentStore.close();
      db.close();
    });

    it("delegates to process resolver for process family", () => {
      executionStore.create({
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

      expect(resolver.resolve("int-1", "process")).toBe("confirmed");
    });

    it("delegates to mail resolver for mail family", () => {
      outboundStore.createCommand(
        {
          outbound_id: "ob-1",
          conversation_id: "conv-1",
          mailbox_id: "mb-1",
          action_type: "send_reply",
          status: "confirmed",
          latest_version: 1,
          created_at: new Date().toISOString(),
          created_by: "test",
          submitted_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
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

      expect(resolver.resolve("int-1", "mail")).toBe("confirmed");
    });

    it("returns unconfirmed for unknown family", () => {
      expect(resolver.resolve("int-1", "unknown")).toBe("unconfirmed");
    });
  });
});
