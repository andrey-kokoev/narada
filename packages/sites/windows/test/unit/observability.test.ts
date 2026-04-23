import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  getWindowsSiteStatus,
  getSiteHealth,
  getLastCycleTrace,
  discoverWindowsSites,
  resolveSiteVariant,
  WindowsSiteObservationApi,
} from "../../src/observability.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../../src/coordinator.js";

describe("observability", () => {
  let tempDir: string;
  let originalSiteRoot: string | undefined;
  const homeNarada = join(homedir(), "narada");

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "obs-test-"));
    originalSiteRoot = process.env.NARADA_SITE_ROOT;
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    if (originalSiteRoot === undefined) {
      delete process.env.NARADA_SITE_ROOT;
    } else {
      process.env.NARADA_SITE_ROOT = originalSiteRoot;
    }
    rmSync(tempDir, { recursive: true, force: true });
    // Clean up any test artifacts in ~/narada
    try {
      rmSync(join(homeNarada, "my-site"), { recursive: true, force: true });
      rmSync(join(homeNarada, "site-a"), { recursive: true, force: true });
      rmSync(join(homeNarada, "site-b"), { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  async function seedSite(siteId: string) {
    // Ensure db directory exists before opening SQLite
    mkdirSync(join(tempDir, siteId, "db"), { recursive: true });
    const db = await openCoordinatorDb(siteId, "wsl");
    const coordinator = new SqliteSiteCoordinator(db);
    coordinator.setHealth({
      site_id: siteId,
      status: "healthy",
      last_cycle_at: "2026-04-21T12:00:00.000Z",
      last_cycle_duration_ms: 5000,
      consecutive_failures: 0,
      message: "All good",
      updated_at: "2026-04-21T12:00:00.000Z",
    });
    coordinator.setLastCycleTrace({
      cycle_id: "cycle-001",
      site_id: siteId,
      started_at: "2026-04-21T12:00:00.000Z",
      finished_at: "2026-04-21T12:00:05.000Z",
      status: "complete",
      steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
      error: null,
    });
    coordinator.close();
  }

  describe("getWindowsSiteStatus", () => {
    it("returns health and trace for an existing site", async () => {
      await seedSite("alpha");
      const status = await getWindowsSiteStatus("alpha", "wsl");
      expect(status.siteId).toBe("alpha");
      expect(status.variant).toBe("wsl");
      expect(status.health.status).toBe("healthy");
      expect(status.health.consecutive_failures).toBe(0);
      expect(status.lastTrace).not.toBeNull();
      expect(status.lastTrace!.cycle_id).toBe("cycle-001");
    });

    it("returns default health when no health record exists", async () => {
      mkdirSync(join(tempDir, "beta", "db"), { recursive: true });
      const db = await openCoordinatorDb("beta", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.close();

      const status = await getWindowsSiteStatus("beta", "wsl");
      expect(status.health.status).toBe("healthy");
      expect(status.health.consecutive_failures).toBe(0);
      expect(status.lastTrace).toBeNull();
    });
  });

  describe("getSiteHealth", () => {
    it("returns health record directly", async () => {
      await seedSite("gamma");
      const health = await getSiteHealth("gamma", "wsl");
      expect(health.status).toBe("healthy");
    });
  });

  describe("getLastCycleTrace", () => {
    it("returns trace when present", async () => {
      await seedSite("delta");
      const trace = await getLastCycleTrace("delta", "wsl");
      expect(trace).not.toBeNull();
      expect(trace!.status).toBe("complete");
    });

    it("returns null when absent", async () => {
      mkdirSync(join(tempDir, "epsilon", "db"), { recursive: true });
      const db = await openCoordinatorDb("epsilon", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.close();
      const trace = await getLastCycleTrace("epsilon", "wsl");
      expect(trace).toBeNull();
    });
  });

  describe("discoverWindowsSites", () => {
    it("discovers sites with coordinator.db in db/ subdirectory", () => {
      // Create two site directories under ~/narada (the WSL fallback path)
      mkdirSync(join(homeNarada, "site-a", "db"), { recursive: true });
      writeFileSync(join(homeNarada, "site-a", "db", "coordinator.db"), "", "utf8");
      mkdirSync(join(homeNarada, "site-b", "db"), { recursive: true });
      writeFileSync(join(homeNarada, "site-b", "db", "coordinator.db"), "", "utf8");

      // Create a non-site directory without db
      mkdirSync(join(homeNarada, "not-a-site"), { recursive: true });

      const discovered = discoverWindowsSites();
      const ids = discovered.map((s) => s.siteId).sort();
      expect(ids).toContain("site-a");
      expect(ids).toContain("site-b");
      expect(ids).not.toContain("not-a-site");
    });
  });

  describe("resolveSiteVariant", () => {
    it("returns wsl when site exists in ~/narada", () => {
      mkdirSync(join(homeNarada, "my-site", "db"), { recursive: true });
      writeFileSync(join(homeNarada, "my-site", "db", "coordinator.db"), "", "utf8");
      expect(resolveSiteVariant("my-site")).toBe("wsl");
    });

    it("returns null when site does not exist", () => {
      expect(resolveSiteVariant("nonexistent-site-12345")).toBeNull();
    });

    it("respects NARADA_SITE_VARIANT env override", () => {
      process.env.NARADA_SITE_VARIANT = "native";
      expect(resolveSiteVariant("any")).toBe("native");
      delete process.env.NARADA_SITE_VARIANT;
    });
  });

  describe("WindowsSiteObservationApi", () => {
    it("returns stuck work items from real DB state", async () => {
      mkdirSync(join(tempDir, "obs-site", "db"), { recursive: true });
      const db = await openCoordinatorDb("obs-site", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.setHealth({
        site_id: "obs-site",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "OK",
        updated_at: new Date().toISOString(),
      });

      // Seed work_items via raw SQL (schema init happens in SqliteCoordinatorStore)
      const { SqliteCoordinatorStore } = await import("@narada2/control-plane");
      const coordStore = new SqliteCoordinatorStore({ db });
      coordStore.initSchema();
      db.prepare(
        `insert into context_records (context_id, scope_id, primary_charter, secondary_charters_json, status, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`
      ).run("ctx-1", "scope-1", "test_charter", "[]", "active", "2026-04-20T09:00:00Z", "2026-04-20T09:00:00Z");
      db.prepare(
        `insert into work_items (work_item_id, context_id, scope_id, status, opened_for_revision_id, updated_at, created_at, error_message)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("wi-stuck-1", "ctx-1", "scope-1", "failed_retryable", "rev-1", "2026-04-20T10:00:00Z", "2026-04-20T09:00:00Z", "Sync error");
      coordinator.close();

      const api = new WindowsSiteObservationApi("obs-site", "wsl");
      const stuck = await api.getStuckWorkItems();
      expect(stuck).toHaveLength(1);
      expect(stuck[0]!.work_item_id).toBe("wi-stuck-1");
      expect(stuck[0]!.status).toBe("failed_retryable");
    });

    it("returns pending outbound commands from real DB state", async () => {
      mkdirSync(join(tempDir, "obs-site-2", "db"), { recursive: true });
      const db = await openCoordinatorDb("obs-site-2", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.setHealth({
        site_id: "obs-site-2",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "OK",
        updated_at: new Date().toISOString(),
      });

      const { SqliteOutboundStore } = await import("@narada2/control-plane");
      const outboundStore = new SqliteOutboundStore({ db });
      outboundStore.initSchema();
      db.prepare(
        `insert into outbound_handoffs (outbound_id, context_id, scope_id, action_type, status, latest_version, created_at, created_by, idempotency_key)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("ob-1", "ctx-1", "scope-1", "send_reply", "pending", 1, "2026-04-20T08:00:00Z", "system", "ik-1");
      coordinator.close();

      const api = new WindowsSiteObservationApi("obs-site-2", "wsl");
      const pending = await api.getPendingOutboundCommands();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.outbound_id).toBe("ob-1");
    });

    it("returns pending drafts from real DB state", async () => {
      mkdirSync(join(tempDir, "obs-site-3", "db"), { recursive: true });
      const db = await openCoordinatorDb("obs-site-3", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.setHealth({
        site_id: "obs-site-3",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "OK",
        updated_at: new Date().toISOString(),
      });

      const { SqliteOutboundStore } = await import("@narada2/control-plane");
      const outboundStore = new SqliteOutboundStore({ db });
      outboundStore.initSchema();
      db.prepare(
        `insert into outbound_handoffs (outbound_id, context_id, scope_id, action_type, status, latest_version, created_at, created_by, idempotency_key)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("draft-1", "ctx-1", "scope-1", "send_reply", "draft_ready", 1, "2026-04-20T08:00:00Z", "system", "ik-1");
      coordinator.close();

      const api = new WindowsSiteObservationApi("obs-site-3", "wsl");
      const drafts = await api.getPendingDrafts();
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.draft_id).toBe("draft-1");
    });

    it("returns credential requirements when health is auth_failed", async () => {
      mkdirSync(join(tempDir, "obs-site-4", "db"), { recursive: true });
      const db = await openCoordinatorDb("obs-site-4", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.setHealth({
        site_id: "obs-site-4",
        status: "auth_failed",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 2,
        message: "Token expired",
        updated_at: "2026-04-20T10:00:00Z",
      });
      coordinator.close();

      const api = new WindowsSiteObservationApi("obs-site-4", "wsl");
      const creds = await api.getCredentialRequirements();
      expect(creds).toHaveLength(1);
      expect(creds[0]!.subtype).toBe("interactive_auth_required");
      expect(creds[0]!.summary).toBe("Token expired");
    });

    it("returns empty arrays when tables do not exist", async () => {
      mkdirSync(join(tempDir, "obs-site-5", "db"), { recursive: true });
      const db = await openCoordinatorDb("obs-site-5", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.setHealth({
        site_id: "obs-site-5",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "OK",
        updated_at: new Date().toISOString(),
      });
      coordinator.close();
      db.close();

      const api = new WindowsSiteObservationApi("obs-site-5", "wsl");
      expect(await api.getStuckWorkItems()).toEqual([]);
      expect(await api.getPendingOutboundCommands()).toEqual([]);
      expect(await api.getPendingDrafts()).toEqual([]);
    });

    it("does not mutate Site state", async () => {
      mkdirSync(join(tempDir, "obs-site-6", "db"), { recursive: true });
      const db = await openCoordinatorDb("obs-site-6", "wsl");
      const coordinator = new SqliteSiteCoordinator(db);
      coordinator.setHealth({
        site_id: "obs-site-6",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "OK",
        updated_at: "2026-04-20T10:00:00Z",
      });

      const { SqliteCoordinatorStore } = await import("@narada2/control-plane");
      const coordStore = new SqliteCoordinatorStore({ db });
      coordStore.initSchema();
      db.prepare(
        `insert into context_records (context_id, scope_id, primary_charter, secondary_charters_json, status, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`
      ).run("ctx-1", "scope-1", "test_charter", "[]", "active", "2026-04-20T09:00:00Z", "2026-04-20T09:00:00Z");
      db.prepare(
        `insert into work_items (work_item_id, context_id, scope_id, status, opened_for_revision_id, updated_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?)`
      ).run("wi-1", "ctx-1", "scope-1", "opened", "rev-1", "2026-04-20T10:00:00Z", "2026-04-20T09:00:00Z");
      coordinator.close();

      const api = new WindowsSiteObservationApi("obs-site-6", "wsl");
      await api.getStuckWorkItems();
      await api.getPendingOutboundCommands();
      await api.getPendingDrafts();
      await api.getCredentialRequirements();

      // Re-open and verify no mutations
      const db2 = await openCoordinatorDb("obs-site-6", "wsl");
      const row = db2.prepare(`select status from work_items where work_item_id = ?`).get("wi-1") as { status: string };
      expect(row.status).toBe("opened");
      db2.close();
    });
  });
});
