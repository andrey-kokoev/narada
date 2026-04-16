import { describe, it, expect } from "vitest";
import {
  governAction,
  governEvaluation,
  resolveArbitration,
} from "../../../src/foreman/governance.js";
import type { EvaluationEnvelope, ProposedAction } from "../../../src/foreman/types.js";
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
    expect(result.reason).toContain("not allowed by mailbox policy");
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
