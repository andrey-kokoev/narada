import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileLock, FileBasedLock } from "../../../src/persistence/lock.js";

describe("FileLock", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lock-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("acquire", () => {
    it("should acquire a lock and return release function", async () => {
      const lock = new FileLock({ rootDir: tempDir });

      const release = await lock.acquire();
      expect(typeof release).toBe("function");

      // Lock directory should exist
      const lockDir = join(tempDir, "state", "sync.lock");
      const s = await stat(lockDir);
      expect(s.isDirectory()).toBe(true);

      // Release should work
      await release();

      // Lock directory should be removed
      await expect(stat(lockDir)).rejects.toThrow();
    });

    it("should prevent concurrent acquisition", async () => {
      const lock = new FileLock({
        rootDir: tempDir,
        acquireTimeoutMs: 100,
        retryDelayMs: 10,
      });

      const release = await lock.acquire();

      // Try to acquire same lock from new instance
      const lock2 = new FileLock({
        rootDir: tempDir,
        acquireTimeoutMs: 50,
        retryDelayMs: 10,
      });

      await expect(lock2.acquire()).rejects.toThrow("timeout");

      await release();
    });

    it("should allow re-acquisition after release", async () => {
      const lock = new FileLock({ rootDir: tempDir });

      const release1 = await lock.acquire();
      await release1();

      const release2 = await lock.acquire();
      expect(typeof release2).toBe("function");
      await release2();
    });

    it("should handle idempotent release", async () => {
      const lock = new FileLock({ rootDir: tempDir });

      const release = await lock.acquire();
      await release();
      await release(); // Should not throw
    });
  });

  describe("isLocked", () => {
    it("should return true when lock is held", async () => {
      const lock = new FileLock({ rootDir: tempDir });

      expect(await lock.isLocked()).toBe(false);

      const release = await lock.acquire();
      expect(await lock.isLocked()).toBe(true);

      await release();
      expect(await lock.isLocked()).toBe(false);
    });
  });

  describe("stale lock detection", () => {
    it("should detect and reclaim stale locks", async () => {
      const lock = new FileLock({
        rootDir: tempDir,
        staleAfterMs: 50,
        retryDelayMs: 10,
      });

      // Acquire and simulate stale by waiting
      const release = await lock.acquire();

      // Don't release - let it become stale
      // Wait for lock to become stale
      await new Promise((r) => setTimeout(r, 100));

      // New lock should be able to acquire
      const lock2 = new FileLock({
        rootDir: tempDir,
        staleAfterMs: 50,
        retryDelayMs: 10,
      });

      const release2 = await lock2.acquire();
      expect(typeof release2).toBe("function");

      await release2();
    });
  });

  describe("custom lock name", () => {
    it("should use custom lock name", async () => {
      const lock = new FileLock({
        rootDir: tempDir,
        lockName: "custom.lock",
      });

      const release = await lock.acquire();

      const lockDir = join(tempDir, "state", "custom.lock");
      const s = await stat(lockDir);
      expect(s.isDirectory()).toBe(true);

      await release();
    });
  });
});

describe("FileBasedLock", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "filelock-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("acquire", () => {
    it("should acquire lock using file", async () => {
      const lock = new FileBasedLock({ rootDir: tempDir });

      const release = await lock.acquire();
      expect(typeof release).toBe("function");

      const lockFile = join(tempDir, "state", "sync.lock.file");
      const s = await stat(lockFile);
      expect(s.isFile()).toBe(true);

      await release();
    });

    it("should prevent concurrent acquisition", async () => {
      const lock = new FileBasedLock({
        rootDir: tempDir,
        acquireTimeoutMs: 50,
        retryDelayMs: 10,
      });

      const release = await lock.acquire();

      const lock2 = new FileBasedLock({
        rootDir: tempDir,
        acquireTimeoutMs: 50,
        retryDelayMs: 10,
      });

      await expect(lock2.acquire()).rejects.toThrow("timeout");

      await release();
    });
  });
});
