import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultMacosSiteRunner } from "../../src/runner.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../../src/coordinator.js";
import type { MacosSiteConfig } from "../../src/types.js";

describe("DefaultMacosSiteRunner", () => {
  let tempDir: string;
  let config: MacosSiteConfig;
  let runner: DefaultMacosSiteRunner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-runner-test-"));
    config = {
      site_id: "test-site",
      site_root: tempDir,
      config_path: join(tempDir, "config.json"),
      cycle_interval_minutes: 5,
      lock_ttl_ms: 35_000,
      ceiling_ms: 30_000,
    };
    runner = new DefaultMacosSiteRunner({
      ceilingMs: 10_000,
      abortBufferMs: 1_000,
      lockTtlMs: 15_000,
    });
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
      const db = openCoordinatorDb("test-site");
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
      const failingRunner = new DefaultMacosSiteRunner({
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
      const failingRunner = new DefaultMacosSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      await failingRunner.runCycle(config);
      await failingRunner.runCycle(config);
      const result3 = await failingRunner.runCycle(config);

      expect(result3.status).toBe("partial");

      const db = openCoordinatorDb("test-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth("test-site");
        expect(health.status).toBe("critical");
        expect(health.consecutive_failures).toBe(3);
      } finally {
        coordinator.close();
      }
    });

    it("resets consecutive failures after a successful cycle", async () => {
      const failingRunner = new DefaultMacosSiteRunner({
        ceilingMs: 1,
        abortBufferMs: 0,
        lockTtlMs: 15_000,
      });

      await failingRunner.runCycle(config);

      const successResult = await runner.runCycle(config);
      expect(successResult.status).toBe("complete");

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

    it("fails fast if lock is held and not stale", async () => {
      // Acquire lock manually
      const { FileLock } = await import("@narada2/control-plane");
      const lock = new FileLock({
        rootDir: join(tempDir, "test-site"),
        lockName: "cycle.lock",
        staleAfterMs: 60_000,
        acquireTimeoutMs: 100,
      });
      const release = await lock.acquire();

      try {
        const result = await runner.runCycle(config);
        expect(result.status).toBe("failed");
        expect(result.error).toContain("Failed to acquire lock");
      } finally {
        await release();
      }
    });

    it("processes fixture deltas when provided", async () => {
      const result = await runner.runCycle(config, {
        fixtureDeltas: [{ id: "delta-1" }, { id: "delta-2" }],
      });

      expect(result.status).toBe("complete");
      expect(result.steps_completed).toContain(2);
    });
  });

  describe("recoverStuckLock", () => {
    it("returns false when no lock exists", async () => {
      const recovered = await runner.recoverStuckLock("test-site");
      expect(recovered).toBe(false);
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

      const recovered = await runner.recoverStuckLock("test-site");
      expect(recovered).toBe(true);
    });
  });
});
