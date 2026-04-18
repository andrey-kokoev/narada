import { ensureConfig, findScope, upsertScope, writeConfig } from "../lib/config-io.js";
import { POSTURE_DESCRIPTIONS, resolvePostureActions } from "../intents/posture.js";
import type { PosturePreset } from "../intents/posture.js";

export interface WantPostureOptions {
  configPath?: string;
}

export interface PostureResult {
  target: string;
  preset: PosturePreset;
  previousActions: string[];
  newActions: string[];
  description: string;
}

function requireHumanApprovalForPreset(preset: PosturePreset): boolean {
  return preset !== "send-allowed" && preset !== "act-with-approval" ? true : preset === "act-with-approval";
}

export function wantPosture(target: string, preset: PosturePreset, options: WantPostureOptions): PostureResult {
  const config = ensureConfig(options.configPath);
  const scope = findScope(config, target);
  if (!scope) throw new Error(`Target not found: ${target}`);
  const previousActions = [...scope.policy.allowed_actions];
  const newActions = resolvePostureActions(preset);
  scope.policy.allowed_actions = newActions;
  scope.policy.require_human_approval = requireHumanApprovalForPreset(preset);
  upsertScope(config, scope);
  writeConfig(config, options.configPath);
  return {
    target,
    preset,
    previousActions,
    newActions,
    description: POSTURE_DESCRIPTIONS[preset],
  };
}
