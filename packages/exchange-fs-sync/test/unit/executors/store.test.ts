import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";

describe("SqliteProcessExecutionStore", () => {
  let db: Database.Database;
  let store: SqliteProcessExecutionStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteProcessExecutionStore({ db });
    store.initSchema();
  });

  afterEach(() => {
    store.close();
    db.close();
  });

  it("creates and retrieves an execution", () => {
    store.create({
      execution_id: "pe-1",
      intent_id: "int-1",
      command: "/bin/echo",
      args_json: JSON.stringify(["hello"]),
      cwd: null,
      env_json: null,
      status: "pending",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: null,
      completed_at: null,
    });

    const found = store.getById("pe-1");
    expect(found).toBeDefined();
    expect(found!.command).toBe("/bin/echo");
    expect(found!.status).toBe("pending");
    expect(found!.phase).toBe("pending");
    expect(found!.executor_family).toBe("process");
    expect(found!.confirmation_status).toBe("unconfirmed");
  });

  it("retrieves by intent_id", () => {
    store.create({
      execution_id: "pe-1",
      intent_id: "int-1",
      command: "cmd",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: "pending",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: null,
      completed_at: null,
    });

    const found = store.getByIntentId("int-1");
    expect(found).toBeDefined();
    expect(found!.execution_id).toBe("pe-1");
  });

  it("updates status and fields", () => {
    store.create({
      execution_id: "pe-1",
      intent_id: "int-1",
      command: "cmd",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: "pending",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: null,
      completed_at: null,
      lease_expires_at: null,
      lease_runner_id: null,
    });

    store.updateStatus("pe-1", "running", {
      started_at: new Date().toISOString(),
      lease_expires_at: "2024-01-01T00:05:00.000Z",
      lease_runner_id: "runner-1",
    });

    const updated = store.getById("pe-1")!;
    expect(updated.status).toBe("running");
    expect(updated.lease_runner_id).toBe("runner-1");
    expect(updated.lease_expires_at).toBe("2024-01-01T00:05:00.000Z");
  });

  it("recovers stale running executions", () => {
    store.create({
      execution_id: "pe-1",
      intent_id: "int-1",
      command: "cmd",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: "2024-01-01T00:00:00.000Z",
      completed_at: null,
      lease_expires_at: "2024-01-01T00:01:00.000Z",
      lease_runner_id: "runner-1",
    });

    store.create({
      execution_id: "pe-2",
      intent_id: "int-2",
      command: "cmd",
      args_json: "[]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: "2024-01-01T00:00:00.000Z",
      completed_at: null,
      lease_expires_at: "2024-01-01T00:10:00.000Z",
      lease_runner_id: "runner-1",
    });

    const stale = store.recoverStaleExecutions("2024-01-01T00:05:00.000Z");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.execution_id).toBe("pe-1");
  });
});
