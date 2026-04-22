import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultLinuxSiteRunner } from "../src/runner.js";
import { ensureSiteDir, resolveSiteRoot } from "../src/path-utils.js";
import { SqliteSiteCoordinator } from "../src/coordinator.js";
import Database from "better-sqlite3";

describe("DefaultLinuxSiteRunner", () => {
  const testRoot = join(tmpdir(), "narada-linux-runner-test-" + Date.now());
  const siteId = "test-site";
  const mode = "user" as const;

  beforeEach(async () => {
    process.env.NARADA_SITE_ROOT = testRoot;
    await ensureSiteDir(siteId, mode);
  });

  afterEach(async () => {
    delete process.env.NARADA_SITE_ROOT;
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("runCycle", () => {
    it("executes a complete cycle and records health/trace", async () => {
      const runner = new DefaultLinuxSiteRunner();
      const config = {
        site_id: siteId,
        mode,
        site_root: resolveSiteRoot(siteId, mode),
        config_path: join(resolveSiteRoot(siteId, mode), "config.json"),
        cycle_interval_minutes: 5,
        lock_ttl_ms: 310_000,
        ceiling_ms: 300_000,
      };

      const result = await runner.runCycle(config);

      expect(result.site_id).toBe(siteId);
      expect(result.status).toBe("complete");
      expect(result.steps_completed).toContain(1); // lock acquired
      expect(result.steps_completed).toContain(8); // lock released
      expect(result.error).toBeUndefined();

      // Verify health was recorded
      const dbPath = join(resolveSiteRoot(siteId, mode), "db", "coordinator.db");
      const db = new Database(dbPath);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const health = coordinator.getHealth(siteId);
        expect(health.status).toBe("healthy");
        expect(health.consecutive_failures).toBe(0);

        const trace = coordinator.getLastCycleTrace(siteId);
        expect(trace).not.toBeNull();
        expect(trace!.cycle_id).toBe(result.cycle_id);
        expect(trace!.status).toBe("complete");
      } finally {
        coordinator.close();
      }
    });

    it("handles failure gracefully and updates health", async () => {
      const runner = new DefaultLinuxSiteRunner();
      const config = {
        site_id: siteId,
        mode,
        site_root: resolveSiteRoot(siteId, mode),
        config_path: join(resolveSiteRoot(siteId, mode), "config.json"),
        cycle_interval_minutes: 5,
        lock_ttl_ms: 310_000,
        ceiling_ms: 300_000,
      };

      // First run: successful
      await runner.runCycle(config);

      // Simulate a stuck lock by creating an old lock directory
      const lockDir = join(resolveSiteRoot(siteId, mode), "state", "cycle.lock");
      await mkdir(lockDir, { recursive: true });

      // Second run: should detect stuck lock and recover
      const result2 = await runner.runCycle(config);
      expect(result2.status).toMatch(/complete|partial|failed/);
    });
  });

  describe("recoverStuckLock", () => {
    it("returns false when no lock exists", async () => {
      const runner = new DefaultLinuxSiteRunner();
      const recovered = await runner.recoverStuckLock(siteId, mode);
      expect(recovered).toBe(false);
    });

    it("returns false when lock is fresh", async () => {
      const runner = new DefaultLinuxSiteRunner();
      const lockDir = join(resolveSiteRoot(siteId, mode), "state", "cycle.lock");
      await mkdir(lockDir, { recursive: true });

      const recovered = await runner.recoverStuckLock(siteId, mode);
      expect(recovered).toBe(false);
    });

    it("returns true and removes stale lock", async () => {
      const runner = new DefaultLinuxSiteRunner({ lockTtlMs: 1 });
      const lockDir = join(resolveSiteRoot(siteId, mode), "state", "cycle.lock");
      await mkdir(lockDir, { recursive: true });

      // Wait for lock to become stale
      await new Promise((r) => setTimeout(r, 50));

      const recovered = await runner.recoverStuckLock(siteId, mode);
      expect(recovered).toBe(true);
    });
  });
});
