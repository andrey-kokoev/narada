import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { RegisteredSite } from "@narada2/windows-site";
import {
  linuxSiteAdapter,
  LinuxSiteObservationApi,
  LinuxSiteControlClient,
} from "../src/console-adapter.js";
import { SqliteSiteCoordinator } from "../src/coordinator.js";
import type {
  LinuxSiteControlContext,
  LinuxSiteControlContextFactory,
} from "../src/site-control.js";

function makeSite(overrides: Partial<RegisteredSite> = {}): RegisteredSite {
  return {
    siteId: "test-linux-site",
    variant: "linux-user",
    siteRoot: "/tmp/test-linux-site",
    substrate: "linux",
    aimJson: null,
    controlEndpoint: null,
    lastSeenAt: null,
    createdAt: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

describe("linuxSiteAdapter", () => {
  describe("supports", () => {
    it("returns true for linux-user variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "linux-user" }))).toBe(true);
    });

    it("returns true for linux-system variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "linux-system" }))).toBe(true);
    });

    it("returns true for linux substrate regardless of variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "native", substrate: "linux" }))).toBe(true);
    });

    it("returns false for windows substrate", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "native", substrate: "windows" }))).toBe(false);
    });

    it("returns false for cloudflare variant", () => {
      expect(linuxSiteAdapter.supports(makeSite({ variant: "cloudflare", substrate: "cloudflare" }))).toBe(false);
    });
  });

  describe("createObservationApi", () => {
    it("returns a LinuxSiteObservationApi instance", () => {
      const api = linuxSiteAdapter.createObservationApi(makeSite());
      expect(api).toBeDefined();
      expect(typeof api.getHealth).toBe("function");
    });
  });

  describe("createControlClient", () => {
    it("returns a LinuxSiteControlClient instance for user mode", () => {
      const client = linuxSiteAdapter.createControlClient(makeSite({ variant: "linux-user" }));
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(LinuxSiteControlClient);
      expect(typeof client.executeControlRequest).toBe("function");
    });
  });
});

describe("LinuxSiteObservationApi", () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NARADA_SITE_ROOT;
    tmpDir = mkdtempSync(join(tmpdir(), "narada-linux-adapter-"));
    process.env.NARADA_SITE_ROOT = tmpDir;
  });

  afterEach(() => {
    process.env.NARADA_SITE_ROOT = originalEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedSite(siteId: string, status: "healthy" | "auth_failed") {
    const root = join(tmpDir, siteId);
    mkdirSync(join(root, "db"), { recursive: true });
    const db = new Database(join(root, "db", "coordinator.db"));
    const coordinator = new SqliteSiteCoordinator(db);

    coordinator.setHealth({
      site_id: siteId,
      status,
      last_cycle_at: "2026-04-22T10:00:00.000Z",
      last_cycle_duration_ms: 1200,
      consecutive_failures: status === "auth_failed" ? 3 : 0,
      message: status === "auth_failed" ? "Auth expired" : "All good",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    coordinator.close();
    db.close();
    return root;
  }

  it("getHealth returns the site's health record", async () => {
    seedSite("site-1", "healthy");
    const api = new LinuxSiteObservationApi("site-1", "user");
    const health = await api.getHealth();
    expect(health.site_id).toBe("site-1");
    expect(health.status).toBe("healthy");
    expect(health.message).toBe("All good");
  });

  it("getHealth returns error when site is not readable", async () => {
    const api = new LinuxSiteObservationApi("missing-site", "user");
    const health = await api.getHealth();
    expect(health.status).toBe("error");
    expect(health.message).toContain("Failed to read Linux Site health");
  });

  it("getStuckWorkItems returns empty array when table missing", async () => {
    seedSite("site-2", "healthy");
    const api = new LinuxSiteObservationApi("site-2", "user");
    expect(await api.getStuckWorkItems()).toEqual([]);
  });

  it("getStuckWorkItems returns real data when table exists", async () => {
    seedSite("site-2b", "healthy");
    const db = new Database(join(tmpDir, "site-2b", "db", "coordinator.db"));
    db.exec(`
      CREATE TABLE work_items (
        work_item_id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL,
        context_id TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        error_message TEXT
      )
    `);
    db.prepare(`INSERT INTO work_items (work_item_id, scope_id, context_id, status, priority, updated_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("wi-1", "scope-1", "ctx-1", "failed_retryable", 5, "2026-04-22T08:00:00Z", "Test error");
    db.close();

    const api = new LinuxSiteObservationApi("site-2b", "user");
    const items = await api.getStuckWorkItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.work_item_id).toBe("wi-1");
    expect(items[0]!.status).toBe("failed_retryable");
    expect(items[0]!.summary).toBe("Test error");
  });

  it("getPendingOutboundCommands returns empty array when table missing", async () => {
    seedSite("site-3", "healthy");
    const api = new LinuxSiteObservationApi("site-3", "user");
    expect(await api.getPendingOutboundCommands()).toEqual([]);
  });

  it("getPendingOutboundCommands returns empty for non-stale commands", async () => {
    seedSite("site-3b", "healthy");
    const db = new Database(join(tmpDir, "site-3b", "db", "coordinator.db"));
    db.exec(`
      CREATE TABLE outbound_handoffs (
        outbound_id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL,
        context_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    // Recent command — not stale yet
    db.prepare(`INSERT INTO outbound_handoffs (outbound_id, scope_id, context_id, action_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '-5 minutes'))`)
      .run("ob-1", "scope-1", "ctx-1", "send_reply", "pending");
    db.close();

    const api = new LinuxSiteObservationApi("site-3b", "user");
    const cmds = await api.getPendingOutboundCommands();
    expect(cmds).toHaveLength(0);
  });

  it("getPendingOutboundCommands returns stale commands", async () => {
    seedSite("site-3c", "healthy");
    const db = new Database(join(tmpDir, "site-3c", "db", "coordinator.db"));
    db.exec(`
      CREATE TABLE outbound_handoffs (
        outbound_id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL,
        context_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    db.prepare(`INSERT INTO outbound_handoffs (outbound_id, scope_id, context_id, action_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '-20 minutes'))`)
      .run("ob-1", "scope-1", "ctx-1", "send_reply", "pending");
    db.close();

    const api = new LinuxSiteObservationApi("site-3c", "user");
    const cmds = await api.getPendingOutboundCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0]!.outbound_id).toBe("ob-1");
    expect(cmds[0]!.action_type).toBe("send_reply");
  });

  it("getPendingDrafts returns empty array when table missing", async () => {
    seedSite("site-4", "healthy");
    const api = new LinuxSiteObservationApi("site-4", "user");
    expect(await api.getPendingDrafts()).toEqual([]);
  });

  it("getPendingDrafts returns real data when table exists", async () => {
    seedSite("site-4b", "healthy");
    const db = new Database(join(tmpDir, "site-4b", "db", "coordinator.db"));
    db.exec(`
      CREATE TABLE outbound_handoffs (
        outbound_id TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL,
        context_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    db.prepare(`INSERT INTO outbound_handoffs (outbound_id, scope_id, context_id, action_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run("ob-1", "scope-1", "ctx-1", "send_reply", "draft_ready", "2026-04-22T08:00:00Z");
    db.close();

    const api = new LinuxSiteObservationApi("site-4b", "user");
    const drafts = await api.getPendingDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.draft_id).toBe("ob-1");
    expect(drafts[0]!.status).toBe("draft_ready");
  });

  it("getCredentialRequirements returns empty array when healthy", async () => {
    seedSite("site-5", "healthy");
    const api = new LinuxSiteObservationApi("site-5", "user");
    expect(await api.getCredentialRequirements()).toEqual([]);
  });

  it("getCredentialRequirements returns auth requirement when auth_failed", async () => {
    seedSite("site-6", "auth_failed");
    const api = new LinuxSiteObservationApi("site-6", "user");
    const creds = await api.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0].subtype).toBe("interactive_auth_required");
    expect(creds[0].summary).toBe("Auth expired");
    expect(creds[0].remediation_command).toContain("narada auth --site site-6");
  });

  it("does not mutate site state", async () => {
    seedSite("site-7", "healthy");
    const api = new LinuxSiteObservationApi("site-7", "user");
    await api.getHealth();
    await api.getStuckWorkItems();

    // Re-read health directly to confirm it is unchanged
    const db = new Database(join(tmpDir, "site-7", "db", "coordinator.db"));
    const coordinator = new SqliteSiteCoordinator(db);
    const health = coordinator.getHealth("site-7");
    expect(health.status).toBe("healthy");
    coordinator.close();
    db.close();
  });
});

describe("LinuxSiteControlClient", () => {
  function createMockContextFactory(options?: {
    command?: { outbound_id: string; action_type: string; status: string; latest_version: number };
    workItem?: { work_item_id: string; status: string; error_message?: string | null };
  }): LinuxSiteControlContextFactory {
    return async () => {
      const dbClose = { close: () => undefined } as Database.Database;
      const operatorRequests: Array<Record<string, unknown>> = [];
      const outboundTransitions: Array<Record<string, unknown>> = [];
      const updatedCommands: Array<Record<string, unknown>> = [];
      const updatedWorkItems: Array<Record<string, unknown>> = [];

      const ctx: LinuxSiteControlContext = {
        scope_id: "scope-1",
        db: dbClose,
        coordinatorStore: {
          insertOperatorActionRequest: (req) => {
            operatorRequests.push(req as unknown as Record<string, unknown>);
          },
          markOperatorActionRequestExecuted: () => undefined,
          markOperatorActionRequestRejected: () => undefined,
          getWorkItem: (id: string) =>
            options?.workItem && options.workItem.work_item_id === id
              ? ({
                  work_item_id: options.workItem.work_item_id,
                  context_id: "ctx-1",
                  scope_id: "scope-1",
                  status: options.workItem.status,
                  priority: 1,
                  opened_for_revision_id: "rev-1",
                  resolved_revision_id: null,
                  resolution_outcome: null,
                  error_message: options.workItem.error_message ?? null,
                  retry_count: 0,
                  next_retry_at: null,
                  context_json: null,
                  created_at: "2026-04-20T09:00:00Z",
                  updated_at: "2026-04-20T10:00:00Z",
                  preferred_session_id: null,
                  preferred_agent_id: null,
                  affinity_group_id: null,
                  affinity_strength: 0,
                  affinity_expires_at: null,
                  affinity_reason: null,
                } as any)
              : undefined,
          updateWorkItemStatus: (workItemId: string, status: string, updates?: Record<string, unknown>) => {
            updatedWorkItems.push({ workItemId, status, updates });
          },
        } as any,
        outboundStore: {
          getCommand: (id: string) =>
            options?.command && options.command.outbound_id === id
              ? ({
                  outbound_id: options.command.outbound_id,
                  context_id: "ctx-1",
                  scope_id: "scope-1",
                  action_type: options.command.action_type,
                  status: options.command.status,
                  latest_version: options.command.latest_version,
                  created_at: "2026-04-20T10:00:00Z",
                  created_by: "system",
                  submitted_at: null,
                  confirmed_at: null,
                  blocked_reason: null,
                  terminal_reason: null,
                  idempotency_key: "ik-1",
                  reviewed_at: null,
                  reviewer_notes: null,
                  external_reference: null,
                  approved_at: null,
                } as any)
              : undefined,
          updateCommandStatus: (outboundId: string, status: string, updates?: Record<string, unknown>) => {
            updatedCommands.push({ outboundId, status, updates });
          },
          appendTransition: (transition: Record<string, unknown>) => {
            outboundTransitions.push(transition);
          },
        } as any,
        intentStore: {
          getByTargetId: () => undefined,
          updateStatus: () => undefined,
        } as any,
      };

      return ctx;
    };
  }

  it("routes approve request through executeOperatorAction", async () => {
    const client = new LinuxSiteControlClient(
      "site-live",
      createMockContextFactory({
        command: {
          outbound_id: "ob-draft-1",
          action_type: "send_reply",
          status: "draft_ready",
          latest_version: 1,
        },
      })
    );

    const result = await client.executeControlRequest({
      requestId: "req-1",
      siteId: "site-live",
      actionType: "approve",
      targetId: "ob-draft-1",
      targetKind: "outbound_command",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("accepted");
  });

  it("routes retry request through executeOperatorAction", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-2",
      createMockContextFactory({
        workItem: {
          work_item_id: "wi-failed-1",
          status: "failed_retryable",
          error_message: "Error",
        },
      })
    );

    const result = await client.executeControlRequest({
      requestId: "req-2",
      siteId: "site-live-2",
      actionType: "retry",
      targetId: "wi-failed-1",
      targetKind: "work_item",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("accepted");
  });

  it("routes reject request through executeOperatorAction", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-3",
      createMockContextFactory({
        command: {
          outbound_id: "ob-draft-2",
          action_type: "send_reply",
          status: "draft_ready",
          latest_version: 1,
        },
      })
    );

    const result = await client.executeControlRequest({
      requestId: "req-3",
      siteId: "site-live-3",
      actionType: "reject",
      targetId: "ob-draft-2",
      targetKind: "outbound_command",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("accepted");
  });

  it("routes mark_reviewed request through executeOperatorAction", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-4",
      createMockContextFactory({
        command: {
          outbound_id: "ob-draft-3",
          action_type: "send_reply",
          status: "draft_ready",
          latest_version: 1,
        },
      })
    );

    const result = await client.executeControlRequest({
      requestId: "req-4",
      siteId: "site-live-4",
      actionType: "mark_reviewed",
      targetId: "ob-draft-3",
      targetKind: "outbound_command",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("accepted");
  });

  it("returns rejected when target does not exist", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-5",
      createMockContextFactory()
    );

    const result = await client.executeControlRequest({
      requestId: "req-5",
      siteId: "site-live-5",
      actionType: "approve",
      targetId: "nonexistent",
      targetKind: "outbound_command",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
  });

  it("rejects generic outbound retry with clear message", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-6",
      createMockContextFactory({
        command: {
          outbound_id: "ob-draft-1",
          action_type: "send_reply",
          status: "draft_ready",
          latest_version: 1,
        },
      })
    );

    const result = await client.executeControlRequest({
      requestId: "req-retry-outbound",
      siteId: "site-live-6",
      actionType: "retry",
      targetId: "ob-draft-1",
      targetKind: "outbound_command",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.detail).toContain("Generic retry for outbound commands is not supported");
  });

  it("rejects cancel work item with clear message", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-7",
      createMockContextFactory()
    );

    const result = await client.executeControlRequest({
      requestId: "req-cancel",
      siteId: "site-live-7",
      actionType: "cancel",
      targetId: "wi-1",
      targetKind: "work_item",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.detail).toContain("Cancel for work items is not supported");
  });

  it("rejects unsupported action combination", async () => {
    const client = new LinuxSiteControlClient(
      "site-live-8",
      createMockContextFactory()
    );

    const result = await client.executeControlRequest({
      requestId: "req-unsupported",
      siteId: "site-live-8",
      actionType: "approve",
      targetId: "wi-1",
      targetKind: "work_item",
      requestedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.detail).toContain("Unsupported control action combination");
  });
});
