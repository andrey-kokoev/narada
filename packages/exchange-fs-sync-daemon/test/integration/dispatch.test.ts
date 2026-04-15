import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSyncService,
  type SyncService,
} from "../../src/service.js";
import {
  Database,
  SqliteCoordinatorStore,
  MockCharterRunner,
  type NormalizedBatch,
  type NormalizedEvent,
  type GraphAdapter,
} from "@narada/exchange-fs-sync";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-dispatch-"));
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

describe("daemon dispatch phase integration", { timeout: 30000 }, () => {
  let rootDir: string;
  let configPath: string;
  let service: SyncService | null = null;

  beforeEach(() => {
    rootDir = createTempDir();
    configPath = writeConfig(rootDir, "test-mailbox");
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }
  });

  it("opens, leases, executes, and resolves a work item after sync", async () => {
    const conversationId = "conv-test-123";
    const mockAdapter = createMockAdapterForConversation(conversationId);

    const charterRunner = new MockCharterRunner({
      output: {
        output_version: "2.0",
        execution_id: "will-be-overridden",
        charter_id: "support_steward",
        role: "primary",
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "Test evaluation",
        classifications: [],
        facts: [],
        recommended_action_class: "send_reply",
        proposed_actions: [
          {
            action_type: "send_reply",
            authority: "recommended",
            payload_json: JSON.stringify({ body_text: "Hello" }),
            rationale: "Test action",
          },
        ],
        tool_requests: [],
        escalations: [],
      },
    });

    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: mockAdapter,
      charterRunner,
      pollingIntervalMs: 100000, // Long enough that we can stop before next poll
    });

    // Start service in background; it blocks until stopped
    const startPromise = service.start();

    // Wait for initial sync + dispatch to complete
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Stop the service
    await service.stop();
    await startPromise.catch(() => {
      // Ignore errors from stop interrupting the loop
    });

    // Verify control-plane state in SQLite
    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    const store = new SqliteCoordinatorStore({ db });

    const workItems = store.db
      .prepare("select * from work_items where conversation_id = ?")
      .all(conversationId) as Array<Record<string, unknown>>;

    expect(workItems.length).toBeGreaterThanOrEqual(1);

    const resolvedItem = workItems.find(
      (wi) => wi.status === "resolved"
    );
    expect(resolvedItem).toBeDefined();
    expect(resolvedItem!.resolution_outcome).toBe("action_created");

    // Verify an outbound command was created
    const commands = store.db
      .prepare("select * from outbound_commands where thread_id = ?")
      .all(conversationId) as Array<Record<string, unknown>>;

    expect(commands.length).toBeGreaterThanOrEqual(1);

    // Verify execution attempt was recorded
    const executions = store.db
      .prepare(
        "select * from execution_attempts where work_item_id = ? order by started_at desc"
      )
      .all(resolvedItem!.work_item_id) as Array<Record<string, unknown>>;

    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions[0]!.status).toBe("succeeded");

    db.close();
  });

  it("reaches quiescence when no conversations changed", async () => {
    const mockAdapter: GraphAdapter = {
      async fetch_since(): Promise<NormalizedBatch> {
        return {
          schema_version: 1,
          mailbox_id: "test-mailbox",
          adapter_scope: {
            mailbox_id: "test-mailbox",
            included_container_refs: ["inbox"],
            included_item_kinds: ["message"],
          },
          fetched_at: new Date().toISOString(),
          events: [],
          next_cursor: "cursor-empty",
          has_more: false,
        };
      },
    };

    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: mockAdapter,
      pollingIntervalMs: 100000,
    });

    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await service.stop();
    await startPromise.catch(() => undefined);

    // Service should have completed at least one cycle with no errors
    const stats = service.getStats();
    expect(stats.cyclesCompleted).toBeGreaterThanOrEqual(1);
    expect(stats.errors).toBe(0);
  });
});
