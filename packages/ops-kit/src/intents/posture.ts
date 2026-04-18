/**
 * Posture presets map user-facing safety levels to concrete `AllowedAction[]` sets.
 *
 * A posture is a named policy bundle. It does not invent new actions;
 * it selects from the existing `AllowedAction` universe.
 */

import type { AllowedAction } from "@narada2/exchange-fs-sync";

/** Mailbox-specific posture presets. */
export type MailboxPosturePreset =
  | "draft-only"
  | "draft-and-review"
  | "send-allowed";

/** Workflow-specific posture presets. */
export type WorkflowPosturePreset =
  | "observe-only"
  | "draft-alert"
  | "act-with-approval";

/** Any posture preset name. */
export type PosturePreset = MailboxPosturePreset | WorkflowPosturePreset;

/** Mapping from preset name to allowed actions. */
export const POSTURE_ACTIONS: Record<PosturePreset, AllowedAction[]> = {
  // Mailbox postures
  "draft-only": ["draft_reply", "mark_read", "no_action", "tool_request"],
  "draft-and-review": [
    "draft_reply",
    "send_new_message",
    "mark_read",
    "no_action",
    "tool_request",
    "extract_obligations",
  ],
  "send-allowed": [
    "draft_reply",
    "send_reply",
    "send_new_message",
    "mark_read",
    "move_message",
    "set_categories",
    "no_action",
    "tool_request",
    "extract_obligations",
    "create_followup",
  ],
  // Workflow postures
  "observe-only": ["no_action", "tool_request"],
  "draft-alert": ["no_action", "tool_request", "extract_obligations"],
  "act-with-approval": [
    "no_action",
    "tool_request",
    "process_run",
    "extract_obligations",
  ],
};

/** Human-readable description of each preset. */
export const POSTURE_DESCRIPTIONS: Record<PosturePreset, string> = {
  "draft-only":
    "Narada may draft replies and run read-only tools, but must not send anything.",
  "draft-and-review":
    "Narada may draft replies, draft new messages, and extract obligations. Sending requires manual review.",
  "send-allowed":
    "Narada may draft, send, move, categorize, and create follow-ups without human gate.",
  "observe-only":
    "Narada may observe and run read-only tools. No effects.",
  "draft-alert":
    "Narada may observe, run tools, and extract obligations. Alerts may be drafted but not sent automatically.",
  "act-with-approval":
    "Narada may run tools and process tasks. Requires explicit approval for irreversible actions.",
};

/** Resolve a preset name to its allowed actions. */
export function resolvePostureActions(preset: PosturePreset): AllowedAction[] {
  const actions = POSTURE_ACTIONS[preset];
  if (!actions) {
    throw new Error(`Unknown posture preset: ${preset}`);
  }
  return [...actions];
}

/** List all valid preset names. */
export function listPosturePresets(): PosturePreset[] {
  return Object.keys(POSTURE_ACTIONS) as PosturePreset[];
}
