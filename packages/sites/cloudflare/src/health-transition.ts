/**
 * Health transition helper for Cloudflare Site.
 *
 * Pure function — no runtime dependencies.
 * Mirrors the unattended operation layer transition rules
 * defined in docs/product/unattended-operation-layer.md.
 */

export type HealthStatus =
  | "healthy"
  | "degraded"
  | "critical"
  | "auth_failed"
  | "unknown";

export type CycleOutcome =
  | "success"
  | "failure"
  | "auth_failure"
  | "stuck_recovery";

export interface HealthTransitionResult {
  status: HealthStatus;
  consecutiveFailures: number;
  message: string;
}

/**
 * Compute the next health state from a cycle outcome.
 *
 * Rules:
 * - success → healthy, consecutiveFailures = 0
 * - first failure → degraded, consecutiveFailures = 1
 * - third consecutive failure → critical
 * - auth failure → auth_failed
 * - stuck recovery → critical
 */
export function computeHealthTransition(
  _previousStatus: HealthStatus,
  previousConsecutiveFailures: number,
  outcome: CycleOutcome,
): HealthTransitionResult {
  if (outcome === "success") {
    return {
      status: "healthy",
      consecutiveFailures: 0,
      message: "Cycle completed successfully",
    };
  }

  if (outcome === "auth_failure") {
    return {
      status: "auth_failed",
      consecutiveFailures: previousConsecutiveFailures + 1,
      message: "Authentication failed — operator intervention required",
    };
  }

  if (outcome === "stuck_recovery") {
    return {
      status: "critical",
      consecutiveFailures: previousConsecutiveFailures,
      message: "Stuck cycle recovered — operator attention recommended",
    };
  }

  // outcome === "failure"
  const nextConsecutive = previousConsecutiveFailures + 1;
  if (nextConsecutive >= 3) {
    return {
      status: "critical",
      consecutiveFailures: nextConsecutive,
      message: `Cycle failed (${nextConsecutive} consecutive failures) — critical health`,
    };
  }
  return {
    status: "degraded",
    consecutiveFailures: nextConsecutive,
    message: `Cycle failed (${nextConsecutive} consecutive failures) — degraded health`,
  };
}
