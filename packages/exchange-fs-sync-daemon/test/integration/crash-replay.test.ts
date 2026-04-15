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
  type WorkItem,
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
    policy: {
      primary_charter: "support_steward",
      allowed_actions: ["send_reply", "mark_read", "no_action"],
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function createMockAdapterForConversation(
  conversationId: string,
  eventSuffix = "1",
): GraphAdapter {
  return {
    async fetch_since(): Promise<NormalizedBatch> {
      const event: NormalizedEvent = {
        event_id: `evt_${conversationId}_${eventSuffix}`,
        event_kind: "created",
        message_id: `msg_${conversationId}_${eventSuffix}`,
        mailbox_id: "test-mailbox",
        conversation_id: conversationId,
        observed_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        payload: {
          schema_version: 1,
          mailbox_id: "test-mailbox",
          message_id: `msg_${conversationId}_${eventSuffix}`,
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
      payload_json: JSON.stringify({ to: ["a@example.com"], body_text: "Hello" }),
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
    requires_approval: false,
    timeout_ms: 5000,
  },
];

const testToolDefinitions: Record<string, ToolDefinition> = {
  echo_test: {
    id: "echo_test",
    source_type: "local_executable",
    executable_path: process.platform === "win32" ? "cmd" : "/bin/echo",
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

function countRows(dbPath: string, sql: string, params: unknown[] = []): number {
  const db = new Database(dbPath);
  const row = db.prepare(sql).get(...params) as { c: number };
  db.close();
  return row.c;
}

function getWorkItem(dbPath: string, conversationId: string): Record<string, unknown> | undefined {
  const db = new Database(dbPath);
  const row = db.prepare("select * from work_items where conversation_id = ? order by created_at desc limit 1").get(conversationId) as Record<string, unknown> | undefined;
  db.close();
  return row;
}

function getLeases(dbPath: string, workItemId: string): Array<Record<string, unknown>> {
  const db = new Database(dbPath);
  const rows = db.prepare("select * from work_item_leases where work_item_id = ? order by acquired_at asc").all(workItemId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function getAttempts(dbPath: string, workItemId: string): Array<Record<string, unknown>> {
  const db = new Database(dbPath);
  const rows = db.prepare("select * from execution_attempts where work_item_id = ? order by started_at asc").all(workItemId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function getEvaluations(dbPath: string, workItemId: string): Array<Record<string, unknown>> {
  const db = new Database(dbPath);
  const rows = db.prepare("select * from evaluations where work_item_id = ? order by analyzed_at asc").all(workItemId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function getCommands(dbPath: string, conversationId: string): Array<Record<string, unknown>> {
  const db = new Database(dbPath);
  const rows = db.prepare("select * from outbound_commands where conversation_id = ? order by created_at asc").all(conversationId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

describe("crash replay determinism", { timeout: 30000 }, () => {
  let rootDir: string;
  let configPath: string;
  let service: SyncService | null = null;
  let dbPath: string;

  beforeEach(() => {
    rootDir = createTempDir();
    configPath = writeConfig(rootDir, "test-mailbox");
    dbPath = join(rootDir, ".narada", "coordinator.db");
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
      afterSyncCompleted: async () => controller.maybeCrash("afterSyncCompleted"),
      afterWorkOpened: async () => controller.maybeCrash("afterWorkOpened"),
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

  // -------------------------------------------------------------------------
  // Crash point tests
  // -------------------------------------------------------------------------

  it("A: crash after sync completion recovers to resolved on restart", async () => {
    const conversationId = "conv-crash-A";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "afterSyncCompleted");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);

    const attempts = getAttempts(dbPath, item!.work_item_id as string);
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.status).toBe("succeeded");

    const evaluations = getEvaluations(dbPath, item!.work_item_id as string);
    expect(evaluations.length).toBe(1);
  });

  it("B: crash after work open recovers to resolved on restart", async () => {
    const conversationId = "conv-crash-B";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "afterWorkOpened");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const leases = getLeases(dbPath, item!.work_item_id as string);
    expect(leases.some((l) => l.release_reason === "success")).toBe(true);
  });

  it("C: crash after lease acquisition is recovered on restart", async () => {
    const conversationId = "conv-crash-C";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "afterLeaseAcquired");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const leases = getLeases(dbPath, item!.work_item_id as string);
    const activeLease = leases.find((l) => l.released_at === null);
    expect(activeLease).toBeUndefined();
  });

  it("D: crash during charter runtime is recovered on restart", async () => {
    const conversationId = "conv-crash-D";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new FailingCharterRunner(1);
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "beforeRuntimeInvoke");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, new MockCharterRunner({ output: successOutput }));
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const attempts = getAttempts(dbPath, item!.work_item_id as string);
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts[0]!.status).toBe("abandoned");
    expect(attempts[attempts.length - 1]!.status).toBe("succeeded");

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);
  });

  it("E: crash after runtime before tools is recovered on restart", async () => {
    const conversationId = "conv-crash-E";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "afterRuntimeComplete");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");
  });

  it("F: crash during tool execution is recovered on restart and tools converge", async () => {
    const conversationId = "conv-crash-F";
    const adapter = createMockAdapterForConversation(conversationId);
    const outputWithTools = {
      ...successOutput,
      tool_requests: [
        {
          tool_id: "echo_test",
          arguments_json: JSON.stringify({ input: "hello" }),
          purpose: "test",
        },
      ],
    };
    const runner = new MockCharterRunner({ output: outputWithTools });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "duringToolExecution");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const tools = getAttempts(dbPath, item!.work_item_id as string);
    expect(tools.length).toBeGreaterThanOrEqual(1);

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);
  });

  it("G: crash before resolve does not create duplicate commands", async () => {
    const conversationId = "conv-crash-G";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });
    const controller = new CrashController();

    await startServiceAndWaitForCrash(adapter, runner, controller, "beforeResolveWorkItem");
    expireAllLeasesAndClearRetry(dbPath);
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);

    const decisions = countRows(dbPath, "select count(*) as c from foreman_decisions where conversation_id = ?", [conversationId]);
    expect(decisions).toBe(1);
  });

  it("H: stale lease is recovered automatically without duplicate effects", async () => {
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
    const db = new Database(dbPath);
    const lease = db
      .prepare("select * from work_item_leases order by acquired_at desc limit 1")
      .get() as Record<string, unknown> | undefined;
    if (lease) {
      db.prepare("update work_item_leases set expires_at = datetime('now', '-1 second') where lease_id = ?").run(lease.lease_id);
    }
    db.prepare("update work_items set next_retry_at = null where status = 'failed_retryable'").run();
    db.close();

    // Restart service; it should recover the stale lease and resolve the work item
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);
  });

  it("I: supersession after restart is deterministic when new message arrives", async () => {
    const conversationId = "conv-supersede";
    const firstAdapter = createMockAdapterForConversation(conversationId, "1");
    const runner = new MockCharterRunner({ output: successOutput });

    // First run: crash before resolve to leave work item executing
    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: firstAdapter,
      charterRunner: runner,
      toolCatalog: testToolCatalog,
      toolDefinitions: testToolDefinitions,
      dispatchHooks: {
        beforeResolveWorkItem: async () => {
          throw new Error("Crash before resolve");
        },
      },
      schedulerOptions: { defaultLeaseDurationMs: 3000 },
      pollingIntervalMs: 100000,
    });
    const p1 = service.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try { await service.stop(); } catch {}
    try { await p1; } catch {}
    service = null;

    // Capture the original work item id
    const originalItem = getWorkItem(dbPath, conversationId);
    expect(originalItem).toBeDefined();
    // After crash at beforeResolveWorkItem, the item may be executing or failed_retryable depending on whether the scheduler
    // transitions it before the crash propagates; accept either and then ensure we can retry.
    expect(["executing", "failed_retryable"]).toContain(originalItem!.status);

    // Expire lease so the old work item becomes retryable (idempotent if already failed_retryable)
    expireAllLeasesAndClearRetry(dbPath);

    // Second run: a new message arrives for the same conversation
    const secondAdapter = createMockAdapterForConversation(conversationId, "2");
    const svc = await createSyncService({
      configPath,
      verbose: false,
      adapter: secondAdapter,
      charterRunner: runner,
      toolCatalog: testToolCatalog,
      toolDefinitions: testToolDefinitions,
      pollingIntervalMs: 100000,
    });
    const p2 = svc.start();
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await svc.stop();
    try { await p2; } catch {}
    service = null;

    // Verify deterministic terminal state
    const db = new Database(dbPath);
    const items = db.prepare("select * from work_items where conversation_id = ? order by created_at asc").all(conversationId) as Array<Record<string, unknown>>;
    db.close();

    expect(items.length).toBe(2);
    expect(items[0]!.status).toBe("superseded");
    expect(items[1]!.status).toBe("resolved");

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);
  });

  it("J: idempotency — restart on resolved work is a no-op with no duplicate effects", async () => {
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
    const firstCommands = getCommands(dbPath, conversationId);
    const item = getWorkItem(dbPath, conversationId);
    const firstAttempts = item ? getAttempts(dbPath, item.work_item_id as string) : [];

    // Second run with same adapter (no new events)
    const svc = await restartService(adapter, runner);
    await svc.stop();

    const secondCommands = getCommands(dbPath, conversationId);
    const secondAttempts = item ? getAttempts(dbPath, item.work_item_id as string) : [];

    expect(secondCommands.length).toBe(firstCommands.length);
    expect(secondAttempts.length).toBe(firstAttempts.length);
  });

  it("K: convergence — multiple crash cycles converge to one command", async () => {
    const conversationId = "conv-converge";
    const adapter = createMockAdapterForConversation(conversationId);
    const runner = new MockCharterRunner({ output: successOutput });

    for (let i = 0; i < 3; i++) {
      service = await createSyncService({
        configPath,
        verbose: false,
        adapter,
        charterRunner: runner,
        toolCatalog: testToolCatalog,
        toolDefinitions: testToolDefinitions,
        dispatchHooks: {
          beforeResolveWorkItem: async () => {
            if (i < 2) throw new Error(`Crash cycle ${i}`);
          },
        },
        schedulerOptions: { defaultLeaseDurationMs: 3000 },
        pollingIntervalMs: 100000,
      });
      const p = service.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try { await service.stop(); } catch {}
      try { await p; } catch {}
      service = null;

      expireAllLeasesAndClearRetry(dbPath);
    }

    const item = getWorkItem(dbPath, conversationId);
    expect(item).toBeDefined();
    expect(item!.status).toBe("resolved");

    const commands = getCommands(dbPath, conversationId);
    expect(commands.length).toBe(1);

    const decisions = countRows(dbPath, "select count(*) as c from foreman_decisions where conversation_id = ?", [conversationId]);
    expect(decisions).toBe(1);
  });
});
