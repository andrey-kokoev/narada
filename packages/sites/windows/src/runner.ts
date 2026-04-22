import { join } from "node:path";
import { FileLock, computeHealthTransition } from "@narada2/control-plane";
import type { WindowsSiteConfig, WindowsCycleResult } from "./types.js";
import { ensureSiteDir, resolveSiteRoot } from "./path-utils.js";
import { notifyOperator } from "./notification.js";
import { WindowsCycleCoordinator } from "./cycle-coordinator.js";
import {
  createSyncStepHandler,
  createLiveSyncStepHandler,
  createDeriveWorkStepHandler,
  createCampaignDeriveWorkStepHandler,
  createEvaluateStepHandler,
  createCampaignEvaluateStepHandler,
  createHandoffStepHandler,
  createCampaignHandoffStepHandler,
  createEffectExecuteStepHandler,
  createReconcileStepHandler,
  type CycleStepResult,
} from "./cycle-step.js";
import type { CharterRunner, RuntimePolicy } from "@narada2/control-plane";
import type { FixtureSourceDelta } from "./cycle-coordinator.js";
import { createGraphSource } from "./graph-source.js";

export interface WindowsSiteRunner {
  runCycle(config: WindowsSiteConfig, options?: CycleRunOptions): Promise<WindowsCycleResult>;
  recoverStuckLock(siteId: string, variant: WindowsSiteConfig["variant"]): Promise<boolean>;
}

export interface CycleConfig {
  ceilingMs: number;
  abortBufferMs: number;
  lockTtlMs: number;
}

export type CycleMode = "live" | "fixture";

export interface CycleRunOptions {
  /** Explicit cycle mode. Live mode requires `config.live_source`. */
  mode?: CycleMode;
  /** Pre-loaded fixture deltas for step-2 sync (fixture mode only). */
  fixtureDeltas?: FixtureSourceDelta[];
  /** Charter runner for step-4 campaign evaluation. Required when campaign mode is active. */
  charterRunner?: CharterRunner;
  /** Runtime policy override for campaign governance. Defaults to campaign_brief only. */
  runtimePolicy?: RuntimePolicy;
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

  async runCycle(config: WindowsSiteConfig, options?: CycleRunOptions): Promise<WindowsCycleResult> {
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const stepsCompleted: number[] = [];
    const stepResults: CycleStepResult[] = [];
    const deadline = Date.now() + this.cycleConfig.ceilingMs;
    let lockRelease: (() => Promise<void>) | undefined;
    let status: WindowsCycleResult["status"] = "complete";
    let error: string | undefined;
    let outcome: "success" | "failure" | "auth_failure" = "success";

    const canContinue = (): boolean =>
      Date.now() + this.cycleConfig.abortBufferMs < deadline;

    try {
      await ensureSiteDir(config.site_id, config.variant);

      const { default: DatabaseCtor } = await import("better-sqlite3");
      const { siteDbPath } = await import("./path-utils.js");
      const db = new DatabaseCtor(siteDbPath(config.site_id, config.variant));
      const coordinator = new WindowsCycleCoordinator(db);

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

        // Build step handlers
        // Step 2 mode resolution:
        //  - explicit 'live'  → requires config.live_source
        //  - explicit 'fixture' → uses fixture sync (test path)
        //  - auto-detect      → live if live_source present, fixture if fixtureDeltas present,
        //                       otherwise FAILS HONESTLY (no silent empty fixture sync)
        const resolvedMode = ((): CycleMode => {
          if (options?.mode) return options.mode;
          if (config.live_source) return "live";
          if (options?.fixtureDeltas) return "fixture";
          throw new Error(
            "Cycle cannot run: no mode specified, no live_source configured, and no fixture deltas provided. " +
            "Pass mode: 'fixture' for test mode or configure live_source for live mode.",
          );
        })();

        const step2Handler = (() => {
          if (resolvedMode === "live") {
            if (!config.live_source) {
              throw new Error(
                "Cycle mode is 'live' but config.live_source is missing. " +
                "Configure live_source or pass mode: 'fixture'.",
              );
            }
            const source = createGraphSource(config.live_source, config.site_id);
            return createLiveSyncStepHandler(source, {
              limit: config.live_source.limit,
              conversationId: config.live_source.conversation_id,
            });
          }
          return createSyncStepHandler(options?.fixtureDeltas ?? []);
        })();

        // Step 3 derivation strategy:
        //  - campaign_request_senders present → real foreman-owned campaign formation
        //  - absent → fixture grouping (test/back-compat path)
        const step3Handler = config.campaign_request_senders
          ? createCampaignDeriveWorkStepHandler({
              campaign_request_senders: config.campaign_request_senders,
              campaign_request_lookback_days: config.campaign_request_lookback_days,
            })
          : createDeriveWorkStepHandler();

        // Shared runtime policy for campaign mode
        const getRuntimePolicy = (): RuntimePolicy =>
          options?.runtimePolicy ?? {
            primary_charter: "campaign_request",
            allowed_actions: ["campaign_brief"],
            runtime_authorized: false,
          };

        // Step 4 evaluation strategy:
        //  - campaign mode active + explicit charterRunner → real envelope evaluation
        //  - campaign mode active + no charterRunner → fail honestly
        //  - fixture mode → fixtureEvaluate stub
        const step4Handler = (() => {
          if (config.campaign_request_senders) {
            if (!options?.charterRunner) {
              throw new Error(
                "Campaign derivation is configured but no charterRunner was provided. " +
                  "Pass charterRunner in CycleRunOptions or configure charter_runtime in site config.",
              );
            }
            return createCampaignEvaluateStepHandler({
              charterRunner: options.charterRunner,
              getRuntimePolicy,
              rootDir: resolveSiteRoot(config.site_id, config.variant),
            });
          }
          return createEvaluateStepHandler();
        })();

        // Step 5 handoff strategy:
        //  - campaign mode active → real foreman governance + outbound handoff
        //  - fixture mode → fixture hardcoded send_reply
        const step5Handler = config.campaign_request_senders
          ? createCampaignHandoffStepHandler({ getRuntimePolicy })
          : createHandoffStepHandler();

        const handlers = {
          2: step2Handler,
          3: step3Handler,
          4: step4Handler,
          5: step5Handler,
          6: createEffectExecuteStepHandler(),
          7: createReconcileStepHandler(),
        };

        const stepCtx = {
          cycleId,
          siteId: config.site_id,
          scopeId: config.site_id,
          coordinator,
        };

        for (let stepId = 2; stepId <= 7; stepId++) {
          if (!canContinue()) {
            outcome = "failure";
            break;
          }

          const handler = handlers[stepId as 2 | 3 | 4 | 5 | 6 | 7];
          const result = await handler(stepCtx, canContinue);
          stepResults.push(result);
          stepsCompleted.push(stepId);

          if (result.status === "failed") {
            outcome = "failure";
            status = "failed";
            if (!error) {
              error = result.residuals.join("; ");
            }
          }
        }

        // Step 8: Update health and trace (always runs before lock release)
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

        // Write trace record
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
        const { siteDbPath } = await import("./path-utils.js");
        const db = new DatabaseCtor(siteDbPath(config.site_id, config.variant));
        const failCoordinator = new WindowsCycleCoordinator(db);
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

          if (transition.status === "critical" || transition.status === "auth_failed") {
            await notifyOperator(config.site_id, config.site_id, transition.status, failCoordinator);
          }

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

    // Best-effort trace write if not already done
    if (stepResults.length === 0) {
      try {
        const { default: DatabaseCtor } = await import("better-sqlite3");
        const { siteDbPath } = await import("./path-utils.js");
        const db = new DatabaseCtor(siteDbPath(config.site_id, config.variant));
        const traceCoordinator = new WindowsCycleCoordinator(db);
        try {
          traceCoordinator.setLastCycleTrace({
            cycle_id: cycleId,
            site_id: config.site_id,
            started_at: startedAt,
            finished_at: finishedAt,
            status,
            steps_completed: stepsCompleted,
            error: error ?? null,
          });
        } finally {
          traceCoordinator.close();
        }
      } catch {
        // Best-effort trace write
      }
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
