import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SqliteSiteCoordinator } from "../src/coordinator.js";

describe("SqliteSiteCoordinator", () => {
  let db: Database.Database;
  let coordinator: SqliteSiteCoordinator;
  const dbPath = join(tmpdir(), `narada-linux-coord-test-${Date.now()}.db`);

  beforeEach(() => {
    db = new Database(dbPath);
    coordinator = new SqliteSiteCoordinator(db);
  });

  afterEach(() => {
    coordinator.close();
    try {
      rm(dbPath, { force: true });
    } catch {
      // ignore
    }
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
      const record = {
        site_id: "test-site",
        status: "degraded" as const,
        last_cycle_at: "2026-04-22T10:00:00Z",
        last_cycle_duration_ms: 15000,
        consecutive_failures: 1,
        message: "Sync timeout",
        updated_at: "2026-04-22T10:00:00Z",
      };
      coordinator.setHealth(record);
      const health = coordinator.getHealth("test-site");
      expect(health.status).toBe("degraded");
      expect(health.consecutive_failures).toBe(1);
      expect(health.message).toBe("Sync timeout");
    });

    it("updates existing health record", () => {
      coordinator.setHealth({
        site_id: "test-site",
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "OK",
        updated_at: "2026-04-22T09:00:00Z",
      });
      coordinator.setHealth({
        site_id: "test-site",
        status: "critical",
        last_cycle_at: "2026-04-22T10:00:00Z",
        last_cycle_duration_ms: 5000,
        consecutive_failures: 3,
        message: "Repeated failures",
        updated_at: "2026-04-22T10:00:00Z",
      });
      const health = coordinator.getHealth("test-site");
      expect(health.status).toBe("critical");
      expect(health.consecutive_failures).toBe(3);
    });
  });

  describe("getLastCycleTrace / setLastCycleTrace", () => {
    it("returns null when no trace exists", () => {
      const trace = coordinator.getLastCycleTrace("test-site");
      expect(trace).toBeNull();
    });

    it("stores and retrieves a cycle trace", () => {
      const record = {
        cycle_id: "cycle_001",
        site_id: "test-site",
        started_at: "2026-04-22T10:00:00Z",
        finished_at: "2026-04-22T10:05:00Z",
        status: "complete" as const,
        steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
        error: null,
      };
      coordinator.setLastCycleTrace(record);
      const trace = coordinator.getLastCycleTrace("test-site");
      expect(trace).not.toBeNull();
      expect(trace!.cycle_id).toBe("cycle_001");
      expect(trace!.status).toBe("complete");
      expect(trace!.steps_completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("returns the most recent trace", () => {
      coordinator.setLastCycleTrace({
        cycle_id: "cycle_001",
        site_id: "test-site",
        started_at: "2026-04-22T09:00:00Z",
        finished_at: "2026-04-22T09:05:00Z",
        status: "complete",
        steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
        error: null,
      });
      coordinator.setLastCycleTrace({
        cycle_id: "cycle_002",
        site_id: "test-site",
        started_at: "2026-04-22T10:01:00Z",
        finished_at: "2026-04-22T10:05:00Z",
        status: "failed",
        steps_completed: [1, 2],
        error: "Timeout",
      });
      const trace = coordinator.getLastCycleTrace("test-site");
      expect(trace!.cycle_id).toBe("cycle_002");
      expect(trace!.status).toBe("failed");
    });
  });
});
