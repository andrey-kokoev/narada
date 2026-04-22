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
});
