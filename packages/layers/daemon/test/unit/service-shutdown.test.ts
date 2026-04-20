import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createScopeService, createSyncService } from "../../src/service.js";
import { createLogger } from "../../src/lib/logger.js";
import {
  MockCharterRunner,
  type GraphAdapter,
  type NormalizedBatch,
  type NormalizedEvent,
  type ScopeConfig,
  type ExchangeFsSyncConfig,
} from "@narada2/control-plane";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-shutdown-"));
}

function buildMinimalScopeConfig(rootDir: string): ScopeConfig {
  return {
    scope_id: "test-mailbox",
    root_dir: rootDir,
    sources: [
      {
        type: "graph",
        tenant_id: "test-tenant",
        client_id: "test-client-id",
        client_secret: "test-secret",
        user_id: "test-mailbox",
        base_url: "https://graph.microsoft.com/v1.0",
        prefer_immutable_ids: true,
      },
    ],
    context_strategy: "mail",
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
      allowed_actions: [],
      allowed_tools: [],
    },
  };
}

function writeConfig(rootDir: string): string {
  const configPath = join(rootDir, "config.json");
  const scopeConfig = buildMinimalScopeConfig(rootDir);
  const config = {
    mailbox_id: scopeConfig.scope_id,
    root_dir: rootDir,
    graph: scopeConfig.sources[0],
    scope: scopeConfig.scope,
    normalize: scopeConfig.normalize,
    runtime: scopeConfig.runtime,
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function createMockAdapter(conversationId = "conv-1"): GraphAdapter {
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
          flags: { is_read: false },
          importance: "normal",
        },
      };
      return { events: [event], cursor: "c1", has_more: false };
    },
  };
}

describe("releaseActiveLeases", () => {
  let rootDir: string;
  let scopeService: Awaited<ReturnType<typeof createScopeService>>;

  beforeEach(async () => {
    rootDir = createTempDir();
    const logger = createLogger({ component: "test", verbose: false });
    const scopeConfig = buildMinimalScopeConfig(rootDir);
    const globalConfig: ExchangeFsSyncConfig = {
      root_dir: rootDir,
      scopes: [scopeConfig],
    };
    scopeService = await createScopeService(scopeConfig, globalConfig, {}, logger);
    // Initialize dispatch deps so releaseActiveLeases can access the database
    await scopeService.dispatchContext.getObservationApiScope();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("releases active leases, resets work items to opened, and abandons active execution attempts", async () => {
    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);

    const now = new Date().toISOString();
    const workItemId = "wi_test_1";
    const leaseId = "ls_test_1";
    const executionId = "ex_test_1";
    const revisionId = "rev_test_1";
    const contextId = "ctx_1";

    // Seed required parent records
    db.prepare(
      `INSERT INTO context_records (context_id, scope_id, primary_charter, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(contextId, "test-mailbox", "support_steward", "active", now, now);

    // Seed a work item
    db.prepare(
      `INSERT INTO work_items (
        work_item_id, context_id, scope_id, status, priority,
        opened_for_revision_id, resolved_revision_id, resolution_outcome,
        error_message, retry_count, next_retry_at, context_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workItemId, contextId, "test-mailbox", "leased", 1,
      revisionId, null, null, null, 0, null, null, now, now
    );

    // Seed an active lease
    db.prepare(
      `INSERT INTO work_item_leases (
        lease_id, work_item_id, runner_id, acquired_at, expires_at, released_at, release_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      leaseId, workItemId, "runner-1", now, new Date(Date.now() + 60000).toISOString(), null, null
    );

    // Seed an active execution attempt
    db.prepare(
      `INSERT INTO execution_attempts (
        execution_id, work_item_id, revision_id, session_id, status,
        started_at, completed_at, runtime_envelope_json, outcome_json, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      executionId, workItemId, revisionId, "sess_1", "active",
      now, null, "{}", null, null
    );

    // Invoke releaseActiveLeases
    const count = await scopeService.dispatchContext.releaseActiveLeases("shutdown");
    expect(count).toBe(1);

    // Verify lease was released with shutdown reason
    const lease = db.prepare(
      `SELECT * FROM work_item_leases WHERE lease_id = ?`
    ).get(leaseId) as Record<string, unknown> | undefined;
    expect(lease).toBeDefined();
    expect(lease!.release_reason).toBe("shutdown");
    expect(lease!.released_at).not.toBeNull();

    // Verify work item returned to opened
    const workItem = db.prepare(
      `SELECT * FROM work_items WHERE work_item_id = ?`
    ).get(workItemId) as Record<string, unknown> | undefined;
    expect(workItem).toBeDefined();
    expect(workItem!.status).toBe("opened");

    // Verify execution attempt was abandoned
    const attempt = db.prepare(
      `SELECT * FROM execution_attempts WHERE execution_id = ?`
    ).get(executionId) as Record<string, unknown> | undefined;
    expect(attempt).toBeDefined();
    expect(attempt!.status).toBe("abandoned");
    expect(attempt!.completed_at).not.toBeNull();

    db.close();
  });

  it("returns 0 when there are no active leases", async () => {
    const count = await scopeService.dispatchContext.releaseActiveLeases("shutdown");
    expect(count).toBe(0);
  });
});

describe("stop() timeout path", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = createTempDir();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("force-releases leases when drain exceeds maxDrainMs", async () => {
    const configPath = writeConfig(rootDir);
    const mockAdapter = createMockAdapter();

    let leaseAcquired = false;
    let afterLeaseAcquiredResolve: (() => void) | null = null;
    const afterLeaseAcquiredPromise = new Promise<void>((resolve) => {
      afterLeaseAcquiredResolve = resolve;
    });

    const svc = await createSyncService({
      configPath,
      maxDrainMs: 100,
      pidFilePath: join(rootDir, "daemon.pid"),
      adapter: mockAdapter,
      charterRunner: new MockCharterRunner({
        output: {
          output_version: "2.0",
          execution_id: "mock-exec",
          charter_id: "support_steward",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "no_op",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Mock evaluation: no action required",
          classifications: [],
          facts: [],
          proposed_actions: [],
          tool_requests: [],
          escalations: [],
        },
      }),
      dispatchHooks: {
        afterLeaseAcquired: async () => {
          leaseAcquired = true;
          await afterLeaseAcquiredPromise;
        },
      },
    });

    const startPromise = svc.start();

    // Wait until the dispatch phase has acquired a lease
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (leaseAcquired) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    // stop() should time out after maxDrainMs (100ms) and return promptly
    const stopStart = Date.now();
    await svc.stop();
    const stopDuration = Date.now() - stopStart;
    expect(stopDuration).toBeGreaterThanOrEqual(50);
    expect(stopDuration).toBeLessThan(2000);

    // Verify PID file was removed
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(rootDir, "daemon.pid"))).toBe(false);

    // Reopen the DB to verify leases were force-released
    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    const lease = db.prepare(
      `SELECT * FROM work_item_leases WHERE released_at IS NOT NULL`
    ).get() as Record<string, unknown> | undefined;
    expect(lease).toBeDefined();
    expect(lease!.release_reason).toBe("shutdown");
    db.close();

    // Release the hook so start() can finish
    afterLeaseAcquiredResolve!();

    // start() should settle without hanging forever (it may resolve or reject
    // because the DB was closed during stop(); either is acceptable).
    await Promise.race([
      startPromise.then(() => undefined).catch(() => undefined),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("start() hung")), 5000)
      ),
    ]);
  });
});
