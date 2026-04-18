/**
 * Posture presets map user-facing safety levels to concrete `AllowedAction[]` sets.
 *
 * A posture is a named policy bundle. It does not invent new actions;
 * it selects from the existing `AllowedAction` universe.
 *
 * One coherent progression is used across all verticals:
 *   observe-only → draft-only → review-required → autonomous
 */

import type { AllowedAction } from "@narada2/control-plane";

export type PosturePreset =
  | "observe-only"
  | "draft-only"
  | "review-required"
  | "autonomous";

/** Verticals that support posture presets. */
export type PostureVertical = "mail" | "timer" | "filesystem" | "webhook";

/** Mailbox posture actions. */
export const MAILBOX_POSTURE_ACTIONS: Record<PosturePreset, AllowedAction[]> = {
  "observe-only": [
    "no_action",
    "tool_request",
    "extract_obligations",
  ],
  "draft-only": [
    "draft_reply",
    "mark_read",
    "no_action",
    "tool_request",
    "extract_obligations",
    "create_followup",
  ],
  "review-required": [
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
  "autonomous": [
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
};

/** Workflow posture actions. */
export const WORKFLOW_POSTURE_ACTIONS: Record<PosturePreset, AllowedAction[]> = {
  "observe-only": [
    "no_action",
    "tool_request",
    "extract_obligations",
  ],
  "draft-only": [
    "no_action",
    "tool_request",
    "extract_obligations",
    "create_followup",
  ],
  "review-required": [
    "no_action",
    "tool_request",
    "process_run",
    "extract_obligations",
    "create_followup",
  ],
  "autonomous": [
    "no_action",
    "tool_request",
    "process_run",
    "extract_obligations",
    "create_followup",
  ],
};

/** Unified lookup for backward-compatible exports.
 *  Prefer `resolvePostureActions(preset, vertical)` for new code. */
export const POSTURE_ACTIONS: Record<PosturePreset, AllowedAction[]> = {
  ...MAILBOX_POSTURE_ACTIONS,
};

/** Human-readable description of each preset. */
export const POSTURE_DESCRIPTIONS: Record<PosturePreset, string> = {
  "observe-only":
    "Narada may observe and run read-only tools. No effects.",
  "draft-only":
    "Narada may draft replies and run read-only tools, but must not send or execute irreversible actions.",
  "review-required":
    "Narada may perform external actions (send, execute), but requires explicit human approval for each one.",
  "autonomous":
    "Narada may perform all allowed actions without human gate. Use with caution.",
};

/** Resolve a preset name to its allowed actions for a given vertical. */
export function resolvePostureActions(
  preset: PosturePreset,
  vertical: PostureVertical
): AllowedAction[] {
  const map =
    vertical === "mail"
      ? MAILBOX_POSTURE_ACTIONS
      : WORKFLOW_POSTURE_ACTIONS;
  const actions = map[preset];
  if (!actions) {
    throw new Error(`Unknown posture preset: ${preset}`);
  }
  return [...actions];
}

/** Detect the canonical preset name for a given action set and vertical.
 *  Returns `null` if the actions do not exactly match a canonical preset. */
export function detectPosturePreset(
  actions: AllowedAction[],
  vertical: PostureVertical
): PosturePreset | null {
  const map =
    vertical === "mail"
      ? MAILBOX_POSTURE_ACTIONS
      : WORKFLOW_POSTURE_ACTIONS;
  const sorted = [...actions].sort();
  for (const [preset, presetActions] of Object.entries(map)) {
    const sortedPreset = [...presetActions].sort();
    if (
      sortedPreset.length === sorted.length &&
      sortedPreset.every((a, i) => a === sorted[i])
    ) {
      return preset as PosturePreset;
    }
  }
  return null;
}

/** List all valid preset names. */
export function listPosturePresets(): PosturePreset[] {
  return ["observe-only", "draft-only", "review-required", "autonomous"];
}
