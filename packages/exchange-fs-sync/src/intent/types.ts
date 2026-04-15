/**
 * Intent Types
 *
 * Domain-neutral durable effect boundary.
 *
 * All side effects must pass through Intent admission.
 * Mailbox effects are represented as one executor family among many.
 */

export type IntentType =
  | "mail.send_reply"
  | "mail.send_new_message"
  | "mail.mark_read"
  | "mail.move_message"
  | "mail.draft_reply"
  | "mail.set_categories"
  | "process.run";

export type IntentStatus =
  | "admitted"
  | "ready"
  | "executing"
  | "completed"
  | "failed_terminal"
  | "cancelled";

/** Canonical durable intent */
export interface Intent {
  intent_id: string;
  intent_type: IntentType;
  executor_family: string;
  payload_json: string;
  idempotency_key: string;
  status: IntentStatus;
  created_at: string;
  updated_at: string;
  context_id: string;
  target_id: string | null;
  terminal_reason: string | null;
}

/** Maps an action type to an executor family */
export function toExecutorFamily(actionType: string): string {
  if (actionType === "process_run") {
    return "process";
  }
  return "mail";
}

/** Maps an action type to a namespaced intent type */
export function toIntentType(actionType: string): IntentType {
  switch (actionType) {
    case "send_reply":
      return "mail.send_reply";
    case "send_new_message":
      return "mail.send_new_message";
    case "mark_read":
      return "mail.mark_read";
    case "move_message":
      return "mail.move_message";
    case "draft_reply":
      return "mail.draft_reply";
    case "set_categories":
      return "mail.set_categories";
    case "process_run":
      return "process.run";
    default:
      throw new Error(`Cannot map unknown action type to intent: ${actionType}`);
  }
}
