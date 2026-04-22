import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultWindowsSiteRunner } from "../../src/runner.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../../src/coordinator.js";
import type { WindowsSiteConfig } from "../../src/types.js";

describe("DefaultWindowsSiteRunner", () => {
  let tempDir: string;
  let config: WindowsSiteConfig;
  let runner: DefaultWindowsSiteRunner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-runner-test-"));
    config = {
      site_id: "test-site",
      variant: "wsl",
      site_root: tempDir,
      config_path: join(tempDir, "config.json"),
      cycle_interval_minutes: 5,
      lock_ttl_ms: 35_000,
      ceiling_ms: 30_000,
    };
    runner = new DefaultWindowsSiteRunner({
      ceilingMs: 10_000,
      abortBufferMs: 1_000,
      lockTtlMs: 15_000,
    });
    // Override site root via env for testing
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("runCycle", () => {
    it("executes a complete cycle and writes health + trace", async () => {
      const result = await runner.runCycle(config);

      expect(result.site_id).toBe("test-site");
      expect(result.status).toBe("complete");
      expect(result.steps_completed).toContain(1); // lock acquired
      expect(result.steps_completed).toContain(8); // lock released
      expect(result.error).toBeUndefined();

      // Verify health was written
      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);
        expect(health.last_cycle_at).not.toBeNull();

        const trace = coordinator.getLastCycleTrace("test-site");
        expect(trace).not.toBeNull();
        expect(trace!.cycle_id).toBe(result.cycle_id);
        expect(trace!.status).toBe("complete");
      } finally {
        coordinator.close();
      }
    });

    it("creates site directory structure", async () => {
      await runner.runCycle(config);

      expect(() => statSync(join(tempDir, "test-site", "state"))).not.toThrow();
      expect(() => statSync(join(tempDir, "test-site", "logs"))).not.toThrow();
      expect(() => statSync(join(tempDir, "test-site", "traces"))).not.toThrow();
    });

    it("releases lock even when cycle fails", async () => {
      // Force a failure by using a very short ceiling
      const failingRunner = new DefaultWindowsSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      const result = await failingRunner.runCycle(config);

      // Should be partial because deadline is exceeded immediately
      expect(result.status).toBe("partial");

      // Lock should be released — we can run another cycle
      const result2 = await runner.runCycle(config);
      expect(result2.status).toBe("complete");
    });

    it("increments consecutive failures on repeated failures", async () => {
      const failingRunner = new DefaultWindowsSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      // Run 3 failing cycles
      await failingRunner.runCycle(config);
      await failingRunner.runCycle(config);
      await failingRunner.runCycle(config);

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        // computeHealthTransition degrades to critical after 3 failures
        expect(health.status).toBe("critical");
        expect(health.consecutive_failures).toBe(3);
      } finally {
        coordinator.close();
      }
    });

    it("resets consecutive failures after a successful cycle", async () => {
      const failingRunner = new DefaultWindowsSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      // Run 2 failing cycles
      await failingRunner.runCycle(config);
      await failingRunner.runCycle(config);

      // Then a successful one
      await runner.runCycle(config);

      const db = await openCoordinatorDb(config.site_id, config.variant);
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

  describe("recoverStuckLock", () => {
    it("returns false when no lock exists", async () => {
      const recovered = await runner.recoverStuckLock(config.site_id, config.variant);
      expect(recovered).toBe(false);
    });

    it("returns false when lock is not stale", async () => {
      // Acquire a lock
      const { FileLock } = await import("@narada2/control-plane");
      const lock = new FileLock({
        rootDir: join(tempDir, "test-site"),
        lockName: "cycle.lock",
        staleAfterMs: 60_000,
      });
      const release = await lock.acquire();

      try {
        const recovered = await runner.recoverStuckLock(config.site_id, config.variant);
        expect(recovered).toBe(false);
      } finally {
        await release();
      }
    });

    it("returns true and removes a stale lock", async () => {
      // Create a stale lock directory manually
      const lockDir = join(tempDir, "test-site", "state", "cycle.lock");
      const { mkdirSync, writeFileSync, utimesSync } = await import("node:fs");
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(
        join(lockDir, "meta.json"),
        JSON.stringify({ pid: 12345, acquired_at: new Date().toISOString() }),
        "utf8"
      );
      // Set mtime to 1 hour ago
      const oldTime = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(lockDir, oldTime, oldTime);

      const recovered = await runner.recoverStuckLock(config.site_id, config.variant);
      expect(recovered).toBe(true);
    });
  });
});
