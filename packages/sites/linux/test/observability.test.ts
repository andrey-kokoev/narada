import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { LinuxSiteMode } from "../src/types.js";
import {
  getLinuxSiteStatus,
  getSiteHealth,
  getLastCycleTrace,
  listAllSites,
  checkSite,
  isLinuxSite,
  resolveLinuxSiteMode,
} from "../src/observability.js";
import { SqliteSiteCoordinator } from "../src/coordinator.js";

describe("observability", () => {
  let tmpDir: string;
  let originalEnv: string | undefined;
  const userNarada = join(homedir(), ".local", "share", "narada");

  beforeEach(() => {
    originalEnv = process.env.NARADA_SITE_ROOT;
    tmpDir = mkdtempSync(join(tmpdir(), "narada-linux-obs-"));
    process.env.NARADA_SITE_ROOT = tmpDir;
  });

  afterEach(() => {
    process.env.NARADA_SITE_ROOT = originalEnv;
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean up canonical-path test artifacts
    try {
      rmSync(join(userNarada, "site-a"), { recursive: true, force: true });
      rmSync(join(userNarada, "site-b"), { recursive: true, force: true });
      rmSync(join(userNarada, "test-site"), { recursive: true, force: true });
      rmSync(join(userNarada, "empty-site"), { recursive: true, force: true });
      rmSync(join(userNarada, "not-a-site"), { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function seedSite(siteId: string, mode: LinuxSiteMode) {
    const root = join(tmpDir, siteId);
    mkdirSync(join(root, "db"), { recursive: true });
    mkdirSync(join(root, "state"), { recursive: true });
    const db = new Database(join(root, "db", "coordinator.db"));
    const coordinator = new SqliteSiteCoordinator(db);

    coordinator.setHealth({
      site_id: siteId,
      status: "healthy",
      last_cycle_at: "2026-04-22T10:00:00.000Z",
      last_cycle_duration_ms: 1200,
      consecutive_failures: 0,
      message: "All good",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    coordinator.setLastCycleTrace({
      cycle_id: "cycle-001",
      site_id: siteId,
      started_at: "2026-04-22T10:00:00.000Z",
      finished_at: "2026-04-22T10:00:01.200Z",
      status: "complete",
      steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
      error: null,
    });

    coordinator.close();
    db.close();
    return root;
  }

  function seedCanonicalSite(siteId: string) {
    const root = join(userNarada, siteId);
    mkdirSync(join(root, "db"), { recursive: true });
    const db = new Database(join(root, "db", "coordinator.db"));
    const coordinator = new SqliteSiteCoordinator(db);
    coordinator.setHealth({
      site_id: siteId,
      status: "healthy",
      last_cycle_at: null,
      last_cycle_duration_ms: null,
      consecutive_failures: 0,
      message: "OK",
      updated_at: new Date().toISOString(),
    });
    coordinator.close();
    db.close();
    return root;
  }

  describe("getLinuxSiteStatus", () => {
    it("returns health and last trace for a site", async () => {
      seedSite("test-site", "user");
      const status = await getLinuxSiteStatus("test-site", "user");

      expect(status.siteId).toBe("test-site");
      expect(status.mode).toBe("user");
      expect(status.health.status).toBe("healthy");
      expect(status.health.consecutive_failures).toBe(0);
      expect(status.lastTrace).not.toBeNull();
      expect(status.lastTrace?.cycle_id).toBe("cycle-001");
      expect(status.lastTrace?.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("throws for a non-existent site", async () => {
      await expect(getLinuxSiteStatus("missing", "user")).rejects.toThrow();
    });
  });

  describe("getSiteHealth", () => {
    it("returns only health record", async () => {
      seedSite("test-site", "user");
      const health = await getSiteHealth("test-site", "user");

      expect(health.site_id).toBe("test-site");
      expect(health.status).toBe("healthy");
      expect(health.last_cycle_duration_ms).toBe(1200);
    });
  });

  describe("getLastCycleTrace", () => {
    it("returns only last trace", async () => {
      seedSite("test-site", "user");
      const trace = await getLastCycleTrace("test-site", "user");

      expect(trace).not.toBeNull();
      expect(trace?.cycle_id).toBe("cycle-001");
      expect(trace?.status).toBe("complete");
    });

    it("returns null when no traces exist", async () => {
      const root = join(tmpDir, "empty-site");
      mkdirSync(join(root, "db"), { recursive: true });
      new Database(join(root, "db", "coordinator.db")).close();

      const trace = await getLastCycleTrace("empty-site", "user");
      expect(trace).toBeNull();
    });
  });

  describe("listAllSites", () => {
    it("discovers sites in user mode", () => {
      seedCanonicalSite("site-a");
      seedCanonicalSite("site-b");

      const sites = listAllSites("user");
      const ids = sites.map((s) => s.siteId).sort();
      expect(ids).toEqual(["site-a", "site-b"]);
    });

    it("ignores non-site directories", () => {
      mkdirSync(join(userNarada, "not-a-site"), { recursive: true });
      writeFileSync(join(userNarada, "not-a-site", "readme.txt"), "hello");

      const sites = listAllSites("user");
      expect(sites).toHaveLength(0);
    });
  });

  describe("isLinuxSite", () => {
    it("returns true for an existing site with explicit mode", () => {
      seedSite("test-site", "user");
      expect(isLinuxSite("test-site", "user")).toBe(true);
    });

    it("returns false for a missing site", () => {
      expect(isLinuxSite("missing", "user")).toBe(false);
    });

    it("auto-detects mode when not provided (canonical path)", () => {
      const prev = process.env.NARADA_SITE_ROOT;
      delete process.env.NARADA_SITE_ROOT;
      seedCanonicalSite("test-site");
      try {
        expect(isLinuxSite("test-site")).toBe(true);
      } finally {
        process.env.NARADA_SITE_ROOT = prev;
      }
    });
  });

  describe("resolveLinuxSiteMode", () => {
    it("resolves user mode for user site at canonical path", () => {
      const prev = process.env.NARADA_SITE_ROOT;
      delete process.env.NARADA_SITE_ROOT;
      seedCanonicalSite("test-site");
      try {
        expect(resolveLinuxSiteMode("test-site")).toBe("user");
      } finally {
        process.env.NARADA_SITE_ROOT = prev;
      }
    });

    it("returns null for missing site", () => {
      expect(resolveLinuxSiteMode("missing")).toBeNull();
    });
  });

  describe("checkSite", () => {
    it("returns all passing checks for a healthy site", async () => {
      seedSite("test-site", "user");
      const checks = await checkSite("test-site", "user");

      const checkNames = checks.map((c) => c.name);
      expect(checkNames).toContain("site-directory");
      expect(checkNames).toContain("coordinator-db");
      expect(checkNames).toContain("stuck-lock");
      expect(checkNames).toContain("health-status");
      expect(checkNames).toContain("cycle-freshness");

      const dirCheck = checks.find((c) => c.name === "site-directory");
      expect(dirCheck?.status).toBe("pass");

      const dbCheck = checks.find((c) => c.name === "coordinator-db");
      expect(dbCheck?.status).toBe("pass");
    });

    it("returns fail for missing site directory", async () => {
      const checks = await checkSite("missing", "user");
      const dirCheck = checks.find((c) => c.name === "site-directory");
      expect(dirCheck?.status).toBe("fail");
    });

    it("detects a stuck lock", async () => {
      seedSite("test-site", "user");
      const lockDir = join(tmpDir, "test-site", "state", "cycle.lock");
      mkdirSync(lockDir, { recursive: true });

      const checks = await checkSite("test-site", "user", 0);
      const lockCheck = checks.find((c) => c.name === "stuck-lock");
      expect(lockCheck?.status).toBe("fail");
    });

    it("warns when no cycle has been recorded", async () => {
      const root = join(tmpDir, "empty-site");
      mkdirSync(join(root, "db"), { recursive: true });
      new Database(join(root, "db", "coordinator.db")).close();

      const checks = await checkSite("empty-site", "user");
      const freshnessCheck = checks.find((c) => c.name === "cycle-freshness");
      expect(freshnessCheck?.status).toBe("warn");
    });
  });
});
