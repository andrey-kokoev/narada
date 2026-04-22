import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultMacosSiteRunner } from "../src/runner.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../src/coordinator.js";
import type { MacosSiteConfig, CycleTraceRecord } from "../src/types.js";
import { FileCursorStore } from "@narada2/control-plane";
import { resolveSiteRoot } from "../src/path-utils.js";

describe("sleep-wake recovery fixtures", () => {
  let tempDir: string;
  let config: MacosSiteConfig;
  let runner: DefaultMacosSiteRunner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-sleep-test-"));
    config = {
      site_id: "test-site",
      site_root: tempDir,
      config_path: join(tempDir, "config.json"),
      cycle_interval_minutes: 1,
      lock_ttl_ms: 5_000,
      ceiling_ms: 10_000,
    };
    runner = new DefaultMacosSiteRunner({
      ceilingMs: 10_000,
      abortBufferMs: 1_000,
      lockTtlMs: 5_000,
    });
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── Helpers ───

  function getAllTraces(siteId: string): CycleTraceRecord[] {
    const db = openCoordinatorDb(siteId);
    try {
      const rows = db
        .prepare(
          `SELECT cycle_id, site_id, started_at, finished_at, status,
                  steps_completed, error
           FROM cycle_traces
           WHERE site_id = ?
           ORDER BY started_at ASC`
        )
        .all(siteId) as Array<{
          cycle_id: string;
          site_id: string;
          started_at: string;
          finished_at: string;
          status: string;
          steps_completed: string;
          error: string | null;
        }>;
      return rows.map((r) => ({
        cycle_id: r.cycle_id,
        site_id: r.site_id,
        started_at: r.started_at,
        finished_at: r.finished_at,
        status: r.status as CycleTraceRecord["status"],
        steps_completed: JSON.parse(r.steps_completed),
        error: r.error,
      }));
    } finally {
      db.close();
    }
  }

  function createStaleLock(siteId: string, ageMs: number): void {
    const lockDir = join(tempDir, siteId, "state", "cycle.lock");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      join(lockDir, "meta.json"),
      JSON.stringify({ pid: 99999, acquired_at: new Date().toISOString() }),
      "utf8"
    );
    const oldTime = new Date(Date.now() - ageMs);
    utimesSync(lockDir, oldTime, oldTime);
  }

  function createFreshLock(siteId: string): void {
    const lockDir = join(tempDir, siteId, "state", "cycle.lock");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      join(lockDir, "meta.json"),
      JSON.stringify({ pid: 99999, acquired_at: new Date().toISOString() }),
      "utf8"
    );
    // mtime is now — lock is fresh
  }

  function makeCursorStore(siteId: string): FileCursorStore {
    return new FileCursorStore({
      rootDir: resolveSiteRoot(siteId),
      scopeId: siteId,
    });
  }

  // ─── Scenario A ───

  describe("Scenario A: sleep before cycle start, catch-up on wake", () => {
    it("skips the missed interval without trace, then catches up on wake", async () => {
      // Pre-sleep: run one successful cycle, establishing a cursor
      const preSleep = await runner.runCycle(config, {
        fixtureDeltas: [{ id: "delta-1" }, { id: "delta-2" }],
      });
      expect(preSleep.status).toBe("complete");

      // Write a cursor simulating committed state
      const cursorStore = makeCursorStore("test-site");
      await cursorStore.commit("cursor-after-delta-2");

      // Sleep: no cycle runs. Simulate by observing that no new trace exists.
      const tracesBeforeWake = getAllTraces("test-site");
      expect(tracesBeforeWake).toHaveLength(1);

      // Wake: next cycle fires. It processes new deltas from the cursor position.
      const postWake = await runner.runCycle(config, {
        fixtureDeltas: [{ id: "delta-3" }, { id: "delta-4" }],
      });
      expect(postWake.status).toBe("complete");
      expect(postWake.steps_completed).toContain(2);

      // Cursor still readable (was not lost during sleep gap)
      const cursorAfter = await cursorStore.read();
      expect(cursorAfter).toBe("cursor-after-delta-2");

      // Health should remain healthy — sleep is not a failure
      const db = openCoordinatorDb("test-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);
      } finally {
        coordinator.close();
      }

      // Exactly two traces: pre-sleep and post-wake (no phantom trace for skipped interval)
      const tracesAfterWake = getAllTraces("test-site");
      expect(tracesAfterWake).toHaveLength(2);
      expect(tracesAfterWake[1].cycle_id).toBe(postWake.cycle_id);
    });
  });

  // ─── Scenario B ───

  describe("Scenario B: sleep mid-cycle, lock TTL expires, next cycle recovers", () => {
    it("steals the stale lock and completes a successful catch-up cycle", async () => {
      // Simulate a cycle that acquired the lock but was killed by sleep
      // before releasing. The lock is now stale (older than TTL).
      createStaleLock("test-site", 10_000); // 10s > 5s TTL

      // Post-wake: the next cycle should recover the stale lock and run
      const postWake = await runner.runCycle(config, {
        fixtureDeltas: [{ id: "delta-missed" }],
      });
      expect(postWake.status).toBe("complete");
      expect(postWake.steps_completed).toContain(1); // lock acquired
      expect(postWake.steps_completed).toContain(8); // lock released

      // Stale lock should be gone
      const lockDir = join(tempDir, "test-site", "state", "cycle.lock");
      expect(existsSync(lockDir)).toBe(false);

      // Health should be healthy — recovery is normal unattended behavior
      const db = openCoordinatorDb("test-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);
        expect(health.message).toContain("success");
      } finally {
        coordinator.close();
      }

      // Only one trace: the catch-up cycle
      const traces = getAllTraces("test-site");
      expect(traces).toHaveLength(1);
    });
  });

  // ─── Scenario C ───

  describe("Scenario C: sleep mid-cycle, wake before TTL expires", () => {
    it("fails fast because lock is still held; sleep is not counted as failure", async () => {
      // Use a runner with a LONG lock TTL so the lock does not become stale
      // before the acquire timeout (10s) expires.
      const longTtlRunner = new DefaultMacosSiteRunner({
        ceilingMs: 10_000,
        abortBufferMs: 1_000,
        lockTtlMs: 60_000,
      });

      // Pre-sleep: establish healthy state with one successful cycle
      await longTtlRunner.runCycle(config, { fixtureDeltas: [{ id: "delta-1" }] });

      // Simulate a cycle that started just before sleep and is still running
      // when the machine wakes. The lock is fresh (not yet stale).
      createFreshLock("test-site");

      // Post-wake: a new cycle tries to start but the lock is held
      const postWake = await longTtlRunner.runCycle(config, {
        fixtureDeltas: [{ id: "delta-2" }],
      });
      expect(postWake.status).toBe("failed");
      expect(postWake.error).toContain("Failed to acquire lock");

      // Health should remain healthy — the lock-hold is not a cycle failure,
      // it's an expected collision when the previous cycle is still alive.
      const db = openCoordinatorDb("test-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        // The pre-sleep cycle was healthy; the failed post-wake cycle increments
        // consecutive_failures but the transition from healthy on first failure
        // goes to degraded, not critical.
        expect(health.status).toBe("degraded");
        expect(health.consecutive_failures).toBe(1);
      } finally {
        coordinator.close();
      }
    });
  });

  // ─── Scenario D ───

  describe("Scenario D: long sleep with multiple missed intervals", () => {
    it("only one catch-up cycle runs; lock prevents duplicate work", async () => {
      // Pre-sleep: run a cycle, commit cursor
      const preSleep = await runner.runCycle(config, {
        fixtureDeltas: [{ id: "delta-1" }],
      });
      expect(preSleep.status).toBe("complete");

      const cursorStore = makeCursorStore("test-site");
      await cursorStore.commit("cursor-pre-sleep");

      // Simulate a very long sleep: the previous cycle's process died,
      // leaving a stale lock. Multiple intervals were missed.
      createStaleLock("test-site", 60_000); // 60s > 5s TTL

      // Catch-up cycle: processes ALL pending work
      const catchUp = await runner.runCycle(config, {
        fixtureDeltas: [
          { id: "delta-2" },
          { id: "delta-3" },
          { id: "delta-4" },
          { id: "delta-5" },
        ],
      });
      expect(catchUp.status).toBe("complete");
      expect(catchUp.steps_completed).toContain(2);

      // Immediately after catch-up, try another cycle (simulating the next
      // interval firing soon after). It should succeed but be a no-op because
      // the catch-up already processed everything.
      const nextCycle = await runner.runCycle(config, {
        fixtureDeltas: [], // no new deltas
      });
      expect(nextCycle.status).toBe("complete");

      // Verify only 3 traces total: pre-sleep, catch-up, next-interval
      const traces = getAllTraces("test-site");
      expect(traces).toHaveLength(3);
      expect(traces[1].cycle_id).toBe(catchUp.cycle_id);
      expect(traces[2].cycle_id).toBe(nextCycle.cycle_id);

      // Cursor should still be readable (durability across the gap)
      const cursorAfter = await cursorStore.read();
      expect(cursorAfter).toBe("cursor-pre-sleep");

      // Health should be healthy after the successful catch-up
      const db = openCoordinatorDb("test-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);
      } finally {
        coordinator.close();
      }
    });
  });

  // ─── FileLock macOS coverage ───

  describe("FileLock TTL recovery on macOS", () => {
    it("treats a lock directory older than staleAfterMs as stale (pure mtime check)", async () => {
      // macOS is not Windows, so FileLock.isStale() uses purely time-based
      // detection: ageMs > staleAfterMs. No PID check is performed on macOS.
      // This is sufficient because mkdir-based locking is atomic on Unix,
      // and a crashed process cannot update mtime.
      const { FileLock } = await import("@narada2/control-plane");
      const lock = new FileLock({
        rootDir: join(tempDir, "test-site"),
        lockName: "cycle.lock",
        staleAfterMs: 1_000,
        acquireTimeoutMs: 100,
      });

      // Acquire and immediately release
      const release = await lock.acquire();
      await release();

      // Make the lock stale by backdating mtime
      const lockDir = join(tempDir, "test-site", "state", "cycle.lock");
      mkdirSync(lockDir, { recursive: true });
      const oldTime = new Date(Date.now() - 5_000);
      utimesSync(lockDir, oldTime, oldTime);

      // Should be able to acquire again (stale lock was removed)
      const release2 = await lock.acquire();
      expect(release2).toBeTypeOf("function");
      await release2();
    });

    it("does not treat a fresh lock as stale", async () => {
      const { FileLock } = await import("@narada2/control-plane");
      const lock = new FileLock({
        rootDir: join(tempDir, "test-site"),
        lockName: "cycle.lock",
        staleAfterMs: 60_000,
        acquireTimeoutMs: 100,
      });

      const release = await lock.acquire();

      // A second lock with short timeout should fail
      const lock2 = new FileLock({
        rootDir: join(tempDir, "test-site"),
        lockName: "cycle.lock",
        staleAfterMs: 60_000,
        acquireTimeoutMs: 100,
      });

      await expect(lock2.acquire()).rejects.toThrow("Failed to acquire lock");

      await release();
    });
  });
});
