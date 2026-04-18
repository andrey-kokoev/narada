/**
 * Build `ScopeConfig` objects from user intents.
 */

import type { AllowedAction, ScopeConfig } from "@narada2/control-plane";
import type { PosturePreset } from "../intents/posture.js";
import { resolvePostureActions } from "../intents/posture.js";

const DEFAULT_MAIL_FOLDERS = ["inbox"];
const DEFAULT_POLLING_MS = 60_000;

/** Build a mailbox ScopeConfig. */
export function buildMailboxScope(opts: {
  scopeId: string;
  graphUserId: string;
  dataRootDir: string;
  folders?: string[];
  primaryCharter?: string;
  secondaryCharters?: string[];
  posture?: PosturePreset;
  allowedActions?: AllowedAction[];
}): ScopeConfig {
  const allowedActions =
    opts.allowedActions ?? resolvePostureActions(opts.posture ?? "draft-only", "mail");

  return {
    scope_id: opts.scopeId,
    root_dir: opts.dataRootDir,
    sources: [{ type: "graph", user_id: opts.graphUserId }],
    context_strategy: "mail",
    scope: {
      included_container_refs: opts.folders ?? DEFAULT_MAIL_FOLDERS,
      included_item_kinds: ["message"],
    },
    normalize: {
      attachment_policy: "metadata_only",
      body_policy: "text_only",
      include_headers: false,
      tombstones_enabled: true,
    },
    runtime: {
      polling_interval_ms: DEFAULT_POLLING_MS,
      acquire_lock_timeout_ms: 30_000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
    },
    policy: {
      primary_charter: opts.primaryCharter ?? "support_steward",
      secondary_charters: opts.secondaryCharters,
      allowed_actions: allowedActions,
      require_human_approval: true,
    },
  };
}

/** Build a timer workflow ScopeConfig. */
export function buildWorkflowScope(opts: {
  scopeId: string;
  workflowId: string;
  schedule: string;
  dataRootDir: string;
  primaryCharter?: string;
  posture?: PosturePreset;
  allowedActions?: AllowedAction[];
}): ScopeConfig {
  const allowedActions =
    opts.allowedActions ?? resolvePostureActions(opts.posture ?? "observe-only", "timer");

  return {
    scope_id: opts.scopeId,
    root_dir: opts.dataRootDir,
    sources: [{ type: "timer", schedule: opts.schedule } as any],
    context_strategy: "timer",
    scope: {
      included_container_refs: ["timer"],
      included_item_kinds: ["timer_event"],
    },
    normalize: {
      attachment_policy: "exclude",
      body_policy: "text_only",
      include_headers: false,
      tombstones_enabled: false,
    },
    runtime: {
      polling_interval_ms: DEFAULT_POLLING_MS,
      acquire_lock_timeout_ms: 30_000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
    },
    policy: {
      primary_charter: opts.primaryCharter ?? "support_steward",
      allowed_actions: allowedActions,
    },
  };
}
