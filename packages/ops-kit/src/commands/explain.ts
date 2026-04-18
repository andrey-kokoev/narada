import { inspect } from "./inspect.js";
import { preflight } from "./preflight.js";
import type { ReadinessReport } from "../readiness/types.js";
import { detectPosturePreset } from "../intents/posture.js";
import type { PostureVertical } from "../intents/posture.js";

export interface ExplainOptions {
  configPath?: string;
}

export interface ExplainResult {
  target: string;
  readiness: ReadinessReport;
  inspection?: string;
  operationalConsequences: string[];
  blockers: string[];
  whyNoAction: string;
}

export function explain(target: string, options: ExplainOptions): ExplainResult {
  const readiness = preflight(target, options);
  const inspected = inspect(target, options);
  const blockers = readiness.checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.name}: ${check.detail}`);

  const operationalConsequences: string[] = [];
  const scope = inspected.scope;
  if (scope) {
    const actions = scope.policy.allowed_actions;
    const detected = detectPosturePreset(actions, scope.context_strategy as PostureVertical);
    if (detected) {
      operationalConsequences.push(`Posture: ${detected}.`);
    } else {
      operationalConsequences.push("Posture: custom (actions do not match a canonical preset).");
    }

    operationalConsequences.push(`Primary charter: ${scope.policy.primary_charter}.`);
    if (scope.policy.secondary_charters?.length) {
      operationalConsequences.push(`Secondary charters: ${scope.policy.secondary_charters.join(", ")}.`);
    }

    if (actions.includes("draft_reply")) operationalConsequences.push("Narada may draft replies to incoming messages.");
    if (actions.includes("send_reply") || actions.includes("send_new_message")) operationalConsequences.push("Narada may send outbound messages without further gate.");
    if (actions.includes("tool_request")) operationalConsequences.push("Narada may invoke bound tools (e.g., database checks, lookups).");
    if (actions.includes("process_run")) operationalConsequences.push("Narada may run local processes.");
    if (scope.policy.require_human_approval) {
      operationalConsequences.push("Human approval is required before any gated action executes.");
    } else {
      operationalConsequences.push("No human approval gate is configured. Narada may act autonomously within allowed actions.");
    }
  }

  const activationCheck = readiness.checks.find((c) => c.category === "activation");
  const isActivated = activationCheck?.status === "pass";

  const whyNoAction = blockers.length > 0
    ? `Not ready: ${blockers.length} blocker(s).`
    : readiness.status === "warn"
      ? `Partially ready: ${readiness.nextActions.length} warning(s) remain. Activate when satisfied.`
      : isActivated
        ? "Ready and activated. Narada will process this operation when the daemon runs."
        : "Ready but not yet activated. Run `narada activate` when you want to go live.";

  return {
    target,
    readiness,
    inspection: inspected.scope ? inspected.summary : undefined,
    operationalConsequences,
    blockers,
    whyNoAction,
  };
}
