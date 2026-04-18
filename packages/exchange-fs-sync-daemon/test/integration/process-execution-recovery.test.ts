import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSyncService,
  type SyncService,
  type SyncServiceConfig,
} from "../../src/service.js";
import {
  Database,
  SqliteCoordinatorStore,
  SqliteIntentStore,
  SqliteProcessExecutionStore,
  ProcessExecutor,
  MockCharterRunner,
  type NormalizedBatch,
  type NormalizedEvent,
  type GraphAdapter,
} from "@narada2/exchange-fs-sync";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-process-recovery-"));
}

function writeConfig(rootDir: string, mailboxId: string): string {
  const configPath = join(rootDir, "config.json");
  const config = {
    mailbox_id: mailboxId,
    root_dir: rootDir,
    graph: {
      tenant_id: "test-tenant",
      client_id: "test-client-id",
      client_secret: "test-secret",
      user_id: mailboxId,
      base_url: "https://graph.microsoft.com/v1.0",
      prefer_immutable_ids: true,
    },
    scope: {
      included_container_refs: ["inbox"],
      included_item_kinds: ["message"],
    },
    normalize: {
      attachment_policy: "metadata_only",
      body_policy: "text_only",
      include_headers: false,
      tombstones_enabled: false,
    },
    runtime: {
      polling_interval_ms: 60000,
      acquire_lock_timeout_ms: 5000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
    },
    policy: {
      primary_charter: "support_steward",
      allowed_actions: ["send_reply", "mark_read", "no_action"],
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function createMockAdapter(): GraphAdapter {
  return {
    async fetch_since(): Promise<NormalizedBatch> {
      return {
        events: [],
        prior_cursor: null,
        next_cursor: null,
        has_more: false,
        fetched_at: new Date().toISOString(),
      };
    },
  };
}

describe("process execution recovery", () => {
  let rootDir: string;
  let configPath: string;
  let service: SyncService;

  beforeEach(async () => {
    rootDir = createTempDir();
    configPath = writeConfig(rootDir, "test-mailbox");
    service = await createSyncService({
      configPath,
      adapter: createMockAdapter(),
      pollingIntervalMs: 100_000,
    });
  });

  afterEach(async () => {
    await service.stop();
  });

  it("recovers stale process executions during dispatch phase", async () => {
    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    const intentStore = new SqliteIntentStore({ db });
    const executionStore = new SqliteProcessExecutionStore({ db });
    intentStore.initSchema();
    executionStore.initSchema();

    // Seed a stale running execution
    intentStore.admit({
      intent_id: "int-stale",
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ command: "echo", args: ["hello"] }),
      idempotency_key: "key-stale",
      status: "executing",
      context_id: "ctx-stale",
      target_id: "pe-stale",
      terminal_reason: null,
    });

    executionStore.create({
      execution_id: "pe-stale",
      intent_id: "int-stale",
      command: "echo",
      args_json: "[\"hello\"]",
      cwd: null,
      env_json: null,
      status: "running",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: "2024-01-01T00:00:00.000Z",
      completed_at: null,
      lease_expires_at: "2024-01-01T00:01:00.000Z",
      lease_runner_id: "runner-test",
    });

    db.close();

    // Start service: dispatch phase should recover stale execution
    const startPromise = service.start();
    await new Promise((r) => setTimeout(r, 1500));
    await service.stop();
    await startPromise;

    // Verify recovery by reopening the database
    const db2 = new Database(dbPath);
    const intentStore2 = new SqliteIntentStore({ db: db2 });
    const executionStore2 = new SqliteProcessExecutionStore({ db: db2 });

    const intent = intentStore2.getById("int-stale")!;
    expect(intent.status).toBe("completed");

    const execution = executionStore2.getById("pe-stale")!;
    expect(execution.status).toBe("failed");
    expect(execution.stderr).toContain("Recovered stale execution");

    db2.close();
  });

  it("does not affect healthy running executions", async () => {
    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    const intentStore = new SqliteIntentStore({ db });
    const executionStore = new SqliteProcessExecutionStore({ db });
    intentStore.initSchema();
    executionStore.initSchema();

    const future = new Date(Date.now() + 300_000).toISOString();

    intentStore.admit({
      intent_id: "int-healthy",
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ command: "sleep", args: ["100"] }),
      idempotency_key: "key-healthy",
      status: "executing",
      context_id: "ctx-healthy",
      target_id: "pe-healthy",
      terminal_reason: null,
    });

    executionStore.create({
      execution_id: "pe-healthy",
      intent_id: "int-healthy",
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
      lease_expires_at: future,
      lease_runner_id: "runner-test",
    });

    db.close();

    const startPromise = service.start();
    await new Promise((r) => setTimeout(r, 1500));
    await service.stop();
    await startPromise;

    const db2 = new Database(dbPath);
    const intentStore2 = new SqliteIntentStore({ db: db2 });
    const executionStore2 = new SqliteProcessExecutionStore({ db: db2 });

    const intent = intentStore2.getById("int-healthy")!;
    expect(intent.status).toBe("executing");

    const execution = executionStore2.getById("pe-healthy")!;
    expect(execution.status).toBe("running");

    db2.close();
  });
});
