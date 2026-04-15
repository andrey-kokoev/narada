import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncService, type SyncService } from "../../src/service.js";
import { Database, SqliteCoordinatorStore, MockCharterRunner, type NormalizedBatch, type NormalizedEvent, type GraphAdapter } from "@narada/exchange-fs-sync";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "efs-daemon-policy-"));
}

function writeConfig(rootDir: string, mailboxId: string, policy?: Record<string, unknown>): string {
  const configPath = join(rootDir, "config.json");
  const config: Record<string, unknown> = {
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
  if (policy) {
    config.policy = policy;
  }
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

describe("daemon policy routing integration", { timeout: 30000 }, () => {
  let rootDir: string;
  let service: SyncService | null = null;

  beforeEach(() => {
    rootDir = createTempDir();
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }
  });

  it("routes to the configured primary charter in conversation records", async () => {
    const conversationId = "conv-policy-1";
    const configPath = writeConfig(rootDir, "test-mailbox", {
      primary_charter: "obligation_keeper",
      allowed_actions: ["send_reply", "no_action"],
    });

    const charterRunner = new MockCharterRunner({
      output: {
        output_version: "2.0",
        execution_id: "will-be-overridden",
        charter_id: "obligation_keeper",
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
      adapter: createMockAdapterForConversation(conversationId),
      charterRunner,
      pollingIntervalMs: 100000,
    });

    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await service.stop();
    await startPromise.catch(() => undefined);

    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    const store = new SqliteCoordinatorStore({ db });

    const record = store.getConversationRecord(conversationId);
    expect(record).toBeDefined();
    expect(record!.primary_charter).toBe("obligation_keeper");

    store.close();
    db.close();
  });

  it("exposes only policy-allowed tools in the invocation envelope", async () => {
    const conversationId = "conv-tools";
    const configPath = writeConfig(rootDir, "test-mailbox", {
      primary_charter: "support_steward",
      allowed_actions: ["send_reply", "no_action"],
      allowed_tools: ["echo_test"],
    });

    let capturedEnvelope: import("@narada/exchange-fs-sync").CharterInvocationEnvelope | undefined;

    const charterRunner = {
      async run(envelope: import("@narada/exchange-fs-sync").CharterInvocationEnvelope) {
        capturedEnvelope = envelope;
        return {
          output_version: "2.0" as const,
          execution_id: envelope.execution_id,
          charter_id: envelope.charter_id,
          role: envelope.role,
          analyzed_at: new Date().toISOString(),
          outcome: "no_op" as const,
          confidence: { overall: "high" as const, uncertainty_flags: [] },
          summary: "Test",
          classifications: [],
          facts: [],
          proposed_actions: [],
          tool_requests: [],
          escalations: [],
        };
      },
    };

    service = await createSyncService({
      configPath,
      verbose: false,
      adapter: createMockAdapterForConversation(conversationId),
      charterRunner: charterRunner as any,
      pollingIntervalMs: 100000,
    });

    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await service.stop();
    await startPromise.catch(() => undefined);

    expect(capturedEnvelope).toBeDefined();
    expect(capturedEnvelope!.available_tools).toHaveLength(1);
    expect(capturedEnvelope!.available_tools[0].tool_id).toBe("echo_test");
  });

  it("uses default policy when none is explicitly configured", async () => {
    const conversationId = "conv-default";
    const configPath = writeConfig(rootDir, "test-mailbox");

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
      adapter: createMockAdapterForConversation(conversationId),
      charterRunner,
      pollingIntervalMs: 100000,
    });

    const startPromise = service.start();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await service.stop();
    await startPromise.catch(() => undefined);

    const dbPath = join(rootDir, ".narada", "coordinator.db");
    const db = new Database(dbPath);
    const store = new SqliteCoordinatorStore({ db });

    const record = store.getConversationRecord(conversationId);
    expect(record).toBeDefined();
    expect(record!.primary_charter).toBe("support_steward");

    store.close();
    db.close();
  });
});
