/**
 * Unified Executor Lifecycle Model
 *
 * All executor families (mail, process, and future families) must be
 * describable through the same kernel lifecycle.
 *
 * Lifecycle: pending → running → (completed | failed)
 * Confirmation: unconfirmed → confirmed (or confirmation_failed)
 *
 * Invariants:
 * - Execution phase transitions are explicit and validated.
 * - Confirmation is a distinct durable step from execution completion.
 * - Process execution treats exit_code as immediate confirmation.
 * - Mail execution separates submission (completed) from Graph API confirmation.
 */

export type ExecutionPhase = "pending" | "running" | "completed" | "failed";

export type ConfirmationStatus =
  | "unconfirmed"
  | "confirmed"
  | "confirmation_failed";

/** Unified execution lifecycle view */
export interface ExecutionLifecycle {
  execution_id: string;
  intent_id: string;
  executor_family: string;
  phase: ExecutionPhase;
  confirmation_status: ConfirmationStatus;
  started_at: string | null;
  completed_at: string | null;
  confirmed_at: string | null;
  error_message: string | null;
  artifact_id: string | null;
}

export const VALID_PHASE_TRANSITIONS: Readonly<
  Record<ExecutionPhase, readonly ExecutionPhase[]>
> = {
  pending: ["running", "completed", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function isValidPhaseTransition(
  from: ExecutionPhase,
  to: ExecutionPhase,
): boolean {
  return VALID_PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalPhase(phase: ExecutionPhase): boolean {
  return phase === "completed" || phase === "failed";
}

export function canConfirm(status: ConfirmationStatus): boolean {
  return status === "unconfirmed";
}

/**
 * Map an outbound command status to the unified execution phase.
 */
export function mapOutboundStatusToPhase(status: string): ExecutionPhase {
  switch (status) {
    case "pending":
    case "draft_creating":
    case "draft_ready":
    case "sending":
    case "retry_wait":
    case "blocked_policy":
      return "running";
    case "submitted":
    case "confirmed":
      return "completed";
    case "failed_terminal":
    case "cancelled":
    case "superseded":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * Map an outbound command status to the unified confirmation status.
 */
export function mapOutboundStatusToConfirmation(
  status: string,
): ConfirmationStatus {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "failed_terminal":
    case "cancelled":
    case "superseded":
      return "confirmation_failed";
    default:
      return "unconfirmed";
  }
}

/**
 * Determine the appropriate confirmation transition when an execution completes.
 */
export function deriveConfirmationOnComplete(
  success: boolean,
): ConfirmationStatus {
  return success ? "confirmed" : "confirmation_failed";
}

/**
 * Assert that a phase transition is legal; throw if not.
 */
export function assertValidPhaseTransition(
  executionId: string,
  from: ExecutionPhase,
  to: ExecutionPhase,
): void {
  if (!isValidPhaseTransition(from, to)) {
    throw new Error(
      `Invalid execution phase transition: ${from} -> ${to} for ${executionId}`,
    );
  }
}
