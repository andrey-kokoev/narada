/**
 * Safe Operator Action Execution
 *
 * Re-exports the canonical executor from @narada2/control-plane so that
 * the daemon's observation layer uses the same path as the CLI.
 *
 * All UI-facing mutations are validated, executed, and logged through
 * executeOperatorAction(). The observability layer remains read-only.
 *
 * Authority boundary (Task 073):
 * - This is the ONLY permitted write path from the operator console.
 * - Actions cannot bypass the intent boundary (no direct intent inserts).
 * - Actions cannot bypass scheduler/foreman authority (no direct work_item creation,
 *   no lease manipulation, no foreman decision injection).
 * - Every action is logged to operator_action_requests for audit.
 */

export {
  PERMITTED_OPERATOR_ACTIONS,
  executeOperatorAction,
  type OperatorActionType,
  type OperatorActionPayload,
  type OperatorActionResult,
  type OperatorActionContext,
} from "@narada2/control-plane";
