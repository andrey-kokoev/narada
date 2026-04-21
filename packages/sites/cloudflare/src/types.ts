/**
 * Types for the Cloudflare Site runtime.
 */

export interface SiteHealthRecord {
  status: "healthy" | "degraded" | "critical" | "auth_failed" | "unknown";
  lastCycleAt: string | null;
  lastCycleDurationMs: number | null;
  consecutiveFailures: number;
  pendingWorkItems?: number | null;
  locked?: boolean | null;
  lockedByCycleId?: string | null;
  message: string | null;
  updatedAt: string;
}

export interface CycleTraceRecord {
  cycleId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  stepsCompleted: number[];
  stepResults?: CycleStepResult[];
  error: string | null;
  traceKey: string;
}

export interface CycleStepResult {
  stepId: 2 | 3 | 4 | 5 | 6;
  stepName: "sync" | "derive_work" | "evaluate" | "handoff" | "reconcile";
  status: "completed" | "skipped" | "failed";
  recordsWritten: number;
  residuals: string[];
  startedAt: string;
  finishedAt: string;
}

export interface CyclePhaseTrace {
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface RecoveryTraceRecord {
  cycleId: string;
  previousCycleId: string;
  lockTtlMs: number;
  stuckDurationMs: number;
  recoveredAt: string;
}

export interface FactRecord {
  factId: string;
  sourceId: string;
  factType: string;
  payloadJson: string;
  observedAt: string;
  admitted: boolean;
  createdAt: string;
}

export interface FixtureSourceDelta {
  sourceId: string;
  eventId: string;
  factType: string;
  payloadJson: string;
  observedAt: string;
}

// Smoke fixture record shapes (synthetic data for integration tests)

export interface SmokeContextRecord {
  contextId: string;
  scopeId: string;
  primaryCharter: string;
}

export interface SmokeWorkItemRecord {
  workItemId: string;
  contextId: string;
  scopeId: string;
  status: string;
}

export interface SmokeEvaluationRecord {
  evaluationId: string;
  workItemId: string;
  scopeId: string;
  charterId: string;
  outcome: string;
  summary: string;
}

export interface SmokeDecisionRecord {
  decisionId: string;
  contextId: string;
  scopeId: string;
  approvedAction: string;
  outboundId: string | null;
}

export interface SmokeOutboundCommandRecord {
  outboundId: string;
  contextId: string;
  scopeId: string;
  actionType: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Operator mutation surface (Task 355)
// ---------------------------------------------------------------------------

/** Bounded operator actions supported by the Cloudflare Site v0 runtime. */
export type SiteOperatorActionType = "approve" | "reject" | "retry" | "cancel";

/** Canonical operator action request record for audit. */
export interface SiteOperatorActionRequest {
  request_id: string;
  scope_id: string;
  action_type: SiteOperatorActionType;
  target_id: string;
  target_kind: "work_item" | "outbound_command";
  payload_json: string | null;
  status: "pending" | "executed" | "rejected";
  requested_by: string;
  requested_at: string;
  executed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

/** Result of executing a site operator action. */
export interface SiteOperatorActionResult {
  success: boolean;
  request_id: string;
  status: "executed" | "rejected";
  reason?: string;
}

// ---------------------------------------------------------------------------
// Effect worker execution attempts (Task 359)
// ---------------------------------------------------------------------------

/** Durable record of an effect execution attempt. */
export interface ExecutionAttemptRecord {
  executionAttemptId: string;
  outboundId: string;
  actionType: string;
  attemptedAt: string;
  status: "attempting" | "submitted" | "failed_retryable" | "failed_terminal";
  errorCode: string | null;
  errorMessage: string | null;
  responseJson: string | null;
  externalRef: string | null;
  workerId: string | null;
  leaseExpiresAt: string | null;
  finishedAt: string | null;
}

/** Result of running the approved-only effect worker. */
export interface EffectWorkerResult {
  attempted: number;
  submitted: number;
  failedRetryable: number;
  failedTerminal: number;
  skipped: number;
  residuals: string[];
}
