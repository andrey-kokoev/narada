import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { ExecutionCoordinator } from "../../../src/executors/coordinator.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";

describe("ExecutionCoordinator", () => {
  let db: Database.Database;
  let processStore: SqliteProcessExecutionStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let coordinatorStore: SqliteCoordinatorStore;
  let coordinator: ExecutionCoordinator;

  beforeEach(() => {
    db = new Database(":memory:");
    processStore = new SqliteProcessExecutionStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    coordinatorStore = new SqliteCoordinatorStore({ db });
    processStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();
    coordinatorStore.initSchema();

    coordinator = new ExecutionCoordinator({
      processStore,
      outboundStore,
      intentStore,
    });
  });

  it("returns process execution lifecycle", () => {
    processStore.create({
      execution_id: "pe-1",
      intent_id: "int-1",
      executor_family: "process",
      phase: "running",
      confirmation_status: "unconfirmed",
      command: "/bin/echo",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: "2024-01-01T00:00:00Z",
      completed_at: null,
      confirmed_at: null,
      error_message: null,
      artifact_id: null,
      result_json: "{}",
      lease_expires_at: null,
      lease_runner_id: null,
    });

    const lifecycle = coordinator.getLifecycle("pe-1", "process")!;
    expect(lifecycle.executor_family).toBe("process");
    expect(lifecycle.phase).toBe("running");
    expect(lifecycle.confirmation_status).toBe("unconfirmed");
  });

  it("returns mail execution lifecycle via outbound projection", () => {
    outboundStore.createCommand(
      {
        outbound_id: "ob-1",
        context_id: "conv-1",
        scope_id: "mb-1",
        action_type: "send_reply",
        status: "confirmed",
        latest_version: 1,
        created_at: "2024-01-01T00:00:00Z",
        created_by: "test",
        submitted_at: "2024-01-01T00:01:00Z",
        confirmed_at: "2024-01-01T00:02:00Z",
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

    intentStore.admit({
      intent_id: "int-mail-1",
      intent_type: "mail.send_reply",
      executor_family: "mail",
      payload_json: "{}",
      idempotency_key: "key-mail-1",
      status: "admitted",
      context_id: "conv-1",
      target_id: "ob-1",
      terminal_reason: null,
    });

    const lifecycle = coordinator.getLifecycle("ob-1", "mail")!;
    expect(lifecycle.executor_family).toBe("mail");
    expect(lifecycle.phase).toBe("completed");
    expect(lifecycle.confirmation_status).toBe("confirmed");
  });

  it("returns undefined for missing execution", () => {
    expect(coordinator.getLifecycle("pe-missing", "process")).toBeUndefined();
    expect(coordinator.getLifecycle("ob-missing", "mail")).toBeUndefined();
  });

  it("recovers stale process executions through unified interface", () => {
    processStore.create({
      execution_id: "pe-stale",
      intent_id: "int-stale",
      executor_family: "process",
      phase: "running",
      confirmation_status: "unconfirmed",
      command: "sleep",
      args_json: "[\"100\"]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: "2024-01-01T00:00:00Z",
      completed_at: null,
      confirmed_at: null,
      error_message: null,
      artifact_id: null,
      result_json: "{}",
      lease_expires_at: "2024-01-01T00:01:00Z",
      lease_runner_id: "runner-1",
    });

    const recovered = coordinator.recoverStaleExecutions("2024-01-01T00:05:00Z");
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.execution_id).toBe("pe-stale");
    expect(recovered[0]!.phase).toBe("running");
    expect(recovered[0]!.confirmation_status).toBe("unconfirmed");
  });

  it("resolves process confirmation through coordinator", () => {
    processStore.create({
      execution_id: "pe-1",
      intent_id: "int-1",
      executor_family: "process",
      phase: "completed",
      confirmation_status: "unconfirmed",
      command: "/bin/echo",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: "completed",
      exit_code: 0,
      stdout: "",
      stderr: "",
      started_at: "2024-01-01T00:00:00Z",
      completed_at: "2024-01-01T00:01:00Z",
      confirmed_at: null,
      error_message: null,
      artifact_id: null,
      result_json: "{}",
      lease_expires_at: null,
      lease_runner_id: null,
    });

    const status = coordinator.resolveConfirmation("int-1", "process");
    expect(status).toBe("confirmed");

    const lifecycle = coordinator.getLifecycle("pe-1", "process")!;
    expect(lifecycle.confirmation_status).toBe("confirmed");
  });

  it("resolves mail confirmation through coordinator", () => {
    outboundStore.createCommand(
      {
        outbound_id: "ob-1",
        context_id: "conv-1",
        scope_id: "mb-1",
        action_type: "send_reply",
        status: "confirmed",
        latest_version: 1,
        created_at: "2024-01-01T00:00:00Z",
        created_by: "test",
        submitted_at: "2024-01-01T00:01:00Z",
        confirmed_at: "2024-01-01T00:02:00Z",
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

    intentStore.admit({
      intent_id: "int-mail-1",
      intent_type: "mail.send_reply",
      executor_family: "mail",
      payload_json: "{}",
      idempotency_key: "key-mail-1",
      status: "admitted",
      context_id: "conv-1",
      target_id: "ob-1",
      terminal_reason: null,
    });

    const status = coordinator.resolveConfirmation("int-mail-1", "mail");
    expect(status).toBe("confirmed");
  });
});
