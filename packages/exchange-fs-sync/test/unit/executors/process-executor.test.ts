import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { ProcessExecutor } from "../../../src/executors/process-executor.js";

describe("ProcessExecutor", () => {
  let db: Database.Database;
  let intentStore: SqliteIntentStore;
  let executionStore: SqliteProcessExecutionStore;
  let executor: ProcessExecutor;

  beforeEach(() => {
    db = new Database(":memory:");
    intentStore = new SqliteIntentStore({ db });
    executionStore = new SqliteProcessExecutionStore({ db });
    intentStore.initSchema();
    executionStore.initSchema();
    executor = new ProcessExecutor({ intentStore, executionStore });
  });

  afterEach(() => {
    executionStore.close();
    intentStore.close();
    db.close();
  });

  function admitProcessIntent(overrides?: Partial<Parameters<typeof intentStore.admit>[0]>): ReturnType<typeof intentStore.admit> {
    return intentStore.admit({
      intent_id: "int-test",
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ command: process.platform === "win32" ? "cmd" : "/bin/echo", args: ["hello"] }),
      idempotency_key: "key-test",
      status: "admitted",
      context_id: "ctx-1",
      target_id: null,
      terminal_reason: null,
      ...overrides,
    });
  }

  it("returns processed=false when no pending process intents", async () => {
    const result = await executor.processNext();
    expect(result.processed).toBe(false);
  });

  it("executes a process intent and marks intent completed", async () => {
    admitProcessIntent();

    const result = await executor.processNext();
    expect(result.processed).toBe(true);
    expect(result.executionId).toBeDefined();

    const intent = intentStore.getById("int-test")!;
    expect(intent.status).toBe("completed");
    expect(intent.target_id).toBe(result.executionId);

    const execution = executionStore.getById(result.executionId!)!;
    expect(execution.status).toBe("completed");
    expect(execution.phase).toBe("completed");
    // Confirmation is resolved separately (Task 060)
    expect(execution.confirmation_status).toBe("unconfirmed");
    expect(execution.confirmed_at).toBeNull();
    expect(execution.exit_code).toBe(0);
    expect(execution.stdout.trim()).toBe("hello");
  });

  it("does not duplicate execution on replay", async () => {
    admitProcessIntent();

    const r1 = await executor.processNext();
    expect(r1.processed).toBe(true);

    const r2 = await executor.processNext();
    expect(r2.processed).toBe(false);

    const executions = db.prepare("select count(*) as c from process_executions").get() as { c: number };
    expect(executions.c).toBe(1);
  });

  it("marks intent failed_terminal when command exits non-zero", async () => {
    // Use a command that fails
    const command = process.platform === "win32" ? "cmd" : "sh";
    const args = process.platform === "win32" ? ["/c", "exit", "1"] : ["-c", "exit 1"];
    admitProcessIntent({
      payload_json: JSON.stringify({ command, args }),
    });

    const result = await executor.processNext();
    expect(result.processed).toBe(true);

    const intent = intentStore.getById("int-test")!;
    expect(intent.status).toBe("failed_terminal");
    expect(intent.terminal_reason).toContain("1");

    const execution = executionStore.getById(result.executionId!)!;
    expect(execution.status).toBe("failed");
    expect(execution.phase).toBe("failed");
    // Confirmation is resolved separately (Task 060)
    expect(execution.confirmation_status).toBe("unconfirmed");
    expect(execution.exit_code).toBe(1);
  });

  it("marks intent failed_terminal for invalid payload_json", async () => {
    admitProcessIntent();
    // Corrupt payload directly to bypass registry validation and test executor defense.
    db.prepare("update intents set payload_json = ? where intent_id = ?").run("not-json", "int-test");

    const result = await executor.processNext();
    expect(result.processed).toBe(true);

    const intent = intentStore.getById("int-test")!;
    expect(intent.status).toBe("failed_terminal");
    expect(intent.terminal_reason).toBe("Invalid payload_json");
  });

  it("marks intent failed_terminal for missing command", async () => {
    admitProcessIntent();
    // Corrupt payload directly to bypass registry validation and test executor defense.
    db.prepare("update intents set payload_json = ? where intent_id = ?").run(JSON.stringify({ args: [] }), "int-test");

    const result = await executor.processNext();
    expect(result.processed).toBe(true);

    const intent = intentStore.getById("int-test")!;
    expect(intent.status).toBe("failed_terminal");
    expect(intent.terminal_reason).toBe("Missing command");
  });

  it("persists cwd and env", async () => {
    admitProcessIntent({
      payload_json: JSON.stringify({
        command: process.platform === "win32" ? "cmd" : "pwd",
        args: process.platform === "win32" ? ["/c", "cd"] : [],
        cwd: "/",
        env: { TEST_VAR: "value" },
      }),
    });

    const result = await executor.processNext();
    expect(result.processed).toBe(true);

    const execution = executionStore.getById(result.executionId!)!;
    expect(execution.cwd).toBe("/");
    expect(JSON.parse(execution.env_json!)).toEqual({ TEST_VAR: "value" });
  });

  it("sets lease on execution start", async () => {
    admitProcessIntent();
    const result = await executor.processNext();
    expect(result.processed).toBe(true);

    const execution = executionStore.getById(result.executionId!)!;
    expect(execution.status).toBe("completed");
    expect(execution.lease_expires_at).not.toBeNull();
    expect(execution.lease_runner_id).toBe("default-runner");
  });

  it("recovers stale executions and resets intent to admitted", async () => {
    admitProcessIntent({ intent_id: "int-stale", idempotency_key: "key-stale" });
    const before = new Date().toISOString();

    // Simulate a crashed execution: create running execution with expired lease
    executionStore.create({
      execution_id: "pe-stale",
      intent_id: "int-stale",
      command: "sleep",
      args_json: "[\"100\"]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: before,
      completed_at: null,
      lease_expires_at: "2024-01-01T00:00:00.000Z",
      lease_runner_id: "runner-1",
    });
    intentStore.updateStatus("int-stale", "executing", { target_id: "pe-stale" });

    const recovered = executor.recoverStaleExecutions("2024-01-01T01:00:00.000Z");
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.executionId).toBe("pe-stale");

    const execution = executionStore.getById("pe-stale")!;
    expect(execution.status).toBe("failed");
    expect(execution.phase).toBe("failed");
    expect(execution.confirmation_status).toBe("unconfirmed");
    expect(execution.stderr).toContain("Recovered stale execution");

    const intent = intentStore.getById("int-stale")!;
    expect(intent.status).toBe("admitted");
    expect(intent.terminal_reason).toContain("Recovered stale execution");
  });

  it("recoverStaleExecutions is idempotent", async () => {
    admitProcessIntent({ intent_id: "int-stale", idempotency_key: "key-stale" });
    executionStore.create({
      execution_id: "pe-stale",
      intent_id: "int-stale",
      command: "sleep",
      args_json: "[\"100\"]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: new Date().toISOString(),
      completed_at: null,
      lease_expires_at: "2024-01-01T00:00:00.000Z",
      lease_runner_id: "runner-1",
    });
    intentStore.updateStatus("int-stale", "executing", { target_id: "pe-stale" });

    const r1 = executor.recoverStaleExecutions("2024-01-01T01:00:00.000Z");
    expect(r1).toHaveLength(1);

    const r2 = executor.recoverStaleExecutions("2024-01-01T01:00:00.000Z");
    expect(r2).toHaveLength(0);
  });
});
