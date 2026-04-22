import { join } from "node:path";
import { FileLock, computeHealthTransition } from "@narada2/control-plane";
import type { WindowsSiteConfig, WindowsCycleResult } from "./types.js";
import { ensureSiteDir, resolveSiteRoot } from "./path-utils.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "./coordinator.js";
import { notifyOperator } from "./notification.js";

export interface WindowsSiteRunner {
  runCycle(config: WindowsSiteConfig): Promise<WindowsCycleResult>;
  recoverStuckLock(siteId: string, variant: WindowsSiteConfig["variant"]): Promise<boolean>;
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

export class DefaultWindowsSiteRunner implements WindowsSiteRunner {
  private cycleConfig: CycleConfig;

  constructor(config?: Partial<CycleConfig>) {
    this.cycleConfig = { ...DEFAULT_CYCLE_CONFIG, ...config };
  }

  async runCycle(config: WindowsSiteConfig): Promise<WindowsCycleResult> {
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const stepsCompleted: number[] = [];
    const deadline = Date.now() + this.cycleConfig.ceilingMs;
    let lockRelease: (() => Promise<void>) | undefined;
    let status: WindowsCycleResult["status"] = "complete";
    let error: string | undefined;
    let outcome: "success" | "failure" | "auth_failure" = "success";

    const canContinue = (): boolean =>
      Date.now() + this.cycleConfig.abortBufferMs < deadline;

    try {
      await ensureSiteDir(config.site_id, config.variant);

      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);

      try {
        const rootDir = resolveSiteRoot(config.site_id, config.variant);
        const lock = new FileLock({
          rootDir,
          lockName: "cycle.lock",
          staleAfterMs: this.cycleConfig.lockTtlMs,
          acquireTimeoutMs: 10_000,
        });

        try {
          lockRelease = await lock.acquire();
        } catch (lockErr) {
          const recovered = await this.recoverStuckLock(config.site_id, config.variant);
          if (recovered) {
            lockRelease = await lock.acquire();
          } else {
            throw lockErr;
          }
        }
        stepsCompleted.push(1);

        // Steps 2-6: Fixture stubs for deferred implementation
        for (let stepId = 2; stepId <= 6; stepId++) {
          if (canContinue()) {
            stepsCompleted.push(stepId);
          }
        }

        // Partial cycles (deadline exceeded before completing steps 2-6) count as failures
        if (stepsCompleted.length < 6) {
          outcome = "failure";
        }

        // Step 7: Update health and trace (always runs before lock release)
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

        // Emit operator notification on critical / auth_failed transitions
        if (transition.status === "critical" || transition.status === "auth_failed") {
          await notifyOperator(config.site_id, config.site_id, transition.status, coordinator);
        }

        stepsCompleted.push(7);

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
        const db = await openCoordinatorDb(config.site_id, config.variant);
        const failCoordinator = new SqliteSiteCoordinator(db);
        try {
          const previousHealth = failCoordinator.getHealth(config.site_id);
          const isAuthError = /\b(401|403|auth)\b/i.test(error ?? "");
          const outcome = isAuthError ? "auth_failure" : "failure";
          const transition = computeHealthTransition(
            previousHealth.status,
            previousHealth.consecutive_failures,
            outcome,
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

          // Emit operator notification on critical / auth_failed transitions
          if (transition.status === "critical" || transition.status === "auth_failed") {
            await notifyOperator(config.site_id, config.site_id, transition.status, failCoordinator);
          }
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

    // Write trace record
    try {
      const db = await openCoordinatorDb(config.site_id, config.variant);
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        coordinator.setLastCycleTrace({
          cycle_id: cycleId,
          site_id: config.site_id,
          started_at: startedAt,
          finished_at: finishedAt,
          status,
          steps_completed: stepsCompleted,
          error: error ?? null,
        });
      } finally {
        coordinator.close();
      }
    } catch {
      // Best-effort trace write
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
    variant: WindowsSiteConfig["variant"]
  ): Promise<boolean> {
    const rootDir = resolveSiteRoot(siteId, variant);
    const lockDir = join(rootDir, "state", "cycle.lock");

    try {
      const { stat, rm } = await import("node:fs/promises");
      const s = await stat(lockDir);
      const ageMs = Date.now() - s.mtimeMs;

      if (ageMs > this.cycleConfig.lockTtlMs) {
        await rm(lockDir, { recursive: true, force: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
