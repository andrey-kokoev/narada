import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SiteRegistry } from "../../src/registry.js";
import {
  WindowsSiteControlClient,
  createWindowsSiteControlClientFactory,
  type WindowsSiteControlContext,
  type WindowsSiteControlContextFactory,
} from "../../src/site-control.js";
import { ControlRequestRouter } from "../../src/router.js";

describe("WindowsSiteControlClient", () => {
  let tempDir: string;
  let db: Database.Database;
  let registry: SiteRegistry;

  let originalSiteRoot: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-site-control-test-"));
    originalSiteRoot = process.env.NARADA_SITE_ROOT;
    process.env.NARADA_SITE_ROOT = tempDir;
    db = new Database(join(tempDir, "registry.db"));
    registry = new SiteRegistry(db);
  });

  afterEach(() => {
    if (originalSiteRoot === undefined) {
      delete process.env.NARADA_SITE_ROOT;
    } else {
      process.env.NARADA_SITE_ROOT = originalSiteRoot;
    }
    registry.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function registerTestSite(siteId: string): void {
    registry.registerSite({
      siteId,
      variant: "wsl",
      siteRoot: join(tempDir, siteId),
      substrate: "windows",
      aimJson: null,
      controlEndpoint: null,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  function createMockContextFactory(options?: {
    command?: { outbound_id: string; action_type: string; status: string; latest_version: number };
    workItem?: { work_item_id: string; status: string; error_message?: string | null };
  }): WindowsSiteControlContextFactory {
    return async () => {
      const dbClose = { close: () => undefined } as Database.Database;
      const operatorRequests: Array<Record<string, unknown>> = [];
      const outboundTransitions: Array<Record<string, unknown>> = [];
      const updatedCommands: Array<Record<string, unknown>> = [];
      const updatedWorkItems: Array<Record<string, unknown>> = [];

      const ctx: WindowsSiteControlContext = {
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

  describe("createWindowsSiteControlClientFactory", () => {
    it("returns a client for a registered Windows Site", () => {
      registerTestSite("site-a");
      const factory = createWindowsSiteControlClientFactory(registry);
      const client = factory("site-a");
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(WindowsSiteControlClient);
    });

    it("returns undefined for an unknown site", () => {
      const factory = createWindowsSiteControlClientFactory(registry);
      const client = factory("unknown");
      expect(client).toBeUndefined();
    });

    it("returns undefined when substrate is not windows even if variant looks local", () => {
      registry.registerSite({
        siteId: "cloud-site",
        variant: "wsl",
        siteRoot: "/tmp/cloud",
        substrate: "cloudflare",
        aimJson: null,
        controlEndpoint: "https://example.com",
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      const factory = createWindowsSiteControlClientFactory(registry);
      const client = factory("cloud-site");
      expect(client).toBeUndefined();
    });
  });

  describe("end-to-end routing with live client", () => {
    it("routes approve request through executeOperatorAction", async () => {
      registerTestSite("site-live");
      const client = new WindowsSiteControlClient(
        createMockContextFactory({
          command: {
            outbound_id: "ob-draft-1",
            action_type: "send_reply",
            status: "draft_ready",
            latest_version: 1,
          },
        }),
      );

      const router = new ControlRequestRouter({
        registry,
        clientFactory: () => client,
      });

      const result = await router.route({
        requestId: "req-1",
        siteId: "site-live",
        actionType: "approve",
        targetId: "ob-draft-1",
        targetKind: "outbound_command",
        requestedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("accepted");

      // Verify audit log
      const logs = registry.getAuditRecordsForSite("site-live");
      expect(logs.length).toBe(1);
      expect(logs[0]!.siteResponseStatus).toBe("accepted");
    });

    it("routes retry request through executeOperatorAction", async () => {
      registerTestSite("site-live-2");
      const client = new WindowsSiteControlClient(
        createMockContextFactory({
          workItem: {
            work_item_id: "wi-failed-1",
            status: "failed_retryable",
            error_message: "Error",
          },
        }),
      );

      const router = new ControlRequestRouter({
        registry,
        clientFactory: () => client,
      });

      const result = await router.route({
        requestId: "req-2",
        siteId: "site-live-2",
        actionType: "retry",
        targetId: "wi-failed-1",
        targetKind: "work_item",
        requestedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("accepted");
    });

    it("returns error when target does not exist", async () => {
      registerTestSite("site-live-3");
      const client = new WindowsSiteControlClient(createMockContextFactory());

      const router = new ControlRequestRouter({
        registry,
        clientFactory: () => client,
      });

      const result = await router.route({
        requestId: "req-3",
        siteId: "site-live-3",
        actionType: "approve",
        targetId: "nonexistent",
        targetKind: "outbound_command",
        requestedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
    });

    it("returns error for unsupported substrate", async () => {
      registry.registerSite({
        siteId: "cloud-only",
        variant: "wsl",
        siteRoot: "/nonexistent",
        substrate: "cloudflare",
        aimJson: null,
        controlEndpoint: "https://example.com",
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const router = new ControlRequestRouter({
        registry,
        clientFactory: createWindowsSiteControlClientFactory(registry),
      });

      const result = await router.route({
        requestId: "req-cloud",
        siteId: "cloud-only",
        actionType: "approve",
        targetId: "ob-1",
        targetKind: "outbound_command",
        requestedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.detail).toContain("No control client available");
    });

    it("rejects generic outbound retry instead of misrouting it to retry_auth_failed", async () => {
      registerTestSite("site-live-4");
      const client = new WindowsSiteControlClient(
        createMockContextFactory({
          command: {
            outbound_id: "ob-draft-1",
            action_type: "send_reply",
            status: "draft_ready",
            latest_version: 1,
          },
        }),
      );

      const router = new ControlRequestRouter({
        registry,
        clientFactory: () => client,
      });

      const result = await router.route({
        requestId: "req-retry-outbound",
        siteId: "site-live-4",
        actionType: "retry",
        targetId: "ob-draft-1",
        targetKind: "outbound_command",
        requestedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.detail).toContain("Generic retry for outbound commands is not supported");
    });
  });
});
