import type { ScopeConfig } from "@narada2/control-plane";

export function renderScopeInspect(scope: ScopeConfig): string {
  return [
    `operation: ${scope.scope_id}`,
    `context_strategy: ${scope.context_strategy}`,
    `root_dir: ${scope.root_dir}`,
    `primary_charter: ${scope.policy.primary_charter}`,
    `secondary_charters: ${(scope.policy.secondary_charters ?? []).join(", ") || "(none)"}`,
    `allowed_actions: ${scope.policy.allowed_actions.join(", ")}`,
    `allowed_tools: ${(scope.policy.allowed_tools ?? []).join(", ") || "(none)"}`,
    `require_human_approval: ${String(scope.policy.require_human_approval ?? false)}`,
  ].join("\n");
}
