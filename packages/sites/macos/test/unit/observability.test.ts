import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getMacosSiteStatus,
  getSiteHealth,
  getLastCycleTrace,
  getSiteSummary,
  discoverMacosSites,
  isMacosSite,
} from "../../src/observability.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../../src/coordinator.js";

describe("observability", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-obs-test-"));
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("isMacosSite", () => {
    it("returns true when site directory and coordinator.db exist", () => {
      const siteRoot = join(tempDir, "test-site");
      mkdirSync(join(siteRoot, "db"), { recursive: true });
      writeFileSync(join(siteRoot, "db", "coordinator.db"), "", "utf8");
      expect(isMacosSite("test-site")).toBe(true);
    });

    it("returns false when site directory does not exist", () => {
      expect(isMacosSite("nonexistent")).toBe(false);
    });

    it("returns false when coordinator.db is missing", () => {
      const siteRoot = join(tempDir, "no-db");
      mkdirSync(siteRoot, { recursive: true });
      expect(isMacosSite("no-db")).toBe(false);
    });
  });

  describe("discoverMacosSites", () => {
    const originalHome = process.env.HOME;

    beforeEach(() => {
      // Point HOME to tempDir so canonical path resolves there
      process.env.HOME = tempDir;
    });

    afterEach(() => {
      process.env.HOME = originalHome;
    });

    it("discovers sites with coordinator.db", () => {
      const { homedir } = require("node:os");
      const naradaRoot = join(homedir(), "Library", "Application Support", "Narada");
      const siteRoot = join(naradaRoot, "site-a");
      mkdirSync(join(siteRoot, "db"), { recursive: true });
      writeFileSync(join(siteRoot, "db", "coordinator.db"), "", "utf8");

      const sites = discoverMacosSites();
      expect(sites.length).toBeGreaterThanOrEqual(1);
      expect(sites.some((s) => s.siteId === "site-a")).toBe(true);
    });

    it("ignores directories without coordinator.db", () => {
      const { homedir } = require("node:os");
      const emptyDir = join(homedir(), "Library", "Application Support", "Narada", "empty-dir");
      mkdirSync(emptyDir, { recursive: true });
      const sites = discoverMacosSites();
      expect(sites.some((s) => s.siteId === "empty-dir")).toBe(false);
    });
  });

  describe("getMacosSiteStatus", () => {
    it("returns health and last trace for a site", async () => {
      const db = openCoordinatorDb("test-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        coordinator.setHealth({
          site_id: "test-site",
          status: "healthy",
          last_cycle_at: "2024-01-01T00:00:00Z",
          last_cycle_duration_ms: 1000,
          consecutive_failures: 0,
          message: "OK",
          updated_at: "2024-01-01T00:00:00Z",
        });
        coordinator.setLastCycleTrace({
          cycle_id: "cycle-1",
          site_id: "test-site",
          started_at: "2024-01-01T00:00:00Z",
          finished_at: "2024-01-01T00:00:01Z",
          status: "complete",
          steps_completed: [1, 2, 3],
          error: null,
        });
      } finally {
        coordinator.close();
      }

      const status = await getMacosSiteStatus("test-site");
      expect(status.siteId).toBe("test-site");
      expect(status.health.status).toBe("healthy");
      expect(status.lastTrace).not.toBeNull();
      expect(status.lastTrace!.cycle_id).toBe("cycle-1");
    });
  });

  describe("getSiteHealth", () => {
    it("returns health record", async () => {
      const db = openCoordinatorDb("health-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        coordinator.setHealth({
          site_id: "health-site",
          status: "degraded",
          last_cycle_at: null,
          last_cycle_duration_ms: null,
          consecutive_failures: 1,
          message: "One failure",
          updated_at: "2024-01-01T00:00:00Z",
        });
      } finally {
        coordinator.close();
      }

      const health = await getSiteHealth("health-site");
      expect(health.status).toBe("degraded");
      expect(health.consecutive_failures).toBe(1);
    });
  });

  describe("getLastCycleTrace", () => {
    it("returns last trace record", async () => {
      const db = openCoordinatorDb("trace-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        coordinator.setLastCycleTrace({
          cycle_id: "cycle-2",
          site_id: "trace-site",
          started_at: "2024-01-02T00:00:00Z",
          finished_at: "2024-01-02T00:00:01Z",
          status: "partial",
          steps_completed: [1, 2],
          error: "timeout",
        });
      } finally {
        coordinator.close();
      }

      const trace = await getLastCycleTrace("trace-site");
      expect(trace).not.toBeNull();
      expect(trace!.cycle_id).toBe("cycle-2");
      expect(trace!.status).toBe("partial");
    });
  });

  describe("getSiteSummary", () => {
    it("returns summary with scope count", async () => {
      const siteRoot = join(tempDir, "summary-site");
      mkdirSync(join(siteRoot, "messages", "ctx-1"), { recursive: true });
      mkdirSync(join(siteRoot, "messages", "ctx-2"), { recursive: true });
      mkdirSync(join(siteRoot, "db"), { recursive: true });

      const db = openCoordinatorDb("summary-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        coordinator.setHealth({
          site_id: "summary-site",
          status: "healthy",
          last_cycle_at: "2024-01-01T00:00:00Z",
          last_cycle_duration_ms: 1000,
          consecutive_failures: 0,
          message: "OK",
          updated_at: "2024-01-01T00:00:00Z",
        });
      } finally {
        coordinator.close();
      }

      const summary = await getSiteSummary("summary-site");
      expect(summary.siteId).toBe("summary-site");
      expect(summary.health.status).toBe("healthy");
      expect(summary.scopeCount).toBe(2);
    });
  });
});
