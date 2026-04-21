import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import type { SiteHealthRecord, CycleTraceRecord } from "../../src/types.js";

describe("NaradaSiteCoordinator", () => {
  let db: Database.Database;
  let coordinator: NaradaSiteCoordinator;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinator = new NaradaSiteCoordinator(createMockState(db));
  });

  it("initializes tables on first method call", () => {
    coordinator.getHealth();
    const tables = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("site_locks");
    expect(names).toContain("site_health");
    expect(names).toContain("cycle_traces");
    expect(names).toContain("cycle_recovery_traces");
    expect(names).toContain("context_records");
    expect(names).toContain("work_items");
  });

  it("acquires lock when none exists", () => {
    const result = coordinator.acquireLock("cycle-1", 5000);
    expect(result.acquired).toBe(true);
    expect(result.recovered).toBeUndefined();
  });

  it("rejects acquisition when another cycle holds an unexpired lock", () => {
    coordinator.acquireLock("cycle-1", 5000);
    const result = coordinator.acquireLock("cycle-2", 5000);
    expect(result.acquired).toBe(false);
    expect(result.previousCycleId).toBe("cycle-1");
    expect(result.recovered).toBeUndefined();
  });

  it("allows idempotent re-acquisition by the same cycleId", () => {
    coordinator.acquireLock("cycle-1", 5000);
    const result = coordinator.acquireLock("cycle-1", 5000);
    expect(result.acquired).toBe(true);
  });

  it("allows acquisition after lock expires", async () => {
    coordinator.acquireLock("cycle-1", 10);
    await new Promise((r) => setTimeout(r, 20));
    const result = coordinator.acquireLock("cycle-2", 5000);
    expect(result.acquired).toBe(true);
    expect(result.previousCycleId).toBe("cycle-1");
    expect(result.recovered).toBe(true);
    expect(result.stuckDurationMs).toBeGreaterThanOrEqual(10);
  });

  it("recovers an expired lock without deleting an active lock", () => {
    coordinator.acquireLock("active-cycle", 60_000);
    // Simulate an expired lock by directly inserting an old one
    const oldAcquired = new Date(Date.now() - 100_000).toISOString();
    const oldExpires = new Date(Date.now() - 50_000).toISOString();
    db.prepare("DELETE FROM site_locks").run();
    db.prepare("INSERT INTO site_locks (lock_id, cycle_id, acquired_at, expires_at) VALUES ('site_lock', 'stuck-cycle', ?, ?)").run(oldAcquired, oldExpires);

    const result = coordinator.acquireLock("new-cycle", 5000);
    expect(result.acquired).toBe(true);
    expect(result.previousCycleId).toBe("stuck-cycle");
    expect(result.recovered).toBe(true);
    expect(result.stuckDurationMs).toBeGreaterThanOrEqual(100_000);
  });

  it("releases lock held by the same cycle", () => {
    coordinator.acquireLock("cycle-1", 5000);
    coordinator.releaseLock("cycle-1");
    const after = coordinator.acquireLock("cycle-2", 5000);
    expect(after.acquired).toBe(true);
  });

  it("does not release lock held by a different cycle", () => {
    coordinator.acquireLock("cycle-1", 5000);
    coordinator.releaseLock("cycle-2");
    const after = coordinator.acquireLock("cycle-2", 5000);
    expect(after.acquired).toBe(false);
  });

  it("returns default health when none is set", () => {
    const health = coordinator.getHealth();
    expect(health.status).toBe("unknown");
    expect(health.consecutiveFailures).toBe(0);
  });

  it("persists and reads health", () => {
    const record: SiteHealthRecord = { status: "healthy", lastCycleAt: new Date().toISOString(), lastCycleDurationMs: 1200, consecutiveFailures: 0, message: "All good", updatedAt: new Date().toISOString() };
    coordinator.setHealth(record);
    const read = coordinator.getHealth();
    expect(read.status).toBe("healthy");
    expect(read.lastCycleDurationMs).toBe(1200);
  });

  it("returns null when no trace is set", () => {
    expect(coordinator.getLastCycleTrace()).toBeNull();
  });

  it("persists and reads a cycle trace", () => {
    const trace: CycleTraceRecord = { cycleId: "cycle-1", startedAt: "2024-01-01T00:00:00Z", finishedAt: "2024-01-01T00:00:05Z", status: "success", stepsCompleted: [1, 2, 3], error: null, traceKey: "trace-001" };
    coordinator.setLastCycleTrace(trace);
    const read = coordinator.getLastCycleTrace();
    expect(read).not.toBeNull();
    expect(read!.cycleId).toBe("cycle-1");
    expect(read!.stepsCompleted).toEqual([1, 2, 3]);
  });

  it("persists and reads cycle trace with step results", () => {
    const trace: CycleTraceRecord = {
      cycleId: "cycle-1",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:00:05Z",
      status: "partial",
      stepsCompleted: [1, 2, 3],
      stepResults: [
        { stepId: 2, stepName: "sync", status: "completed", recordsWritten: 3, residuals: ["delta_1"], startedAt: "2024-01-01T00:00:01Z", finishedAt: "2024-01-01T00:00:02Z" },
        { stepId: 3, stepName: "derive_work", status: "skipped", recordsWritten: 0, residuals: ["fixture_safe_noop"], startedAt: "2024-01-01T00:00:02Z", finishedAt: "2024-01-01T00:00:03Z" },
      ],
      error: null,
      traceKey: "trace-002",
    };
    coordinator.setLastCycleTrace(trace);
    const read = coordinator.getLastCycleTrace();
    expect(read).not.toBeNull();
    expect(read!.stepResults).toBeDefined();
    expect(read!.stepResults!.length).toBe(2);
    expect(read!.stepResults![0].stepId).toBe(2);
    expect(read!.stepResults![0].status).toBe("completed");
    expect(read!.stepResults![1].stepId).toBe(3);
    expect(read!.stepResults![1].status).toBe("skipped");
  });

  it("returns the most recent trace by started_at", () => {
    coordinator.setLastCycleTrace({ cycleId: "cycle-1", startedAt: "2024-01-01T00:00:00Z", finishedAt: "2024-01-01T00:00:05Z", status: "success", stepsCompleted: [], error: null, traceKey: "t1" });
    coordinator.setLastCycleTrace({ cycleId: "cycle-2", startedAt: "2024-01-02T00:00:00Z", finishedAt: "2024-01-02T00:00:05Z", status: "success", stepsCompleted: [], error: null, traceKey: "t2" });
    const read = coordinator.getLastCycleTrace();
    expect(read!.cycleId).toBe("cycle-2");
  });

  it("survives DO reconstruction with same database", () => {
    coordinator.setHealth({ status: "healthy", lastCycleAt: "2024-01-01T00:00:00Z", lastCycleDurationMs: 1000, consecutiveFailures: 0, message: "before hibernation", updatedAt: "2024-01-01T00:00:00Z" });
    const coordinator2 = new NaradaSiteCoordinator(createMockState(db));
    const health = coordinator2.getHealth();
    expect(health.message).toBe("before hibernation");
  });

  it("records and retrieves a recovery trace", () => {
    const trace = {
      cycleId: "cycle-new",
      previousCycleId: "cycle-stuck",
      lockTtlMs: 35000,
      stuckDurationMs: 60000,
      recoveredAt: "2024-01-01T00:01:00Z",
    };
    coordinator.recordRecoveryTrace(trace);
    const read = coordinator.getLastRecoveryTrace();
    expect(read).not.toBeNull();
    expect(read!.cycleId).toBe("cycle-new");
    expect(read!.previousCycleId).toBe("cycle-stuck");
    expect(read!.lockTtlMs).toBe(35000);
    expect(read!.stuckDurationMs).toBe(60000);
  });

  it("returns the most recent recovery trace by recovered_at", () => {
    coordinator.recordRecoveryTrace({ cycleId: "r1", previousCycleId: "s1", lockTtlMs: 1000, stuckDurationMs: 5000, recoveredAt: "2024-01-01T00:00:00Z" });
    coordinator.recordRecoveryTrace({ cycleId: "r2", previousCycleId: "s2", lockTtlMs: 2000, stuckDurationMs: 10000, recoveredAt: "2024-01-02T00:00:00Z" });
    const read = coordinator.getLastRecoveryTrace();
    expect(read!.cycleId).toBe("r2");
  });

  it("does not mutate work item state during stale lock recovery", () => {
    // Seed a work item
    coordinator.insertWorkItem("wi-001", "ctx-001", "scope-001", "opened");
    expect(coordinator.getWorkItemCount()).toBe(1);

    // Insert an expired lock directly
    const oldAcquired = new Date(Date.now() - 100_000).toISOString();
    const oldExpires = new Date(Date.now() - 50_000).toISOString();
    db.prepare("INSERT INTO site_locks (lock_id, cycle_id, acquired_at, expires_at) VALUES ('site_lock', 'stuck-cycle', ?, ?)").run(oldAcquired, oldExpires);

    // Recover the stale lock
    const result = coordinator.acquireLock("new-cycle", 5000);
    expect(result.acquired).toBe(true);
    expect(result.recovered).toBe(true);

    // Verify work item count is unchanged
    expect(coordinator.getWorkItemCount()).toBe(1);
    expect(coordinator.getContextRecordCount()).toBe(0);
    expect(coordinator.getEvaluationCount()).toBe(0);
    expect(coordinator.getDecisionCount()).toBe(0);
    expect(coordinator.getOutboundCommandCount()).toBe(0);
  });
});
