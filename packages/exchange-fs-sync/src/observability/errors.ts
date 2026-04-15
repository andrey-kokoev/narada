/**
 * Operator-facing error taxonomy.
 *
 * These categories are derived from durable state and are used for
 * dashboards, alerts, and human triage. They must never be required
 * for system correctness.
 */

import { ExchangeFSSyncError, ErrorCode } from "../errors.js";

export enum OperatorErrorCategory {
  /** Configuration or environment problem detected at runtime */
  RUNTIME_MISCONFIG = "runtime_misconfig",

  /** Tool invocation rejected by local policy (not external API) */
  TOOL_POLICY_REJECTION = "tool_policy_rejection",

  /** Tool invocation exceeded its timeout */
  TOOL_TIMEOUT = "tool_timeout",

  /** Charter output failed validation or governance arbitration */
  CHARTER_VALIDATION_FAILURE = "charter_validation_failure",

  /** Outbound handoff encountered an idempotency conflict */
  OUTBOUND_IDEMPOTENCY_CONFLICT = "outbound_idempotency_conflict",

  /** Replay or recovery scanner took corrective action */
  REPLAY_RECOVERY_ACTION = "replay_recovery_action",

  /** Network or external API error (operator may need to check connectivity) */
  EXTERNAL_DEPENDENCY = "external_dependency",

  /** Storage or filesystem error */
  STORAGE_FAILURE = "storage_failure",

  /** Catch-all for uncategorized errors */
  UNKNOWN = "unknown",
}

export interface OperatorErrorClassification {
  category: OperatorErrorCategory;
  phase: string;
  message: string;
  recoverable: boolean;
}

/**
 * Classify an arbitrary error into an operator-facing category.
 *
 * @param error - The error to classify
 * @param phase - The system phase where the error occurred (e.g., "dispatch", "tool_execution")
 * @param durableHint - Optional durable-state hint (e.g., tool_call exit_status, work_item status)
 */
export function classifyErrorToOperatorCategory(
  error: unknown,
  phase: string,
  durableHint?: { toolExitStatus?: string; workItemStatus?: string; outboundStatus?: string },
): OperatorErrorClassification {
  const message = error instanceof Error ? error.message : String(error);
  let recoverable = true;

  // 1. Durable-state hints take precedence (derived truth)
  if (durableHint?.toolExitStatus === "rejected_policy") {
    return { category: OperatorErrorCategory.TOOL_POLICY_REJECTION, phase, message, recoverable: false };
  }
  if (durableHint?.toolExitStatus === "timeout") {
    return { category: OperatorErrorCategory.TOOL_TIMEOUT, phase, message, recoverable: true };
  }
  if (durableHint?.workItemStatus === "failed_terminal") {
    return { category: OperatorErrorCategory.REPLAY_RECOVERY_ACTION, phase, message, recoverable: false };
  }
  if (durableHint?.outboundStatus === "blocked_policy") {
    return { category: OperatorErrorCategory.OUTBOUND_IDEMPOTENCY_CONFLICT, phase, message, recoverable: true };
  }

  // 2. Typed errors
  if (error instanceof ExchangeFSSyncError) {
    recoverable = error.recoverable;
    const code = error.code;

    switch (code) {
      case ErrorCode.GRAPH_RATE_LIMIT:
      case ErrorCode.GRAPH_SERVER_ERROR:
      case ErrorCode.GRAPH_NETWORK_ERROR:
        return { category: OperatorErrorCategory.EXTERNAL_DEPENDENCY, phase, message: error.message, recoverable };

      case ErrorCode.GRAPH_AUTH_FAILED:
        return { category: OperatorErrorCategory.RUNTIME_MISCONFIG, phase, message: error.message, recoverable: false };

      case ErrorCode.STORAGE_WRITE_FAILED:
      case ErrorCode.STORAGE_READ_FAILED:
      case ErrorCode.STORAGE_DISK_FULL:
      case ErrorCode.CURSOR_CORRUPTED:
        return { category: OperatorErrorCategory.STORAGE_FAILURE, phase, message: error.message, recoverable };

      case ErrorCode.SYNC_PHASE_FAILED:
      case ErrorCode.LOCK_ACQUIRE_FAILED:
        return { category: OperatorErrorCategory.EXTERNAL_DEPENDENCY, phase, message: error.message, recoverable };

      default:
        return { category: OperatorErrorCategory.UNKNOWN, phase, message: error.message, recoverable };
    }
  }

  // 3. Message heuristics for untyped errors
  const lower = message.toLowerCase();
  if (lower.includes("config") || lower.includes("misconfig") || lower.includes("api key") || lower.includes("missing")) {
    return { category: OperatorErrorCategory.RUNTIME_MISCONFIG, phase, message, recoverable: false };
  }
  if (lower.includes("timeout")) {
    return { category: OperatorErrorCategory.TOOL_TIMEOUT, phase, message, recoverable: true };
  }
  if (lower.includes("idempotency") || lower.includes("unique constraint")) {
    return { category: OperatorErrorCategory.OUTBOUND_IDEMPOTENCY_CONFLICT, phase, message, recoverable: true };
  }
  if (lower.includes("validation") || lower.includes("governance") || lower.includes("arbitrat")) {
    return { category: OperatorErrorCategory.CHARTER_VALIDATION_FAILURE, phase, message, recoverable: false };
  }
  if (lower.includes("replay") || lower.includes("recovery")) {
    return { category: OperatorErrorCategory.REPLAY_RECOVERY_ACTION, phase, message, recoverable: true };
  }
  if (lower.includes("enoent") || lower.includes("enosp") || lower.includes("disk full")) {
    return { category: OperatorErrorCategory.STORAGE_FAILURE, phase, message, recoverable: false };
  }

  return { category: OperatorErrorCategory.UNKNOWN, phase, message, recoverable };
}

/**
 * Derive an operator category directly from a work_item durable row.
 */
export function classifyWorkItemForOperator(
  status: string,
  errorMessage: string | null,
  _retryCount?: number,
): OperatorErrorCategory | null {
  if (status === "resolved" || status === "opened" || status === "leased" || status === "executing") {
    return null;
  }
  if (status === "superseded" || status === "cancelled") {
    return OperatorErrorCategory.REPLAY_RECOVERY_ACTION;
  }
  if (status === "failed_retryable" || status === "failed_terminal") {
    if (errorMessage) {
      const lower = errorMessage.toLowerCase();
      if (lower.includes("tool") && lower.includes("policy")) return OperatorErrorCategory.TOOL_POLICY_REJECTION;
      if (lower.includes("timeout")) return OperatorErrorCategory.TOOL_TIMEOUT;
      if (lower.includes("validation")) return OperatorErrorCategory.CHARTER_VALIDATION_FAILURE;
      if (lower.includes("idempotency")) return OperatorErrorCategory.OUTBOUND_IDEMPOTENCY_CONFLICT;
      if (lower.includes("config")) return OperatorErrorCategory.RUNTIME_MISCONFIG;
    }
    return OperatorErrorCategory.UNKNOWN;
  }
  return null;
}

/**
 * Derive an operator category directly from a tool_call_record durable row.
 */
export function classifyToolCallForOperator(exitStatus: string): OperatorErrorCategory | null {
  switch (exitStatus) {
    case "rejected_policy":
      return OperatorErrorCategory.TOOL_POLICY_REJECTION;
    case "timeout":
      return OperatorErrorCategory.TOOL_TIMEOUT;
    case "error":
    case "budget_exceeded":
      return OperatorErrorCategory.UNKNOWN;
    case "pending":
    case "success":
    default:
      return null;
  }
}
