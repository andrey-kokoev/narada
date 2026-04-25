/**
 * Foreman Action Governance
 *
 * Semantic safety layer between charter output and outbound effects.
 *
 * Spec: .ai/do-not-open/tasks/20260415-030-foreman-arbitration-and-action-governance.md
 */

import type {
  AllowedAction,
  EvaluationEnvelope,
  ProposedAction,
  CharterOutputEnvelope,
  ToolInvocationRequest,
} from "./types.js";
import type { RuntimePolicy } from "../config/types.js";

export type ArbitrationOutcome =
  | "accept"
  | "reject"
  | "escalate"
  | "no_op"
  | "clarification_needed"
  | "conflict_unresolved";

export interface ActionGovernanceResult {
  allowed: boolean;
  reason: string;
  requires_approval: boolean;
  confidence_sufficient: boolean;
  payload_valid: boolean;
  payload_errors: string[];
}

export interface ToolGovernanceResult {
  allowed: boolean;
  reason: string;
  requires_approval: boolean;
}

export interface GovernEvaluationResult {
  outcome: ArbitrationOutcome;
  governed_action?: ProposedAction;
  reason: string;
  approval_required: boolean;
  governance_errors: string[];
}

export interface ArbitrationResult {
  outcome: ArbitrationOutcome;
  winner_evaluation_id?: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Payload validators per action class
// ---------------------------------------------------------------------------

function validateSendReplyPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  const hasRecipients =
    (Array.isArray(p.to) && p.to.length > 0) ||
    (Array.isArray(p.cc) && p.cc.length > 0) ||
    (Array.isArray(p.bcc) && p.bcc.length > 0);
  if (!hasRecipients) {
    errors.push("send_reply requires at least one recipient in to, cc, or bcc");
  }
  if (!p.body_text && !p.body_html) {
    errors.push("send_reply requires body_text or body_html");
  }
  return { valid: errors.length === 0, errors };
}

function validateDraftReplyPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (!p.body_text && !p.body_html) {
    errors.push("draft_reply requires body_text or body_html");
  }
  return { valid: errors.length === 0, errors };
}

function validateSendNewMessagePayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  const hasRecipients =
    (Array.isArray(p.to) && p.to.length > 0) ||
    (Array.isArray(p.cc) && p.cc.length > 0) ||
    (Array.isArray(p.bcc) && p.bcc.length > 0);
  if (!hasRecipients) {
    errors.push("send_new_message requires at least one recipient");
  }
  if (!p.body_text && !p.body_html) {
    errors.push("send_new_message requires body_text or body_html");
  }
  if (!p.subject) {
    errors.push("send_new_message requires subject");
  }
  return { valid: errors.length === 0, errors };
}

function validateMarkReadPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (p.body_text || p.body_html || p.subject) {
    errors.push("mark_read must not contain body_text, body_html, or subject");
  }
  return { valid: errors.length === 0, errors };
}

function validateMoveMessagePayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (!p.target_folder || typeof p.target_folder !== "string" || p.target_folder.trim().length === 0) {
    errors.push("move_message requires target_folder");
  }
  return { valid: errors.length === 0, errors };
}

function validateSetCategoriesPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.categories) || p.categories.length === 0) {
    errors.push("set_categories requires a non-empty categories array");
  }
  return { valid: errors.length === 0, errors };
}

function validateProcessRunPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (!p.command || typeof p.command !== "string" || p.command.trim().length === 0) {
    errors.push("process_run requires command");
  }
  return { valid: errors.length === 0, errors };
}

function validateCreateFollowupPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (!p.title || typeof p.title !== "string") {
    errors.push("create_followup requires title");
  }
  return { valid: errors.length === 0, errors };
}

function validateCampaignBriefPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Payload must be an object");
    return { valid: false, errors };
  }
  const p = payload as Record<string, unknown>;
  if (!p.name || typeof p.name !== "string" || p.name.trim().length === 0) {
    errors.push("campaign_brief requires name");
  }
  if (!p.audience || typeof p.audience !== "string" || p.audience.trim().length === 0) {
    errors.push("campaign_brief requires audience");
  }
  if (!p.content_summary || typeof p.content_summary !== "string" || p.content_summary.trim().length === 0) {
    errors.push("campaign_brief requires content_summary");
  }
  if (!p.timing || typeof p.timing !== "string" || p.timing.trim().length === 0) {
    errors.push("campaign_brief requires timing");
  }
  if (p.approval_needed !== true) {
    errors.push("campaign_brief requires approval_needed to be true in v0");
  }
  return { valid: errors.length === 0, errors };
}

function defaultPayloadValidator(payload: unknown): { valid: boolean; errors: string[] } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload must be an object"] };
  }
  return { valid: true, errors: [] };
}

const payloadValidators: Record<AllowedAction, (payload: unknown) => { valid: boolean; errors: string[] }> = {
  draft_reply: validateDraftReplyPayload,
  send_reply: validateSendReplyPayload,
  send_new_message: validateSendNewMessagePayload,
  mark_read: validateMarkReadPayload,
  move_message: validateMoveMessagePayload,
  set_categories: validateSetCategoriesPayload,
  campaign_brief: validateCampaignBriefPayload,
  extract_obligations: defaultPayloadValidator,
  create_followup: validateCreateFollowupPayload,
  tool_request: defaultPayloadValidator,
  process_run: validateProcessRunPayload,
  no_action: defaultPayloadValidator,
};

// ---------------------------------------------------------------------------
// Action governance
// ---------------------------------------------------------------------------

export function governAction(
  action: ProposedAction,
  policy: RuntimePolicy,
  confidence: CharterOutputEnvelope["confidence"],
): ActionGovernanceResult {
  // Policy allowance
  if (!policy.allowed_actions.includes(action.action_type)) {
    return {
      allowed: false,
      reason: "Action type not allowed by runtime policy",
      requires_approval: false,
      confidence_sufficient: false,
      payload_valid: true,
      payload_errors: [],
    };
  }

  // Payload validation
  let payloadResult: { valid: boolean; errors: string[] };
  try {
    const parsed = JSON.parse(action.payload_json);
    payloadResult = payloadValidators[action.action_type](parsed);
  } catch {
    payloadResult = { valid: false, errors: ["payload_json is not valid JSON"] };
  }

  // Confidence sufficiency
  const highStakesActions: AllowedAction[] = ["send_reply", "send_new_message", "move_message"];
  const isHighStakes = highStakesActions.includes(action.action_type);
  const confidenceSufficient = confidence.overall === "high" || (confidence.overall === "medium" && !isHighStakes);

  // Approval requirement
  let requiresApproval = false;
  if (policy.require_human_approval) {
    requiresApproval = true;
  } else if (confidence.overall === "medium" && isHighStakes) {
    requiresApproval = true;
  } else if (confidence.uncertainty_flags.length > 0) {
    requiresApproval = true;
  }

  return {
    allowed: true,
    confidence_sufficient: confidenceSufficient,
    payload_valid: payloadResult.valid,
    payload_errors: payloadResult.errors,
    requires_approval: requiresApproval,
    reason: "",
  };
}

// ---------------------------------------------------------------------------
// Tool request governance
// ---------------------------------------------------------------------------

export function governToolRequest(
  request: ToolInvocationRequest,
  policy: RuntimePolicy,
  confidence: CharterOutputEnvelope["confidence"],
): ToolGovernanceResult {
  // Policy allowance
  if (policy.allowed_tools && !policy.allowed_tools.includes(request.tool_id)) {
    return {
      allowed: false,
      reason: `Tool ${request.tool_id} not allowed by runtime policy`,
      requires_approval: false,
    };
  }

  // Approval requirement mirrors action governance
  let requiresApproval = false;
  if (policy.require_human_approval) {
    requiresApproval = true;
  } else if (confidence.uncertainty_flags.length > 0) {
    requiresApproval = true;
  }

  return {
    allowed: true,
    reason: "",
    requires_approval: requiresApproval,
  };
}

// ---------------------------------------------------------------------------
// Evaluation governance
// ---------------------------------------------------------------------------

export function governEvaluation(
  evaluation: EvaluationEnvelope,
  policy: RuntimePolicy,
  actions?: ProposedAction[],
  effectiveOutcome?: CharterOutputEnvelope["outcome"],
): GovernEvaluationResult {
  const actionsToGovern = actions ?? evaluation.proposed_actions;
  const actionErrors: string[] = [];
  let firstAcceptableAction: ProposedAction | undefined;
  let firstAcceptableRequiresApproval = false;

  for (const action of actionsToGovern) {
    const result = governAction(action, policy, evaluation.confidence);

    if (!result.allowed) {
      actionErrors.push(`${action.action_type}: ${result.reason}`);
      continue;
    }
    if (!result.confidence_sufficient) {
      actionErrors.push(`${action.action_type}: confidence insufficient for autonomous execution`);
      continue;
    }
    if (!result.payload_valid) {
      actionErrors.push(`${action.action_type}: invalid payload — ${result.payload_errors.join(", ")}`);
      continue;
    }

    if (!firstAcceptableAction) {
      firstAcceptableAction = action;
      firstAcceptableRequiresApproval = result.requires_approval;
    }
  }

  // Govern tool requests — ALWAYS run, regardless of charter outcome.
  // Tool requests are part of agent effect authority and must not bypass governance.
  const toolErrors: string[] = [];
  let anyToolRequiresApproval = false;

  for (const request of evaluation.tool_requests) {
    const result = governToolRequest(request, policy, evaluation.confidence);
    if (!result.allowed) {
      toolErrors.push(`tool ${request.tool_id}: ${result.reason}`);
      continue;
    }
    if (result.requires_approval) {
      anyToolRequiresApproval = true;
    }
  }

  // Unauthorized tools are always fatal.
  if (toolErrors.length > 0) {
    const allErrors = [...actionErrors, ...toolErrors];
    return {
      outcome: "reject",
      reason: allErrors.join("; "),
      approval_required: false,
      governance_errors: allErrors,
    };
  }

  const outcome = effectiveOutcome ?? evaluation.outcome;

  // Respect explicit charter outcomes (after tool governance).
  if (outcome === "no_op") {
    return {
      outcome: "no_op",
      reason: "Charter declared no_op",
      approval_required: anyToolRequiresApproval,
      governance_errors: [],
    };
  }
  if (outcome === "escalation") {
    return {
      outcome: "escalate",
      reason: "Charter declared escalation",
      approval_required: anyToolRequiresApproval,
      governance_errors: [],
    };
  }
  if (outcome === "clarification_needed") {
    return {
      outcome: "clarification_needed",
      reason: "Charter declared clarification_needed",
      approval_required: anyToolRequiresApproval,
      governance_errors: [],
    };
  }

  // Confidence floor for autonomous execution
  if (evaluation.confidence.overall === "low") {
    return {
      outcome: "escalate",
      reason: "Low confidence requires escalation",
      approval_required: anyToolRequiresApproval,
      governance_errors: [],
    };
  }

  // Action errors are fatal only when no acceptable action remains.
  if (!firstAcceptableAction && actionErrors.length > 0) {
    return {
      outcome: "reject",
      reason: actionErrors.join("; "),
      approval_required: anyToolRequiresApproval,
      governance_errors: actionErrors,
    };
  }

  if (!firstAcceptableAction) {
    return {
      outcome: "no_op",
      reason: "No proposed actions remain after governance",
      approval_required: anyToolRequiresApproval,
      governance_errors: [],
    };
  }

  const effectiveRequiresApproval = firstAcceptableRequiresApproval || anyToolRequiresApproval;

  return {
    outcome: "accept",
    governed_action: firstAcceptableAction,
    reason: effectiveRequiresApproval
      ? "Action valid but requires human approval"
      : "Action passed governance",
    approval_required: effectiveRequiresApproval,
    governance_errors: [],
  };
}

// ---------------------------------------------------------------------------
// Arbitration across evaluations
// ---------------------------------------------------------------------------

export function resolveArbitration(
  primary: EvaluationEnvelope | undefined,
  secondary: EvaluationEnvelope | undefined,
): ArbitrationResult {
  if (!primary && !secondary) {
    return { outcome: "conflict_unresolved", reason: "No evaluations to arbitrate" };
  }
  if (primary && !secondary) {
    return { outcome: "accept", winner_evaluation_id: primary.evaluation_id, reason: "Only primary evaluation present" };
  }
  if (!primary && secondary) {
    return { outcome: "accept", winner_evaluation_id: secondary.evaluation_id, reason: "Only secondary evaluation present" };
  }

  const primaryHasHighEscalation =
    primary!.outcome === "escalation" ||
    primary!.escalations.some((e) => e.urgency === "high");
  const secondaryHasHighEscalation =
    secondary!.outcome === "escalation" ||
    secondary!.escalations.some((e) => e.urgency === "high");

  if (secondaryHasHighEscalation && !primaryHasHighEscalation) {
    return {
      outcome: "escalate",
      winner_evaluation_id: secondary!.evaluation_id,
      reason: "Secondary raised high-urgency escalation and primary did not",
    };
  }

  if (primaryHasHighEscalation && !secondaryHasHighEscalation) {
    return {
      outcome: "escalate",
      winner_evaluation_id: primary!.evaluation_id,
      reason: "Primary raised high-urgency escalation and secondary did not",
    };
  }

  // Detect conflicting non-noop actions
  const primaryAction = primary!.proposed_actions[0]?.action_type;
  const secondaryAction = secondary!.proposed_actions[0]?.action_type;
  if (
    primaryAction &&
    secondaryAction &&
    primaryAction !== secondaryAction &&
    primaryAction !== "no_action" &&
    secondaryAction !== "no_action"
  ) {
    return {
      outcome: "escalate",
      reason: `Conflicting actions: primary=${primaryAction}, secondary=${secondaryAction}`,
    };
  }

  return {
    outcome: "accept",
    winner_evaluation_id: primary!.evaluation_id,
    reason: "Primary charter prevails by default",
  };
}
