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
  MockCharterRunner,
  type NormalizedBatch,
  type NormalizedEvent,
  type GraphAdapter,
  type ToolCatalogEntry,
} from "@narada/exchange-fs-sync";
import type { ToolDefinition } from "@narada/charters";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-crash-"));
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
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function createMockAdapterForConversation(conversationId: string): GraphAdapter {
  return {
    async fetch_since(): Promise<NormalizedBatch> {
      const event: NormalizedEvent = {
        event_id: `evt_${conversationId}_1`,
        event_kind: "created",
        message_id: `msg_${conversationId}_1`,
        mailbox_id: "test-mailbox",
        conversation_id: conversationId,
        observed_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        payload: {
          schema_version: 1,
          mailbox_id: "test-mailbox",
          message_id: `msg_${conversationId}_1`,
          conversation_id: conversationId,
          received_at: new Date().toISOString(),
          subject: "Test subject",
          to: [{ email: "to@example.com" }],
          cc: [],
          bcc: [],
          folder_refs: ["inbox"],
          category_refs: [],
          flags: {
            is_read: false,
            is_draft: false,
            is_flagged: false,
            has_attachments: false,
          },
          attachments: [],
        },
      };

      return {
        schema_version: 1,
        mailbox_id: "test-mailbox",
        adapter_scope: {
          mailbox_id: "test-mailbox",
          included_container_refs: ["inbox"],
          included_item_kinds: ["message"],
        },
        fetched_at: new Date().toISOString(),
        events: [event],
        next_cursor: "cursor-1",
        has_more: false,
      };
    },
  };
}

const successOutput = {
  output_version: "2.0" as const,
  execution_id: "will-be-overridden",
  charter_id: "support_steward",
  role: "primary" as const,
  analyzed_at: new Date().toISOString(),
  outcome: "complete" as const,
  confidence: { overall: "high" as const, uncertainty_flags: [] },
  summary: "Test evaluation",
  classifications: [],
  facts: [],
  recommended_action_class: "send_reply",
  proposed_actions: [
    {
      action_type: "send_reply" as const,
      authority: "recommended" as const,
      payload_json: JSON.stringify({ body_text: "Hello" }),
      rationale: "Test action",
    },
  ],
  tool_requests: [],
  escalations: [],
};

const testToolCatalog: ToolCatalogEntry[] = [
  {
    tool_id: "echo_test",
    tool_signature: "echo_test(input: string)",
    description: "Echoes input for testing tool execution path",
    schema_args: [{ name: "input", type: "string", required: true, description: "Input to echo" }],
    read_only: true,
  },
];

const testToolDefinitions: Record<string, ToolDefinition> = {
  echo_test: {
    name: "echo_test",
    description: "Echoes input",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    },
  },
};

class FailingCharterRunner {
  private failCount: number;
  private delegate: MockCharterRunner;

  constructor(failCount: number) {
    this.failCount = failCount;
    this.delegate = new MockCharterRunner({ output: successOutput });
  }

  async run(envelope: unknown) {
    if (this.failCount > 0) {
      this.failCount--;
      throw new Error("Simulated charter runtime crash");
    }
    return this.delegate.run(envelope);
  }
}

class CrashController {
  private crashes = new Map<string, Error>();

  scheduleCrash(hookName: string, error?: Error): void {
    this.crashes.set(hookName, error ?? new Error(`Crash at ${hookName}`));
  }

  maybeCrash(hookName: string): void {
    const err = this.crashes.get(hookName);
    if (err) {
      this.crashes.delete(hookName);
      throw err;
    }
  }
}

function expireAllLeasesAndClearRetry(dbPath: string): void {
  const db = new Database(dbPath);
  db.prepare(`
    update work_item_leases
    set expires_at = datetime('now', '-1 second')
    where released_at is null
  `).run();
  db.prepare(`
    update work_items
    set next_retry_at = null
    where status = 'failed_retryable'
  `).run();
  db.close();
}

describe("crash replay determinism", { timeout: 30000 }, () => {
  let rootDir: string;
  let configPath: string;
  let service: SyncService | null = null;

  beforeEach(() => {
    rootDir = createTempDir();
    configPath = writeConfig(rootDir, "test-mailbox");
  });

  afterEach(async () => {
    if (service) {
      try {
        await service.stop();
      } catch {
        // ignore
      }
      service = null;
    }
  });

  function createHooks(controller: CrashController): SyncServiceConfig["dispatchHooks"] {
    return {
      afterLeaseAcquired: async () => controller.maybeCrash("afterLeaseAcquired"),
      beforeRuntimeInvoke: async () => controller.maybeCrash("beforeRuntimeInvoke"),
      afterRuntimeComplete: async () => controller.maybeCrash("afterRuntimeComplete"),
      beforeToolExecution: async () => controller.maybeCrash("beforeToolExecution"),
      duringToolExecution: async () => controller.maybeCrash("duringToolExecution"),
      afterToolExecution: async () => controller.maybeCrash("afterToolExecution"),
      beforeResolveWorkItem: async () => controller.maybeCrash("beforeResolveWorkItem"),
    };
  }

  async function startServiceAndWaitForCrash(
    adapter: GraphAdapter,
    charterRunner: any,
    controller: CrashController,
    hookName: string,
  ): Promise<void> {
    controller.scheduleCrash(hookName);
    service = await createSyncService({
      configPath,
      verbose: false,
      adapter,
      charterRunner,
      toolCatalog: testToolCatalog,
      toolDefinitions: testToolDefinitions,
      dispatchHooks: createHooks(controller),
      schedulerOptions: { defaultLeaseDurationMs: 3000 },
      pollingIntervalMs: 100000,
    });
    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await service.stop();
    } catch {
      // ignore
    }
    try {
      await startPromise;
    } catch {
      // ignore
    }
    service = null;
  }

  async function restartService(adapter: GraphAdapter, charterRunner: any): Promise<SyncService> {
    const svc = await createSyncService({
      configPath,
      verbose: false,
      adapter,
      charterRunner,
      toolCatalog: testToolCatalog,
      toolDefinitions: testToolDefinitions,
      pollingIntervalMs: 100000,
    });
    const startPromise = svc.start();
    await new Promise((resolve) => setTimeout(resolve, 4000));
    service = svc;
    return svc;
  }

  function openDb() {
    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    return { db, store: new SqliteCoordinatorStore({ db }) };
  }

  it("A: crash after lease acquisition is recovered on restart", async () => {
    const conversationId = "conv-crash-A";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "afterLeaseAcquired");
    expireAllLeasesAndClearRetry(join(rootDir, ".narada", "coordinator.db"));
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const { db, store } = openDb();
    const items = store.db.prepare("select * from work_items where conversation_id = ?").all(conversationId) as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("resolved");
    db.close();
  });

  it("B: crash during charter runtime is recovered on restart", async () => {
    const conversationId = "conv-crash-B";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new FailingCharterRunner(1);
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "beforeRuntimeInvoke");
    expireAllLeasesAndClearRetry(join(rootDir, ".narada", "coordinator.db"));
    const svc = await restartService(adapter, new MockCharterRunner({ output: successOutput }));
    await svc.stop();

    const { db, store } = openDb();
    const items = store.db.prepare("select * from work_items where conversation_id = ?").all(conversationId) as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("resolved");

    const attempts = store.db
      .prepare("select * from execution_attempts where work_item_id = ? order by started_at asc")
      .all(items[0]!.work_item_id) as Array<Record<string, unknown>>;
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it("C: crash after runtime before tools is recovered on restart", async () => {
    const conversationId = "conv-crash-C";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "afterRuntimeComplete");
    expireAllLeasesAndClearRetry(join(rootDir, ".narada", "coordinator.db"));
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const { db, store } = openDb();
    const items = store.db.prepare("select * from work_items where conversation_id = ?").all(conversationId) as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("resolved");
    db.close();
  });

  it("D: crash during tool execution is recovered on restart", async () => {
    const conversationId = "conv-crash-D";
    const adapter = createMockAdapterForConversation(conversationId);
    const outputWithTools = {
      ...successOutput,
      tool_requests: [
        {
          tool_id: "echo_test",
          arguments_json: JSON.stringify({ input: "hello" }),
        },
      ],
    };
    const runner = new MockCharterRunner({ output: outputWithTools });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "duringToolExecution");
    expireAllLeasesAndClearRetry(join(rootDir, ".narada", "coordinator.db"));
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const { db, store } = openDb();
    const items = store.db.prepare("select * from work_items where conversation_id = ?").all(conversationId) as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("resolved");

    const tools = store.db
      .prepare("select * from tool_call_records where work_item_id = ?")
      .all(items[0]!.work_item_id) as Array<Record<string, unknown>>;
    expect(tools.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("E: crash before resolve does not create duplicate commands", async () => {
    const conversationId = "conv-crash-E";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "beforeResolveWorkItem");
    expireAllLeasesAndClearRetry(join(rootDir, ".narada", "coordinator.db"));
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const { db, store } = openDb();
    const items = store.db.prepare("select * from work_items where conversation_id = ?").all(conversationId) as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("resolved");

    const commands = store.db
      .prepare("select * from outbound_commands where conversation_id = ?")
      .all(conversationId) as Array<Record<string, unknown>>;
    expect(commands.length).toBe(1);
    db.close();
  });

  it("F: stale lease is recovered automatically", async () => {
    const conversationId = "conv-stale";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });

    // First, run normally but stop before resolve to leave an active lease
    service = await createSyncService({
      configPath,
      verbose: false,
      adapter,
      charterRunner: runner,
      toolCatalog: testToolCatalog,
      toolDefinitions: testToolDefinitions,
      dispatchHooks: {
        beforeResolveWorkItem: async () => {
          throw new Error("Stop before resolve to leave lease");
        },
      },
      schedulerOptions: { defaultLeaseDurationMs: 500 },
      pollingIntervalMs: 100000,
    });
    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await service.stop();
    } catch {}
    try {
      await startPromise;
    } catch {}
    service = null;

    // Manually expire the lease and clear retry backoff
    const { db: db1, store: store1 } = openDb();
    const lease = store1.db
      .prepare("select * from work_item_leases order by acquired_at desc limit 1")
      .get() as Record<string, unknown> | undefined;
    if (lease) {
      store1.db.prepare("update work_item_leases set expires_at = datetime('now', '-1 second') where lease_id = ?").run(lease.lease_id);
    }
    store1.db.prepare("update work_items set next_retry_at = null where status = 'failed_retryable'").run();
    db1.close();

    // Restart service; it should recover the stale lease and resolve the work item
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const { db, store } = openDb();
    const items = store.db.prepare("select * from work_items where conversation_id = ?").all(conversationId) as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0]!.status).toBe("resolved");
    db.close();
  });

  it("idempotency: restart on resolved work is a no-op", async () => {
    const conversationId = "conv-idempotent";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });

    // First run resolves normally
    service = await createSyncService({
      configPath,
      verbose: false,
      adapter,
      charterRunner: runner,
      toolCatalog: testToolCatalog,
      toolDefinitions: testToolDefinitions,
      pollingIntervalMs: 100000,
    });
    const p1 = service.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await service.stop();
    try { await p1; } catch {}
    service = null;

    // Capture state after first run
    const { db: db1, store: store1 } = openDb();
    const firstCommands = store1.db
      .prepare("select * from outbound_commands where conversation_id = ?")
      .all(conversationId) as Array<Record<string, unknown>>;
    const item = store1.db
      .prepare("select work_item_id from work_items where conversation_id = ?")
      .get(conversationId) as { work_item_id: string } | undefined;
    const firstAttempts = item
      ? (store1.db.prepare("select * from execution_attempts where work_item_id = ?").all(item.work_item_id) as Array<Record<string, unknown>>)
      : [];
    db1.close();

    // Second run with same adapter (no new events)
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const { db, store } = openDb();
    const secondCommands = store.db
      .prepare("select * from outbound_commands where conversation_id = ?")
      .all(conversationId) as Array<Record<string, unknown>>;
    const secondAttempts = item
      ? (store.db.prepare("select * from execution_attempts where work_item_id = ?").all(item.work_item_id) as Array<Record<string, unknown>>)
      : [];

    expect(secondCommands.length).toBe(firstCommands.length);
    expect(secondAttempts.length).toBe(firstAttempts.length);
    db.close();
  });
});
