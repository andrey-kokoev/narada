/**
 * Readiness check types for ops-kit preflight and explain.
 */

export type ReadinessStatus = "pass" | "fail" | "warn";

/** A single readiness check result. */
export interface ReadinessCheck {
  /** Check category. */
  category:
    | "config"
    | "env_var"
    | "executable"
    | "directory"
    | "file"
    | "endpoint"
    | "charter"
    | "tool"
    | "activation"
    | "source";

  /** Human-readable check name. */
  name: string;

  /** Pass / fail / warn. */
  status: ReadinessStatus;

  /** What was checked. */
  detail: string;

  /** If failed or warned, the remediation action. */
  remediation?: string;
}

/** Aggregate readiness result for a target. */
export interface ReadinessReport {
  /** Target identifier (scope_id or mailbox_id or workflow_id). */
  target: string;

  /** Overall status. */
  status: ReadinessStatus;

  /** Individual checks. */
  checks: ReadinessCheck[];

  /** Count of each status. */
  counts: { pass: number; fail: number; warn: number };

  /** Next actions if not fully passing. */
  nextActions: string[];
}

/** Activation state for a target. */
export interface ActivationState {
  target: string;
  activated: boolean;
  activatedAt?: string;
  reason?: string;
}
