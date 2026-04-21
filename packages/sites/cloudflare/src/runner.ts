/**
 * Bounded Cycle Runner
 *
 * Executes one bounded 8-step Cycle for a Narada Site.
 */

import type { CloudflareEnv, CycleCoordinator } from "./coordinator.js";
import { computeHealthTransition } from "./health-transition.js";
import type { NotificationEmitter, OperatorNotification } from "./notification.js";
import { NullNotificationEmitter, DEFAULT_NOTIFICATION_COOLDOWN_MS } from "./notification.js";
import type { CycleStepHandler, CycleStepId } from "./cycle-step.js";
import type { CycleStepResult } from "./types.js";
import { createDefaultStepHandlers, CYCLE_STEP_ORDER } from "./cycle-step.js";


export interface CycleResult {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: "complete" | "partial" | "failed";
  steps_completed: number[];
  step_results?: CycleStepResult[];
  error?: string;
  trace_key: string;
  recovered_from_cycle_id?: string;
  stuck_duration_ms?: number;
}

export interface CycleConfig {
  ceilingMs: number;
  abortBufferMs: number;
  lockTtlMs: number;
  scopeId?: string;
}

const DEFAULT_CONFIG: CycleConfig = {
  ceilingMs: 30_000,
  abortBufferMs: 3_000,
  lockTtlMs: 35_000,
};

export async function runCycle(
  siteId: string,
  env: CloudflareEnv,
  config: Partial<CycleConfig> = {},
  emitter?: NotificationEmitter,
  stepHandlers?: Record<CycleStepId, CycleStepHandler>,
): Promise<CycleResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const stepsCompleted: number[] = [];
  const deadline = Date.now() + cfg.ceilingMs;
  const scopeId = cfg.scopeId ?? siteId;
  const notify = emitter ?? new NullNotificationEmitter();

  let coordinator: CycleCoordinator | null = null;
  let lockAcquired = false;
  let status: CycleResult["status"] = "complete";
  let error: string | undefined;
  let recoveredFromCycleId: string | undefined;
  let stuckDurationMs: number | undefined;
  const stepResults: CycleStepResult[] = [];

  const canContinue = (): boolean => Date.now() + cfg.abortBufferMs < deadline;

  try {
    const id = env.NARADA_SITE_COORDINATOR.idFromName(siteId);
    const stub = env.NARADA_SITE_COORDINATOR.get(id);
    coordinator = stub as unknown as CycleCoordinator;

    const lockResult = coordinator.acquireLock(cycleId, cfg.lockTtlMs);
    if (!lockResult.acquired) {
      // Lock contention is a cycle failure — update health
      const previousHealth = coordinator.getHealth();
      const transition = computeHealthTransition(
        previousHealth.status,
        previousHealth.consecutiveFailures,
        "failure",
      );
      coordinator.setHealth({
        ...previousHealth,
        status: transition.status,
        consecutiveFailures: transition.consecutiveFailures,
        lastCycleAt: new Date().toISOString(),
        lastCycleDurationMs: 0,
        locked: false,
        lockedByCycleId: null,
        message: transition.message,
        updatedAt: new Date().toISOString(),
      });

      if (transition.status === "critical" && previousHealth.status !== "critical") {
        try {
          await notify.emit(buildNotification({
            site_id: siteId,
            scope_id: scopeId,
            severity: "critical",
            health_status: "critical",
            summary: `Health degraded to critical on ${siteId}`,
            detail: `Lock held by ${lockResult.previousCycleId ?? "unknown"}`,
            suggested_action: `narada status --site ${siteId}`,
          }));
        } catch {
          // Notification failure is non-blocking
        }
      }
      return {
        cycle_id: cycleId, site_id: siteId,
        started_at: startedAt, finished_at: new Date().toISOString(),
        status: "failed", steps_completed: [],
        error: `Lock held by ${lockResult.previousCycleId ?? "unknown"}`,
        trace_key: `${siteId}/traces/${cycleId}/trace.json`,
      };
    }
    lockAcquired = true;
    stepsCompleted.push(1);

    // If we recovered a stale lock, record recovery trace and set critical health.
    if (lockResult.recovered && lockResult.previousCycleId) {
      recoveredFromCycleId = lockResult.previousCycleId;
      stuckDurationMs = lockResult.stuckDurationMs ?? 0;

      coordinator.recordRecoveryTrace({
        cycleId,
        previousCycleId: lockResult.previousCycleId,
        lockTtlMs: cfg.lockTtlMs,
        stuckDurationMs,
        recoveredAt: new Date().toISOString(),
      });

      const currentHealth = coordinator.getHealth();
      coordinator.setHealth({
        ...currentHealth,
        status: "critical",
        lastCycleAt: new Date().toISOString(),
        lastCycleDurationMs: 0,
        consecutiveFailures: currentHealth.consecutiveFailures + 1,
        locked: true,
        lockedByCycleId: cycleId,
        message: `Recovered from stuck cycle ${lockResult.previousCycleId} (stuck ${stuckDurationMs}ms)`,
        updatedAt: new Date().toISOString(),
      });

      try {
        await notify.emit(buildNotification({
          site_id: siteId,
          scope_id: scopeId,
          severity: "critical",
          health_status: "critical",
          summary: `Stuck cycle recovered on ${siteId}`,
          detail: `Recovered from stuck cycle ${lockResult.previousCycleId} (stuck ${stuckDurationMs}ms). Lock TTL was ${cfg.lockTtlMs}ms.`,
          suggested_action: `narada status --site ${siteId}`,
        }));
      } catch {
        // Notification failure is non-blocking
      }
    }

    const handlers = stepHandlers ?? createDefaultStepHandlers();
    const stepCtx = { cycleId, siteId, scopeId, coordinator, env };

    for (const stepId of CYCLE_STEP_ORDER) {
      if (!canContinue()) break;
      const result = await handlers[stepId](stepCtx, canContinue);
      stepResults.push(result);
      if (result.status === "failed") {
        throw new Error(`Step ${stepId} (${result.stepName}) failed: ${result.residuals.join(", ")}`);
      }
      if (result.status === "completed" || result.status === "skipped") {
        stepsCompleted.push(stepId);
      }
    }

    if (canContinue() && coordinator) {
      const durationMs = Date.now() - new Date(startedAt).getTime();
      const previousHealth = coordinator.getHealth();
      const transition = computeHealthTransition(
        previousHealth.status,
        previousHealth.consecutiveFailures,
        "success",
      );
      coordinator.setHealth({
        status: transition.status,
        consecutiveFailures: transition.consecutiveFailures,
        lastCycleAt: new Date().toISOString(),
        lastCycleDurationMs: durationMs,
        pendingWorkItems: 0, locked: true, lockedByCycleId: cycleId,
        message: `Cycle ${cycleId} completed steps [${stepsCompleted.join(", ")}]`,
        updatedAt: new Date().toISOString(),
      });
      stepsCompleted.push(7);
    }

    if (coordinator) {
      coordinator.releaseLock(cycleId);
      lockAcquired = false;
      stepsCompleted.push(8);
      // Update health snapshot to reflect released lock and final step list
      const currentHealth = coordinator.getHealth();
      coordinator.setHealth({
        ...currentHealth,
        locked: false,
        lockedByCycleId: null,
        message: `Cycle ${cycleId} completed steps [${stepsCompleted.join(", ")}]`,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    if (coordinator) {
      try {
        const previousHealth = coordinator.getHealth();
        const isAuthError = /\b(401|403|auth)\b/i.test(error ?? "");
        const outcome = isAuthError ? "auth_failure" : "failure";
        const transition = computeHealthTransition(
          previousHealth.status,
          previousHealth.consecutiveFailures,
          outcome,
        );
        coordinator.setHealth({
          ...previousHealth,
          status: transition.status,
          consecutiveFailures: transition.consecutiveFailures,
          lastCycleAt: new Date().toISOString(),
          lastCycleDurationMs: Date.now() - new Date(startedAt).getTime(),
          locked: false,
          lockedByCycleId: null,
          message: transition.message,
          updatedAt: new Date().toISOString(),
        });

        if (transition.status === "critical" && previousHealth.status !== "critical") {
          try {
            await notify.emit(buildNotification({
              site_id: siteId,
              scope_id: scopeId,
              severity: "critical",
              health_status: "critical",
              summary: `Health degraded to critical on ${siteId}`,
              detail: error ?? "Cycle failed",
              suggested_action: `narada status --site ${siteId}`,
            }));
          } catch {
            // Notification failure is non-blocking
          }
        }

        if (transition.status === "auth_failed" && previousHealth.status !== "auth_failed") {
          try {
            await notify.emit(buildNotification({
              site_id: siteId,
              scope_id: scopeId,
              severity: "critical",
              health_status: "auth_failed",
              summary: `Authentication failed on ${siteId}`,
              detail: error ?? "Auth failure",
              suggested_action: `narada auth refresh --site ${siteId}`,
            }));
          } catch {
            // Notification failure is non-blocking
          }
        }
      } catch {
        // Health update failure must not prevent lock release
      }
    }
    if (lockAcquired && coordinator) {
      try { coordinator.releaseLock(cycleId); } catch {}
      lockAcquired = false;
    }
  }

  const finishedAt = new Date().toISOString();
  if (status !== "failed") {
    status = stepsCompleted.length < 8 ? "partial" : "complete";
  }

  if (coordinator) {
    try {
      coordinator.setLastCycleTrace({
        cycleId, startedAt, finishedAt, status,
        stepsCompleted, stepResults: stepResults.length > 0 ? stepResults : undefined,
        error: error ?? null,
        traceKey: `${siteId}/traces/${cycleId}/trace.json`,
      });
    } catch {}
  }

  return {
    cycle_id: cycleId, site_id: siteId,
    started_at: startedAt, finished_at: finishedAt,
    status, steps_completed: stepsCompleted,
    step_results: stepResults.length > 0 ? stepResults : undefined,
    error,
    trace_key: `${siteId}/traces/${cycleId}/trace.json`,
    recovered_from_cycle_id: recoveredFromCycleId,
    stuck_duration_ms: stuckDurationMs,
  };
}

function buildNotification(partial: Omit<OperatorNotification, "occurred_at" | "cooldown_until">): OperatorNotification {
  const occurredAt = new Date().toISOString();
  const cooldownUntil = new Date(Date.now() + DEFAULT_NOTIFICATION_COOLDOWN_MS).toISOString();
  return {
    ...partial,
    occurred_at: occurredAt,
    cooldown_until: cooldownUntil,
  };
}
