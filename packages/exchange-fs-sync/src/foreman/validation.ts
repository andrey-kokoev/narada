/**
 * Foreman Evaluation Validation
 *
 * Implements the 10 validation rules from the charter invocation v2 spec.
 *
 * Spec: .ai/tasks/20260414-006-assignment-agent-b-charter-invocation-v2.md
 */

import type {
  CharterOutputEnvelope,
  CharterInvocationEnvelope,
  ProposedAction,
} from "./types.js";

export interface ValidationResult {
  valid: boolean;
  stripped_actions?: ProposedAction[];
  stripped_tool_requests?: { tool_id: string; reason: string }[];
  corrected_outcome?: CharterOutputEnvelope["outcome"];
  errors: string[];
}

/**
 * Validate a charter output envelope against its invocation envelope.
 */
export function validateCharterOutput(
  output: CharterOutputEnvelope,
  invocation: CharterInvocationEnvelope,
): ValidationResult {
  const errors: string[] = [];
  let strippedActions: ProposedAction[] | undefined;
  let strippedToolRequests: { tool_id: string; reason: string }[] | undefined;
  let correctedOutcome: CharterOutputEnvelope["outcome"] | undefined;

  // Rule 1: Execution identity match
  if (output.execution_id !== invocation.execution_id) {
    errors.push(
      `Rule 1: execution_id mismatch (output=${output.execution_id}, invocation=${invocation.execution_id})`,
    );
  }

  // Rule 2: Charter identity match
  if (output.charter_id !== invocation.charter_id) {
    errors.push(
      `Rule 2: charter_id mismatch (output=${output.charter_id}, invocation=${invocation.charter_id})`,
    );
  }
  if (output.role !== invocation.role) {
    errors.push(`Rule 2: role mismatch (output=${output.role}, invocation=${invocation.role})`);
  }

  // Rule 3: Output version
  if (output.output_version !== "2.0") {
    errors.push(`Rule 3: unrecognized output_version "${output.output_version}"`);
  }

  // Rule 4: Action bounding
  const allowedActions = new Set(invocation.allowed_actions);
  const validActions: ProposedAction[] = [];
  const invalidActions: ProposedAction[] = [];
  for (const action of output.proposed_actions) {
    if (allowedActions.has(action.action_type)) {
      validActions.push(action);
    } else {
      invalidActions.push(action);
    }
  }
  if (invalidActions.length > 0) {
    strippedActions = invalidActions;
    errors.push(
      `Rule 4: proposed action(s) not in allowed_actions: ${invalidActions.map((a) => a.action_type).join(", ")}`,
    );
  }

  // Rule 5: Tool bounding
  const availableToolIds = new Set(invocation.available_tools.map((t) => t.tool_id));
  const validToolRequests: typeof output.tool_requests = [];
  const invalidToolRequests: { tool_id: string; reason: string }[] = [];
  for (const req of output.tool_requests) {
    if (availableToolIds.has(req.tool_id)) {
      validToolRequests.push(req);
    } else {
      invalidToolRequests.push({ tool_id: req.tool_id, reason: "tool not in available_tools" });
    }
  }
  if (invalidToolRequests.length > 0) {
    strippedToolRequests = invalidToolRequests;
    errors.push(
      `Rule 5: tool request(s) not in available_tools: ${invalidToolRequests.map((r) => r.tool_id).join(", ")}`,
    );
  }

  // Rule 6: Payload parsability
  const unparseableActions: ProposedAction[] = [];
  for (const action of validActions) {
    try {
      JSON.parse(action.payload_json);
    } catch {
      unparseableActions.push(action);
    }
  }
  if (unparseableActions.length > 0) {
    const remainingValid = validActions.filter(
      (a) => !unparseableActions.some((u) => u === a),
    );
    for (const a of unparseableActions) {
      if (!strippedActions) strippedActions = [];
      if (!strippedActions.includes(a)) strippedActions.push(a);
    }
    errors.push(
      `Rule 6: unparseable payload_json for action(s): ${unparseableActions.map((a) => a.action_type).join(", ")}`,
    );
    // Replace validActions with remaining valid ones for downstream checks
    validActions.length = 0;
    validActions.push(...remainingValid);
  }

  // Rule 7: Escalation precedence (informational; caller decides short-circuit)
  const hasHighUrgencyEscalation = output.escalations.some((e) => e.urgency === "high");
  if (hasHighUrgencyEscalation) {
    errors.push("Rule 7: high-urgency escalation detected");
  }

  // Rule 8: Confidence floor
  if (output.confidence.overall === "low" && output.outcome !== "escalation") {
    // Caller may downgrade recommended_action_class; we flag it here.
    errors.push("Rule 8: low confidence without escalation outcome");
  }

  // Rule 9: Primary charter ownership (informational; full arbitration is caller-side)
  if (invocation.role === "secondary" && validActions.some((a) => a.authority === "recommended")) {
    errors.push("Rule 9: secondary charter asserted recommended authority");
  }

  // Rule 10: No-op completeness
  if (output.outcome === "no_op") {
    if (validActions.length > 0 || output.escalations.length > 0) {
      correctedOutcome = validActions.length > 0 ? "complete" : "escalation";
      errors.push(
        `Rule 10: no_op outcome incompatible with ${validActions.length} actions and ${output.escalations.length} escalations; corrected to ${correctedOutcome}`,
      );
    }
  }

  // If all originally proposed actions were stripped and outcome wasn't no_op/escalation, treat as no_op.
  const finalOutcome = correctedOutcome ?? output.outcome;
  if (
    finalOutcome === "complete" &&
    output.proposed_actions.length > 0 &&
    validActions.length === 0 &&
    output.escalations.length === 0
  ) {
    correctedOutcome = "no_op";
    errors.push("Rule 10/4: all actions stripped and no escalations; corrected outcome to no_op");
  }

  const fatal =
    output.execution_id !== invocation.execution_id ||
    output.charter_id !== invocation.charter_id ||
    output.output_version !== "2.0";

  return {
    valid: !fatal && errors.length === 0,
    stripped_actions: strippedActions,
    stripped_tool_requests: strippedToolRequests,
    corrected_outcome: correctedOutcome,
    errors,
  };
}

/**
 * Arbitration between primary and secondary charter outputs.
 * Returns the winning evaluation or undefined if they conflict unresolved.
 *
 * V1 simplified arbitration: primary wins unless secondary has an escalation
 * and primary does not.
 */
export function arbitrateEvaluations(
  primary: { evaluation_id: string; proposed_actions: ProposedAction[]; escalations: { urgency: string }[] } | undefined,
  secondary: { evaluation_id: string; proposed_actions: ProposedAction[]; escalations: { urgency: string }[] } | undefined,
): { winner: "primary" | "secondary" | "conflict"; reason: string } {
  if (!primary && !secondary) {
    return { winner: "conflict", reason: "No evaluations to arbitrate" };
  }
  if (primary && !secondary) {
    return { winner: "primary", reason: "Only primary evaluation present" };
  }
  if (!primary && secondary) {
    return { winner: "secondary", reason: "Only secondary evaluation present" };
  }

  const primaryHasHighEscalation = primary!.escalations.some((e) => e.urgency === "high");
  const secondaryHasHighEscalation = secondary!.escalations.some((e) => e.urgency === "high");

  if (secondaryHasHighEscalation && !primaryHasHighEscalation) {
    return { winner: "secondary", reason: "Secondary raised high-urgency escalation" };
  }

  return { winner: "primary", reason: "Primary charter prevails by default" };
}
