import { inspect } from "./inspect.js";
import { preflight } from "./preflight.js";
import type { ReadinessReport } from "../readiness/types.js";

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
    if (actions.includes("draft_reply")) operationalConsequences.push("Narada may draft replies.");
    if (actions.includes("send_reply") || actions.includes("send_new_message")) operationalConsequences.push("Narada may send outbound messages.");
    if (actions.includes("tool_request")) operationalConsequences.push("Narada may invoke bound tools.");
    if (actions.includes("process_run")) operationalConsequences.push("Narada may run local processes.");
    if (scope.policy.require_human_approval) operationalConsequences.push("Human approval is required for gated actions.");
  }

  const whyNoAction = blockers.length > 0
    ? `Not ready: ${blockers.length} blocker(s).`
    : readiness.status === "warn"
      ? "Partially ready: warnings remain."
      : "Ready: target is shaped and passes preflight.";

  return {
    target,
    readiness,
    inspection: inspected.scope ? inspected.summary : undefined,
    operationalConsequences,
    blockers,
    whyNoAction,
  };
}
