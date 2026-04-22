import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SqliteSiteCoordinator } from "../../src/coordinator.js";
import type { SiteHealthRecord, CycleTraceRecord } from "../../src/types.js";

describe("SqliteSiteCoordinator", () => {
  let tempDir: string;
  let db: Database.Database;
  let coordinator: SqliteSiteCoordinator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-windows-test-"));
    db = new Database(join(tempDir, "test.db"));
    coordinator = new SqliteSiteCoordinator(db);
  });

  afterEach(() => {
    coordinator.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getHealth", () => {
    it("returns default health when no record exists", () => {
      const health = coordinator.getHealth("test-site");
      expect(health.site_id).toBe("test-site");
      expect(health.status).toBe("healthy");
      expect(health.consecutive_failures).toBe(0);
      expect(health.last_cycle_at).toBeNull();
    });

    it("returns stored health after setHealth", () => {
      const record: SiteHealthRecord = {
        site_id: "test-site",
        status: "degraded",
        last_cycle_at: "2026-04-21T10:00:00Z",
        last_cycle_duration_ms: 1500,
        consecutive_failures: 1,
        message: "Cycle failed",
        updated_at: "2026-04-21T10:00:00Z",
      };
      coordinator.setHealth(record);
      const health = coordinator.getHealth("test-site");
      expect(health.status).toBe("degraded");
      expect(health.consecutive_failures).toBe(1);
      expect(health.last_cycle_duration_ms).toBe(1500);
    });

    it("upserts health on subsequent writes", () => {
      coordinator.setHealth({
        site_id: "test-site",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "First",
        updated_at: "2026-04-21T09:00:00Z",
      });
      coordinator.setHealth({
        site_id: "test-site",
        status: "critical",
        last_cycle_at: "2026-04-21T10:00:00Z",
        last_cycle_duration_ms: 2000,
        consecutive_failures: 3,
        message: "Third failure",
        updated_at: "2026-04-21T10:00:00Z",
      });
      const health = coordinator.getHealth("test-site");
      expect(health.status).toBe("critical");
      expect(health.consecutive_failures).toBe(3);
      expect(health.message).toBe("Third failure");
    });
  });

  describe("getLastCycleTrace / setLastCycleTrace", () => {
    it("returns null when no traces exist", () => {
      expect(coordinator.getLastCycleTrace("test-site")).toBeNull();
    });

    it("stores and retrieves a trace", () => {
      const trace: CycleTraceRecord = {
        cycle_id: "cycle_001",
        site_id: "test-site",
        started_at: "2026-04-21T10:00:00Z",
        finished_at: "2026-04-21T10:00:05Z",
        status: "complete",
        steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
        error: null,
      };
      coordinator.setLastCycleTrace(trace);
      const retrieved = coordinator.getLastCycleTrace("test-site");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.cycle_id).toBe("cycle_001");
      expect(retrieved!.status).toBe("complete");
      expect(retrieved!.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("returns the most recent trace", () => {
      coordinator.setLastCycleTrace({
        cycle_id: "cycle_001",
        site_id: "test-site",
        started_at: "2026-04-21T09:00:00Z",
        finished_at: "2026-04-21T09:00:05Z",
        status: "complete",
        steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
        error: null,
      });
      coordinator.setLastCycleTrace({
        cycle_id: "cycle_002",
        site_id: "test-site",
        started_at: "2026-04-21T10:00:00Z",
        finished_at: "2026-04-21T10:00:03Z",
        status: "partial",
        steps_completed: [1, 2, 3],
        error: null,
      });
      const retrieved = coordinator.getLastCycleTrace("test-site");
      expect(retrieved!.cycle_id).toBe("cycle_002");
      expect(retrieved!.status).toBe("partial");
    });
  });
});
