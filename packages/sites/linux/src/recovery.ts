/**
 * Recovery surface for Linux Sites.
 *
 * Implements the stuck-cycle recovery protocol from
 * docs/product/unattended-operation-layer.md §2.
 */

import { join } from "node:path";
import { stat, rm } from "node:fs/promises";
import { resolveSiteRoot } from "./path-utils.js";
import type { LinuxSiteMode } from "./types.js";

export interface LockHealthReport {
  /** Current state of the lock */
  status: "healthy" | "stuck" | "missing";
  /** Absolute path to the lock directory */
  lockDir: string;
  /** Age of the lock in milliseconds (undefined when missing) */
  ageMs?: number;
  /** TTL threshold in milliseconds used for the check */
  lockTtlMs: number;
}

const DEFAULT_LOCK_TTL_MS = 310_000;

/**
 * Check the health of a Site's cycle lock without modifying it.
 *
 * Returns a report describing whether the lock is:
 * - `missing`: no lock directory exists
 * - `healthy`: lock exists and is younger than the TTL
 * - `stuck`: lock exists and is older than the TTL
 */
export async function checkLockHealth(
  siteId: string,
  mode: LinuxSiteMode,
  lockTtlMs = DEFAULT_LOCK_TTL_MS
): Promise<LockHealthReport> {
  const rootDir = resolveSiteRoot(siteId, mode);
  const lockDir = join(rootDir, "state", "cycle.lock");

  try {
    const s = await stat(lockDir);
    const ageMs = Date.now() - s.mtimeMs;

    if (ageMs > lockTtlMs) {
      return { status: "stuck", lockDir, ageMs, lockTtlMs };
    }
    return { status: "healthy", lockDir, ageMs, lockTtlMs };
  } catch {
    return { status: "missing", lockDir, lockTtlMs };
  }
}

/**
 * Recover a stuck lock by removing it if it has exceeded its TTL.
 *
 * Returns `true` if a stale lock was removed, `false` otherwise.
 */
export async function recoverStuckLock(
  siteId: string,
  mode: LinuxSiteMode,
  lockTtlMs = DEFAULT_LOCK_TTL_MS
): Promise<boolean> {
  const health = await checkLockHealth(siteId, mode, lockTtlMs);

  if (health.status !== "stuck") {
    return false;
  }

  try {
    await rm(health.lockDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
