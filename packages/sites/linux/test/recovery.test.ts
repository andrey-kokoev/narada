import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLockHealth, recoverStuckLock } from "../src/recovery.js";

describe("recovery", () => {
  let tmpDir: string;
  let originalEnv: string | undefined;
  const siteId = "test-site";
  const mode = "user" as const;

  beforeEach(() => {
    originalEnv = process.env.NARADA_SITE_ROOT;
    tmpDir = mkdtempSync(join(tmpdir(), "narada-linux-recovery-"));
    process.env.NARADA_SITE_ROOT = tmpDir;
  });

  afterEach(() => {
    process.env.NARADA_SITE_ROOT = originalEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function lockDir() {
    return join(tmpDir, siteId, "state", "cycle.lock");
  }

  describe("checkLockHealth", () => {
    it("reports missing when no lock exists", async () => {
      const report = await checkLockHealth(siteId, mode);
      expect(report.status).toBe("missing");
      expect(report.lockDir).toBe(lockDir());
      expect(report.lockTtlMs).toBe(310_000);
    });

    it("reports healthy for a fresh lock", async () => {
      mkdirSync(lockDir(), { recursive: true });
      const report = await checkLockHealth(siteId, mode, 1000);
      expect(report.status).toBe("healthy");
      expect(report.ageMs).toBeDefined();
      expect(report.ageMs!).toBeLessThan(1000);
    });

    it("reports stuck for an old lock", async () => {
      mkdirSync(lockDir(), { recursive: true });
      const report = await checkLockHealth(siteId, mode, 0);
      expect(report.status).toBe("stuck");
      expect(report.ageMs).toBeDefined();
      expect(report.ageMs!).toBeGreaterThanOrEqual(0);
    });
  });

  describe("recoverStuckLock", () => {
    it("returns false when no lock exists", async () => {
      const recovered = await recoverStuckLock(siteId, mode);
      expect(recovered).toBe(false);
    });

    it("returns false when lock is fresh", async () => {
      mkdirSync(lockDir(), { recursive: true });
      const recovered = await recoverStuckLock(siteId, mode, 1000);
      expect(recovered).toBe(false);
      expect(checkLockHealth(siteId, mode, 1000)).resolves.toMatchObject({
        status: "healthy",
      });
    });

    it("returns true and removes stale lock", async () => {
      mkdirSync(lockDir(), { recursive: true });
      const recovered = await recoverStuckLock(siteId, mode, 0);
      expect(recovered).toBe(true);

      const after = await checkLockHealth(siteId, mode, 0);
      expect(after.status).toBe("missing");
    });
  });
});
