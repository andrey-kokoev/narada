import { join } from "node:path";
import { FileLock, computeHealthTransition } from "@narada2/control-plane";
import type { MacosSiteConfig, MacosCycleResult } from "./types.js";
import { ensureSiteDir, resolveSiteRoot } from "./path-utils.js";
import { SqliteSiteCoordinator } from "./coordinator.js";

export interface CycleConfig {
  ceilingMs: number;
  abortBufferMs: number;
  lockTtlMs: number;
}

export interface CycleRunOptions {
  /** Fixture deltas for step-2 sync (test path). */
  fixtureDeltas?: unknown[];
}

const DEFAULT_CYCLE_CONFIG: CycleConfig = {
  ceilingMs: 300_000,
  abortBufferMs: 5_000,
  lockTtlMs: 310_000,
};

export interface MacosSiteRunner {
  runCycle(config: MacosSiteConfig, options?: CycleRunOptions): Promise<MacosCycleResult>;
  recoverStuckLock(siteId: string): Promise<boolean>;
}

/**
 * Step handler context passed to each cycle step.
 */
interface StepContext {
  cycleId: string;
  siteId: string;
  coordinator: SqliteSiteCoordinator;
}

/**
 * Result of a single cycle step.
 */
interface StepResult {
  status: "ok" | "failed" | "skipped";
  residuals: string[];
}

/**
 * Step 2: Sync source deltas (fixture mode for v0).
 */
async function syncStep(_ctx: StepContext, _canContinue: () => boolean, fixtureDeltas?: unknown[]): Promise<StepResult> {
  // v0: fixture sync only. In v1, this will pull from Graph API or other sources.
  if (fixtureDeltas && fixtureDeltas.length > 0) {
    return { status: "ok", residuals: [`processed ${fixtureDeltas.length} fixture deltas`] };
  }
  return { status: "ok", residuals: ["no deltas to process"] };
}

/**
 * Step 3: Derive / admit work (fixture mode for v0).
 */
async function deriveWorkStep(_ctx: StepContext, _canContinue: () => boolean): Promise<StepResult> {
  // v0: no-op fixture. In v1, this runs context formation + foreman admission.
  return { status: "ok", residuals: ["fixture derive-work"] };
}

/**
 * Step 4: Run charter evaluation (fixture mode for v0).
 */
async function evaluateStep(_ctx: StepContext, _canContinue: () => boolean): Promise<StepResult> {
  // v0: no-op fixture. In v1, this leases work and executes charters.
  return { status: "ok", residuals: ["fixture evaluation"] };
}

/**
 * Step 5: Create draft / intent handoffs (fixture mode for v0).
 */
async function handoffStep(_ctx: StepContext, _canContinue: () => boolean): Promise<StepResult> {
  // v0: no-op fixture. In v1, this runs foreman governance and creates outbound commands.
  return { status: "ok", residuals: ["fixture handoff"] };
}

/**
 * Step 6: Reconcile submitted effects (fixture mode for v0).
 */
async function reconcileStep(_ctx: StepContext, _canContinue: () => boolean): Promise<StepResult> {
  // v0: no-op fixture. In v1, this checks confirmation status of previously submitted effects.
  return { status: "ok", residuals: ["fixture reconciliation"] };
}

/**
 * Step 7: Update health and trace.
 */
async function healthTraceStep(ctx: StepContext, outcome: "success" | "failure" | "auth_failure", startedAt: string, status: MacosCycleResult["status"], error: string | undefined, stepsCompleted: number[]): Promise<StepResult> {
  const durationMs = Date.now() - new Date(startedAt).getTime();
  const previousHealth = ctx.coordinator.getHealth(ctx.siteId);
  const transition = computeHealthTransition(
    previousHealth.status,
    previousHealth.consecutive_failures,
    outcome,
  );
  ctx.coordinator.setHealth({
    site_id: ctx.siteId,
    status: transition.status,
    last_cycle_at: startedAt,
    last_cycle_duration_ms: durationMs,
    consecutive_failures: transition.consecutiveFailures,
    message: transition.message,
    updated_at: new Date().toISOString(),
  });
  ctx.coordinator.setLastCycleTrace({
    cycle_id: ctx.cycleId,
    site_id: ctx.siteId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    steps_completed: stepsCompleted,
    error: error ?? null,
  });
  return { status: "ok", residuals: ["health and trace updated"] };
}

export class DefaultMacosSiteRunner implements MacosSiteRunner {
  private cycleConfig: CycleConfig;

  constructor(config?: Partial<CycleConfig>) {
    this.cycleConfig = { ...DEFAULT_CYCLE_CONFIG, ...config };
  }

  async runCycle(config: MacosSiteConfig, options?: CycleRunOptions): Promise<MacosCycleResult> {
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const stepsCompleted: number[] = [];
    const stepResults: StepResult[] = [];
    const deadline = Date.now() + this.cycleConfig.ceilingMs;
    let lockRelease: (() => Promise<void>) | undefined;
    let status: MacosCycleResult["status"] = "complete";
    let error: string | undefined;
    let outcome: "success" | "failure" | "auth_failure" = "success";

    const canContinue = (): boolean =>
      Date.now() + this.cycleConfig.abortBufferMs < deadline;

    try {
      await ensureSiteDir(config.site_id);

      const { default: DatabaseCtor } = await import("better-sqlite3");
      const { siteDbPath } = await import("./path-utils.js");
      const db = new DatabaseCtor(siteDbPath(config.site_id));
      const coordinator = new SqliteSiteCoordinator(db);

      try {
        const rootDir = resolveSiteRoot(config.site_id);
        const lock = new FileLock({
          rootDir,
          lockName: "cycle.lock",
          staleAfterMs: this.cycleConfig.lockTtlMs,
          acquireTimeoutMs: 10_000,
        });

        try {
          lockRelease = await lock.acquire();
        } catch (lockErr) {
          const recovered = await this.recoverStuckLock(config.site_id);
          if (recovered) {
            lockRelease = await lock.acquire();
          } else {
            throw lockErr;
          }
        }
        stepsCompleted.push(1);

        const stepCtx: StepContext = {
          cycleId,
          siteId: config.site_id,
          coordinator,
        };

        const handlers = [
          { id: 2, fn: () => syncStep(stepCtx, canContinue, options?.fixtureDeltas) },
          { id: 3, fn: () => deriveWorkStep(stepCtx, canContinue) },
          { id: 4, fn: () => evaluateStep(stepCtx, canContinue) },
          { id: 5, fn: () => handoffStep(stepCtx, canContinue) },
          { id: 6, fn: () => reconcileStep(stepCtx, canContinue) },
        ];

        for (const { id, fn } of handlers) {
          if (!canContinue()) {
            outcome = "failure";
            status = "partial";
            break;
          }

          const result = await fn();
          stepResults.push(result);
          stepsCompleted.push(id);

          if (result.status === "failed") {
            outcome = "failure";
            status = "failed";
            if (!error) {
              error = result.residuals.join("; ");
            }
          }
        }

        // Step 7: Update health and trace (always runs before lock release)
        const healthResult = await healthTraceStep(
          stepCtx,
          outcome,
          startedAt,
          status,
          error,
          stepsCompleted,
        );
        stepResults.push(healthResult);
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
        const { default: DatabaseCtor } = await import("better-sqlite3");
        const { siteDbPath } = await import("./path-utils.js");
        const db = new DatabaseCtor(siteDbPath(config.site_id));
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
            last_cycle_at: startedAt,
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
        // Best effort — don't let health write failure mask the original error
      }

      // Release lock on failure
      if (lockRelease) {
        try {
          await lockRelease();
        } catch {
          // Ignore release errors on failure path
        }
        lockRelease = undefined;
      }
    }

    return {
      cycle_id: cycleId,
      site_id: config.site_id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status,
      steps_completed: stepsCompleted,
      error,
    };
  }

  async recoverStuckLock(siteId: string): Promise<boolean> {
    const rootDir = resolveSiteRoot(siteId);
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
