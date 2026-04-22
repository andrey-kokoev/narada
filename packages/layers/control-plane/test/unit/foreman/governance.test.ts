import { describe, it, expect } from "vitest";
import {
  governAction,
  governToolRequest,
  governEvaluation,
  resolveArbitration,
} from "../../../src/foreman/governance.js";
import type { EvaluationEnvelope, ProposedAction, ToolInvocationRequest } from "../../../src/foreman/types.js";
import type { RuntimePolicy } from "../../../src/config/types.js";

function makePolicy(overrides?: Partial<RuntimePolicy>): RuntimePolicy {
  return {
    primary_charter: "support_steward",
    allowed_actions: ["send_reply", "mark_read", "move_message", "no_action"],
    require_human_approval: false,
    ...overrides,
  };
}

function makeEvaluation(overrides?: Partial<EvaluationEnvelope>): EvaluationEnvelope {
  return {
    evaluation_id: "eval-1",
    execution_id: "ex-1",
    work_item_id: "wi-1",
    context_id: "conv-1",
    charter_id: "support_steward",
    role: "primary",
    output_version: "2.0",
    analyzed_at: new Date().toISOString(),
    outcome: "complete",
    confidence: { overall: "high", uncertainty_flags: [] },
    summary: "test",
    classifications: [],
    facts: [],
    proposed_actions: [],
    tool_requests: [],
    escalations: [],
    ...overrides,
  };
}

function makeAction(overrides?: Partial<ProposedAction>): ProposedAction {
  return {
    action_type: "send_reply",
    authority: "recommended",
    payload_json: JSON.stringify({ to: ["a@example.com"], body_text: "Hello" }),
    rationale: "",
    ...overrides,
  };
}

function makeToolRequest(overrides?: Partial<ToolInvocationRequest>): ToolInvocationRequest {
  return {
    tool_id: "echo_test",
    arguments_json: JSON.stringify({ input: "hello" }),
    purpose: "test",
    ...overrides,
  };
}

describe("governAction", () => {
  it("accepts a valid action with high confidence", () => {
    const result = governAction(
      makeAction(),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.payload_valid).toBe(true);
    expect(result.confidence_sufficient).toBe(true);
    expect(result.requires_approval).toBe(false);
  });

  it("rejects a policy-disallowed action", () => {
    const result = governAction(
      makeAction({ action_type: "set_categories" }),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not allowed by runtime policy");
  });

  it("rejects send_reply with missing recipients", () => {
    const result = governAction(
      makeAction({ payload_json: JSON.stringify({ body_text: "Hello" }) }),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.payload_valid).toBe(false);
    expect(result.payload_errors[0]).toContain("recipient");
  });

  it("rejects send_reply with missing body", () => {
    const result = governAction(
      makeAction({ payload_json: JSON.stringify({ to: ["a@example.com"] }) }),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.payload_valid).toBe(false);
    expect(result.payload_errors[0]).toContain("body_text");
  });

  it("rejects mark_read with irrelevant body payload", () => {
    const result = governAction(
      makeAction({ action_type: "mark_read", payload_json: JSON.stringify({ body_text: "oops" }) }),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.payload_valid).toBe(false);
    expect(result.payload_errors[0]).toContain("must not contain");
  });

  it("rejects move_message without target_folder", () => {
    const result = governAction(
      makeAction({ action_type: "move_message", payload_json: JSON.stringify({}) }),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.payload_valid).toBe(false);
    expect(result.payload_errors[0]).toContain("target_folder");
  });

  it("requires approval when policy mandates it", () => {
    const result = governAction(
      makeAction(),
      makePolicy({ require_human_approval: true }),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.requires_approval).toBe(true);
  });

  it("requires approval for medium confidence + high-stakes action", () => {
    const result = governAction(
      makeAction({ action_type: "send_reply" }),
      makePolicy(),
      { overall: "medium", uncertainty_flags: [] },
    );
    expect(result.requires_approval).toBe(true);
    expect(result.confidence_sufficient).toBe(false);
  });

  it("does not require approval for medium confidence + low-stakes action", () => {
    const result = governAction(
      makeAction({ action_type: "mark_read" }),
      makePolicy(),
      { overall: "medium", uncertainty_flags: [] },
    );
    expect(result.requires_approval).toBe(false);
    expect(result.confidence_sufficient).toBe(true);
  });

  it("requires approval when uncertainty flags are present", () => {
    const result = governAction(
      makeAction(),
      makePolicy(),
      { overall: "high", uncertainty_flags: ["external_communication"] },
    );
    expect(result.requires_approval).toBe(true);
  });
});

describe("governToolRequest", () => {
  it("accepts a valid tool request when allowed_tools is absent", () => {
    const result = governToolRequest(
      makeToolRequest(),
      makePolicy(),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.requires_approval).toBe(false);
  });

  it("accepts a valid tool request in allowed_tools", () => {
    const result = governToolRequest(
      makeToolRequest(),
      makePolicy({ allowed_tools: ["echo_test"] }),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.requires_approval).toBe(false);
  });

  it("rejects a tool request not in allowed_tools", () => {
    const result = governToolRequest(
      makeToolRequest(),
      makePolicy({ allowed_tools: ["other_tool"] }),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not allowed by runtime policy");
  });

  it("requires approval when policy mandates human approval", () => {
    const result = governToolRequest(
      makeToolRequest(),
      makePolicy({ require_human_approval: true }),
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.requires_approval).toBe(true);
  });

  it("requires approval when uncertainty flags are present", () => {
    const result = governToolRequest(
      makeToolRequest(),
      makePolicy(),
      { overall: "high", uncertainty_flags: ["ambiguous_intent"] },
    );
    expect(result.allowed).toBe(true);
    expect(result.requires_approval).toBe(true);
  });
});

describe("governEvaluation", () => {
  it("returns no_op for charter-declared no_op", () => {
    const result = governEvaluation(makeEvaluation({ outcome: "no_op" }), makePolicy());
    expect(result.outcome).toBe("no_op");
  });

  it("returns escalate for charter-declared escalation", () => {
    const result = governEvaluation(makeEvaluation({ outcome: "escalation" }), makePolicy());
    expect(result.outcome).toBe("escalate");
  });

  it("returns clarification_needed for charter-declared clarification", () => {
    const result = governEvaluation(makeEvaluation({ outcome: "clarification_needed" }), makePolicy());
    expect(result.outcome).toBe("clarification_needed");
  });

  it("escalates low-confidence complete outcome", () => {
    const result = governEvaluation(
      makeEvaluation({ confidence: { overall: "low", uncertainty_flags: [] } }),
      makePolicy(),
    );
    expect(result.outcome).toBe("escalate");
  });

  it("rejects when all actions are policy-disallowed", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction({ action_type: "set_categories" })],
      }),
      makePolicy(),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("not allowed");
  });

  it("rejects when payload is invalid", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction({ payload_json: JSON.stringify({}) })],
      }),
      makePolicy(),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("invalid payload");
  });

  it("accepts a valid action without approval", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction()],
      }),
      makePolicy(),
    );
    expect(result.outcome).toBe("accept");
    expect(result.approval_required).toBe(false);
    expect(result.governed_action).toBeDefined();
  });

  it("accepts with approval_required when policy mandates approval", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction()],
      }),
      makePolicy({ require_human_approval: true }),
    );
    expect(result.outcome).toBe("accept");
    expect(result.approval_required).toBe(true);
  });

  it("governs only the provided actions array", () => {
    const actions = [makeAction({ action_type: "set_categories" })];
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction(), makeAction({ action_type: "set_categories" })],
      }),
      makePolicy(),
      actions,
    );
    expect(result.outcome).toBe("reject");
  });

  it("rejects when a tool request is not allowed by policy", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction()],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("echo_test");
    expect(result.governance_errors[0]).toContain("not allowed by runtime policy");
  });

  it("requires approval when a tool request requires approval", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction()],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["echo_test"], require_human_approval: true }),
    );
    expect(result.outcome).toBe("accept");
    expect(result.approval_required).toBe(true);
    expect(result.governed_action).toBeDefined();
  });

  it("accepts when tool requests pass governance with no actions", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["echo_test"] }),
    );
    expect(result.outcome).toBe("no_op");
    expect(result.approval_required).toBe(false);
    expect(result.governance_errors).toHaveLength(0);
  });

  it("rejects when both action and tool are disallowed", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [makeAction({ action_type: "set_categories" })],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors.length).toBeGreaterThanOrEqual(2);
  });

  it("no_op with approval_required when only tools require approval and no actions", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["echo_test"], require_human_approval: true }),
    );
    expect(result.outcome).toBe("no_op");
    expect(result.approval_required).toBe(true);
  });

  it("rejects no_op evaluation with unauthorized tool request", () => {
    const result = governEvaluation(
      makeEvaluation({
        outcome: "no_op",
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("not allowed by runtime policy");
  });

  it("rejects escalation evaluation with unauthorized tool request", () => {
    const result = governEvaluation(
      makeEvaluation({
        outcome: "escalation",
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
        escalations: [{ kind: "human_review", reason: "urgent", urgency: "high" }],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("not allowed by runtime policy");
  });

  it("rejects clarification_needed evaluation with unauthorized tool request", () => {
    const result = governEvaluation(
      makeEvaluation({
        outcome: "clarification_needed",
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("not allowed by runtime policy");
  });

  it("no_op with approval_required when tool requires approval", () => {
    const result = governEvaluation(
      makeEvaluation({
        outcome: "no_op",
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["echo_test"], require_human_approval: true }),
    );
    expect(result.outcome).toBe("no_op");
    expect(result.approval_required).toBe(true);
  });

  it("escalation with approval_required when tool requires approval", () => {
    const result = governEvaluation(
      makeEvaluation({
        outcome: "escalation",
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
        escalations: [{ kind: "human_review", reason: "urgent", urgency: "high" }],
      }),
      makePolicy({ allowed_tools: ["echo_test"], require_human_approval: true }),
    );
    expect(result.outcome).toBe("escalate");
    expect(result.approval_required).toBe(true);
  });

  it("rejects low-confidence evaluation with unauthorized tool", () => {
    const result = governEvaluation(
      makeEvaluation({
        confidence: { overall: "low", uncertainty_flags: [] },
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("not allowed by runtime policy");
  });

  it("rejects complete evaluation with no actions but unauthorized tool", () => {
    const result = governEvaluation(
      makeEvaluation({
        proposed_actions: [],
        tool_requests: [makeToolRequest()],
      }),
      makePolicy({ allowed_tools: ["other_tool"] }),
    );
    expect(result.outcome).toBe("reject");
    expect(result.governance_errors[0]).toContain("not allowed by runtime policy");
  });

  it("respects effectiveOutcome override from validation", () => {
    // Charter declared no_op, but validation corrected it to complete
    const result = governEvaluation(
      makeEvaluation({
        outcome: "no_op",
        proposed_actions: [makeAction()],
        tool_requests: [],
      }),
      makePolicy(),
      undefined,
      "complete",
    );
    // Should use effectiveOutcome="complete" instead of evaluation.outcome="no_op"
    expect(result.outcome).toBe("accept");
    expect(result.governed_action).toBeDefined();
  });
});

describe("resolveArbitration", () => {
  it("returns conflict_unresolved when no evaluations exist", () => {
    const result = resolveArbitration(undefined, undefined);
    expect(result.outcome).toBe("conflict_unresolved");
  });

  it("accepts primary when only primary exists", () => {
    const primary = makeEvaluation({ evaluation_id: "eval-p" });
    const result = resolveArbitration(primary, undefined);
    expect(result.outcome).toBe("accept");
    expect(result.winner_evaluation_id).toBe("eval-p");
  });

  it("accepts secondary when only secondary exists", () => {
    const secondary = makeEvaluation({ evaluation_id: "eval-s" });
    const result = resolveArbitration(undefined, secondary);
    expect(result.outcome).toBe("accept");
    expect(result.winner_evaluation_id).toBe("eval-s");
  });

  it("escalates when secondary has high-urgency escalation and primary does not", () => {
    const primary = makeEvaluation({ evaluation_id: "eval-p", escalations: [] });
    const secondary = makeEvaluation({
      evaluation_id: "eval-s",
      escalations: [{ kind: "human_review", reason: "urgent", urgency: "high" }],
    });
    const result = resolveArbitration(primary, secondary);
    expect(result.outcome).toBe("escalate");
    expect(result.winner_evaluation_id).toBe("eval-s");
  });

  it("escalates when primary has high-urgency escalation and secondary does not", () => {
    const primary = makeEvaluation({
      evaluation_id: "eval-p",
      escalations: [{ kind: "human_review", reason: "urgent", urgency: "high" }],
    });
    const secondary = makeEvaluation({ evaluation_id: "eval-s", escalations: [] });
    const result = resolveArbitration(primary, secondary);
    expect(result.outcome).toBe("escalate");
    expect(result.winner_evaluation_id).toBe("eval-p");
  });

  it("escalates when primary and secondary propose conflicting actions", () => {
    const primary = makeEvaluation({
      evaluation_id: "eval-p",
      proposed_actions: [makeAction({ action_type: "send_reply" })],
    });
    const secondary = makeEvaluation({
      evaluation_id: "eval-s",
      proposed_actions: [makeAction({ action_type: "mark_read" })],
    });
    const result = resolveArbitration(primary, secondary);
    expect(result.outcome).toBe("escalate");
    expect(result.reason).toContain("Conflicting actions");
  });

  it("accepts primary by default when no conflict", () => {
    const primary = makeEvaluation({
      evaluation_id: "eval-p",
      proposed_actions: [makeAction({ action_type: "send_reply" })],
    });
    const secondary = makeEvaluation({
      evaluation_id: "eval-s",
      proposed_actions: [makeAction({ action_type: "send_reply" })],
    });
    const result = resolveArbitration(primary, secondary);
    expect(result.outcome).toBe("accept");
    expect(result.winner_evaluation_id).toBe("eval-p");
  });
});

describe("campaign_brief governance", () => {
  it("accepts campaign_brief with valid payload", () => {
    const result = governAction(
      {
        action_type: "campaign_brief",
        authority: "recommended",
        payload_json: JSON.stringify({ name: "Spring Sale", audience: "active-users", content_summary: "Promo", timing: "next week", approval_needed: true }),
        rationale: "Valid brief",
      },
      { primary_charter: "campaign_producer", allowed_actions: ["campaign_brief", "no_action"] },
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.payload_valid).toBe(true);
  });

  it("rejects campaign_brief when not in policy allowed_actions", () => {
    const result = governAction(
      {
        action_type: "campaign_brief",
        authority: "recommended",
        payload_json: JSON.stringify({ name: "Spring Sale", audience: "active-users", content_summary: "Promo", timing: "next week", approval_needed: true }),
        rationale: "Valid brief",
      },
      { primary_charter: "support_steward", allowed_actions: ["send_reply", "no_action"] },
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not allowed by runtime policy");
  });

  it("rejects campaign_brief with empty payload", () => {
    const result = governAction(
      {
        action_type: "campaign_brief",
        authority: "recommended",
        payload_json: JSON.stringify({}),
        rationale: "Empty brief",
      },
      { primary_charter: "campaign_producer", allowed_actions: ["campaign_brief", "no_action"] },
      { overall: "high", uncertainty_flags: [] },
    );
    expect(result.allowed).toBe(true);
    expect(result.payload_valid).toBe(false);
    expect(result.payload_errors[0]).toContain("campaign_brief requires");
  });
});
