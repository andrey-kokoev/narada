import { ensureConfig, findScope, upsertScope, writeConfig } from "../lib/config-io.js";
import { POSTURE_DESCRIPTIONS, resolvePostureActions } from "../intents/posture.js";
import type { PosturePreset, PostureVertical } from "../intents/posture.js";

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
  return preset !== "autonomous";
}

function toPostureVertical(strategy: string): PostureVertical {
  if (strategy === "mail" || strategy === "timer" || strategy === "filesystem" || strategy === "webhook") {
    return strategy;
  }
  throw new Error(`Unsupported context strategy for posture: ${strategy}`);
}

export function wantPosture(target: string, preset: PosturePreset, options: WantPostureOptions): PostureResult {
  const config = ensureConfig(options.configPath);
  const scope = findScope(config, target);
  if (!scope) throw new Error(`Target not found: ${target}`);
  const previousActions = [...scope.policy.allowed_actions];
  const vertical = toPostureVertical(scope.context_strategy);
  const newActions = resolvePostureActions(preset, vertical);
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
