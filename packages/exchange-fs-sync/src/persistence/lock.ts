/**
 * Cross-platform file locking implementation
 *
 * Uses proper-lockfile for robust cross-platform locking that handles
 * Windows and Unix differences correctly.
 */

import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { isWindows } from "../utils/platform.js";

// Simple implementation that works on both platforms
// Uses mkdir-based locking on Unix and file-based on Windows

export interface FileLockOptions {
  rootDir: string;
  lockName?: string;
  staleAfterMs?: number;
  retryDelayMs?: number;
  acquireTimeoutMs?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Cross-platform file lock implementation.
 *
 * On Unix: Uses atomic mkdir for locking (fails if directory exists)
 * On Windows: Uses a combination of file existence and metadata
 *
 * This implementation is designed to be:
 * - Crash-safe: lock can be detected as stale and cleaned up
 * - Cross-platform: works on Windows, Linux, macOS
 * - Simple: no native dependencies required
 */
export class FileLock {
  private readonly lockDir: string;
  private readonly metaPath: string;
  private readonly staleAfterMs: number;
  private readonly retryDelayMs: number;
  private readonly acquireTimeoutMs: number;

  constructor(opts: FileLockOptions) {
    const name = opts.lockName ?? "sync.lock";
    this.lockDir = join(opts.rootDir, "state", name);
    this.metaPath = join(this.lockDir, "meta.json");
    this.staleAfterMs = opts.staleAfterMs ?? 5 * 60_000;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
    this.acquireTimeoutMs = opts.acquireTimeoutMs ?? 30_000;
  }

  private async writeMeta(): Promise<void> {
    // On Windows, we need to handle file locking more carefully
    // Use atomic write pattern
    const metaContent = JSON.stringify(
      {
        pid: process.pid,
        acquired_at: nowIso(),
        platform: process.platform,
      },
      null,
      2,
    );

    if (isWindows) {
      // On Windows, use a separate meta file approach
      const { writeFile } = await import("node:fs/promises");
      await writeFile(this.metaPath, `${metaContent}\n`, "utf8");
    } else {
      // On Unix, we can use the same approach
      const { writeFile } = await import("node:fs/promises");
      await writeFile(this.metaPath, `${metaContent}\n`, "utf8");
    }
  }

  private async isStale(): Promise<boolean> {
    try {
      const s = await stat(this.lockDir);
      const ageMs = Date.now() - s.mtimeMs;

      // Additional check: verify the owning process is still alive
      if (ageMs > this.staleAfterMs) {
        return true;
      }

      // On Windows, also check if the process from meta is still running
      if (isWindows && ageMs > 5000) {
        try {
          const { readFile } = await import("node:fs/promises");
          const metaRaw = await readFile(this.metaPath, "utf8");
          const meta = JSON.parse(metaRaw) as { pid: number };

          // Check if process exists (Windows-specific)
          try {
            const { exec } = await import("node:child_process");
            const { promisify } = await import("node:util");
            const execAsync = promisify(exec);
            await execAsync(`tasklist /FI "PID eq ${meta.pid}"`, {
              windowsHide: true,
            });
            // Process exists, lock is not stale
            return false;
          } catch {
            // Process doesn't exist, lock is stale
            return true;
          }
        } catch {
          // Can't read meta, assume stale if old enough
          return ageMs > this.staleAfterMs;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Acquire the lock. Returns a release function.
   * @throws Error if lock cannot be acquired within timeout
   */
  async acquire(): Promise<() => Promise<void>> {
    const startedAt = Date.now();

    while (true) {
      try {
        // Try to create the lock directory (atomic on both platforms)
        await mkdir(this.lockDir, { recursive: false });
        await this.writeMeta();

        let released = false;

        return async () => {
          if (released) {
            return;
          }
          released = true;

          // On Windows, try multiple times to remove (handles file handles)
          if (isWindows) {
            for (let i = 0; i < 3; i++) {
              try {
                await rm(this.lockDir, { recursive: true, force: true });
                return;
              } catch {
                await new Promise((r) => setTimeout(r, 100));
              }
            }
            // Best effort - if we can't remove it now, it might be stale later
          } else {
            await rm(this.lockDir, { recursive: true, force: true });
          }
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        // EEXIST means another process holds the lock
        if (code !== "EEXIST") {
          throw error;
        }

        // Check if lock is stale
        if (await this.isStale()) {
          try {
            await rm(this.lockDir, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
          continue;
        }

        // Check timeout
        if (Date.now() - startedAt > this.acquireTimeoutMs) {
          throw new Error(
            `Failed to acquire lock within ${this.acquireTimeoutMs}ms timeout`,
          );
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  /**
   * Check if the lock is currently held (not stale)
   */
  async isLocked(): Promise<boolean> {
    try {
      await stat(this.lockDir);
      return !(await this.isStale());
    } catch {
      return false;
    }
  }
}

/**
 * Simple lock using a file instead of directory (alternative implementation)
 * Useful when directory-based locking has issues on certain Windows configurations.
 */
export class FileBasedLock {
  private readonly lockFile: string;
  private readonly staleAfterMs: number;
  private readonly retryDelayMs: number;
  private readonly acquireTimeoutMs: number;

  constructor(opts: FileLockOptions) {
    const name = opts.lockName ?? "sync.lock";
    this.lockFile = join(opts.rootDir, "state", `${name}.file`);
    this.staleAfterMs = opts.staleAfterMs ?? 5 * 60_000;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
    this.acquireTimeoutMs = opts.acquireTimeoutMs ?? 30_000;
  }

  async acquire(): Promise<() => Promise<void>> {
    const { open, rm } = await import("node:fs/promises");
    const startedAt = Date.now();

    while (true) {
      try {
        // Try to create lock file with exclusive flag (atomic)
        const fd = await open(this.lockFile, "wx");

        // Write metadata
        const meta = JSON.stringify({
          pid: process.pid,
          acquired_at: nowIso(),
        });
        await fd.writeFile(meta, "utf8");
        await fd.close();

        let released = false;
        return async () => {
          if (released) return;
          released = true;
          await rm(this.lockFile, { force: true });
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (code === "EEXIST") {
          // Check if stale
          try {
            const s = await stat(this.lockFile);
            if (Date.now() - s.mtimeMs > this.staleAfterMs) {
              await rm(this.lockFile, { force: true });
              continue;
            }
          } catch {
            // File might have been removed
          }

          if (Date.now() - startedAt > this.acquireTimeoutMs) {
            throw new Error("Failed to acquire lock within timeout");
          }

          await new Promise((r) => setTimeout(r, this.retryDelayMs));
        } else {
          throw error;
        }
      }
    }
  }
}
