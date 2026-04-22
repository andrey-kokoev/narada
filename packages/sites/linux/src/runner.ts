import { FileLock, computeHealthTransition } from "@narada2/control-plane";
import type { LinuxSiteConfig, LinuxCycleResult, LinuxSiteMode } from "./types.js";
import { ensureSiteDir, resolveSiteRoot, siteDbPath } from "./path-utils.js";
import { SqliteSiteCoordinator } from "./coordinator.js";
import { recoverStuckLock as recoverStuckLockStandalone } from "./recovery.js";

export interface LinuxSiteRunner {
  runCycle(config: LinuxSiteConfig): Promise<LinuxCycleResult>;
  recoverStuckLock(siteId: string, mode: LinuxSiteMode): Promise<boolean>;
}

export interface CycleConfig {
  ceilingMs: number;
  abortBufferMs: number;
  lockTtlMs: number;
}

const DEFAULT_CYCLE_CONFIG: CycleConfig = {
  ceilingMs: 300_000,
  abortBufferMs: 5_000,
  lockTtlMs: 310_000,
};

/**
 * Default Linux Site runner.
 *
 * Executes one bounded 8-step Cycle:
 * 1. Acquire lock
 * 2. Sync source deltas (fixture-backed in v0)
 * 3. Derive/admit work
 * 4. Evaluate charters (fixture-backed in v0)
 * 5. Handoff decisions (fixture-backed in v0)
 * 6. Reconcile submitted effects (fixture-backed in v0)
 * 7. Update health and trace
 * 8. Release lock
 */
export class DefaultLinuxSiteRunner implements LinuxSiteRunner {
  private cycleConfig: CycleConfig;

  constructor(config?: Partial<CycleConfig>) {
    this.cycleConfig = { ...DEFAULT_CYCLE_CONFIG, ...config };
  }

  async runCycle(config: LinuxSiteConfig): Promise<LinuxCycleResult> {
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const stepsCompleted: number[] = [];
    let lockRelease: (() => Promise<void>) | undefined;
    let status: LinuxCycleResult["status"] = "complete";
    let error: string | undefined;
    let outcome: "success" | "failure" | "auth_failure" = "success";

    const deadline = Date.now() + this.cycleConfig.ceilingMs;
    const canContinue = (): boolean =>
      Date.now() + this.cycleConfig.abortBufferMs < deadline;

    try {
      await ensureSiteDir(config.site_id, config.mode);

      const { default: DatabaseCtor } = await import("better-sqlite3");
      const db = new DatabaseCtor(siteDbPath(config.site_id, config.mode));
      const coordinator = new SqliteSiteCoordinator(db);

      try {
        const rootDir = resolveSiteRoot(config.site_id, config.mode);
        const lock = new FileLock({
          rootDir,
          lockName: "cycle.lock",
          staleAfterMs: this.cycleConfig.lockTtlMs,
          acquireTimeoutMs: 10_000,
        });

        try {
          lockRelease = await lock.acquire();
        } catch (lockErr) {
          const recovered = await this.recoverStuckLock(config.site_id, config.mode);
          if (recovered) {
            lockRelease = await lock.acquire();
          } else {
            throw lockErr;
          }
        }
        stepsCompleted.push(1);

        // Steps 2–6: Fixture-backed in v0
        // In v1, these will use real sync, foreman, charter runtime, and outbound workers.
        for (let stepId = 2; stepId <= 6; stepId++) {
          if (!canContinue()) {
            outcome = "failure";
            break;
          }

          // v0: no-op fixture step
          stepsCompleted.push(stepId);
        }

        // Step 7: Update health and trace (always runs before lock release)
        stepsCompleted.push(7);
        const durationMs = Date.now() - new Date(startedAt).getTime();
        const previousHealth = coordinator.getHealth(config.site_id);
        const transition = computeHealthTransition(
          previousHealth.status,
          previousHealth.consecutive_failures,
          outcome,
        );
        coordinator.setHealth({
          site_id: config.site_id,
          status: transition.status,
          last_cycle_at: startedAt,
          last_cycle_duration_ms: durationMs,
          consecutive_failures: transition.consecutiveFailures,
          message: transition.message,
          updated_at: new Date().toISOString(),
        });

        coordinator.setLastCycleTrace({
          cycle_id: cycleId,
          site_id: config.site_id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status,
          steps_completed: stepsCompleted,
          error: error ?? null,
        });

        // Step 8: Release lock
        if (lockRelease) {
          await lockRelease();
          lockRelease = undefined;
          stepsCompleted.push(8);
        }
      } finally {
        coordinator.close();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      status = "failed";

      // Update health on failure
      try {
        const { default: DatabaseCtor } = await import("better-sqlite3");
        const db = new DatabaseCtor(siteDbPath(config.site_id, config.mode));
        const failCoordinator = new SqliteSiteCoordinator(db);
        try {
          const previousHealth = failCoordinator.getHealth(config.site_id);
          const isAuthError = /\b(401|403|auth)\b/i.test(error ?? "");
          const failOutcome = isAuthError ? "auth_failure" : "failure";
          const transition = computeHealthTransition(
            previousHealth.status,
            previousHealth.consecutive_failures,
            failOutcome,
          );
          failCoordinator.setHealth({
            site_id: config.site_id,
            status: transition.status,
            last_cycle_at: new Date().toISOString(),
            last_cycle_duration_ms: Date.now() - new Date(startedAt).getTime(),
            consecutive_failures: transition.consecutiveFailures,
            message: transition.message,
            updated_at: new Date().toISOString(),
          });

          failCoordinator.setLastCycleTrace({
            cycle_id: cycleId,
            site_id: config.site_id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            status: "failed",
            steps_completed: stepsCompleted,
            error: error ?? null,
          });
        } finally {
          failCoordinator.close();
        }
      } catch {
        // Best-effort health update
      }

      if (lockRelease) {
        try {
          await lockRelease();
        } catch {
          // ignore release errors on failure path
        }
        lockRelease = undefined;
      }
    }

    const finishedAt = new Date().toISOString();
    if (status !== "failed" && stepsCompleted.length < 8) {
      status = "partial";
    }

    return {
      cycle_id: cycleId,
      site_id: config.site_id,
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      steps_completed: stepsCompleted,
      error,
    };
  }

  async recoverStuckLock(
    siteId: string,
    mode: LinuxSiteMode
  ): Promise<boolean> {
    return recoverStuckLockStandalone(siteId, mode, this.cycleConfig.lockTtlMs);
  }
}
