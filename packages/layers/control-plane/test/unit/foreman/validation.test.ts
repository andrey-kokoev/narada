import { describe, it, expect } from "vitest";
import { validateCharterOutput } from "@narada2/charters";
import { arbitrateEvaluations } from "../../../src/foreman/validation.js";
import type { CharterOutputEnvelope, CharterInvocationEnvelope } from "../../../src/foreman/types.js";

function makeInvocation(overrides?: Partial<CharterInvocationEnvelope>): CharterInvocationEnvelope {
  return {
    invocation_version: "2.0",
    execution_id: "ex-1",
    work_item_id: "wi-1",
    context_id: "conv-1",
    scope_id: "mb-1",
    charter_id: "support_steward",
    role: "primary",
    invoked_at: new Date().toISOString(),
    revision_id: "conv-1:rev:1",
    context_materialization: { messages: [] },
    vertical_hints: { vertical: "mail" },
    allowed_actions: ["send_reply", "draft_reply", "mark_read", "no_action"],
    available_tools: [
      { tool_id: "tool-a", tool_signature: "tool-a@1", description: "Tool A", read_only: true, requires_approval: false, timeout_ms: 5000, authority_class: "derive" },
    ],
    coordinator_flags: [],
    prior_evaluations: [],
    max_prior_evaluations: 5,
    ...overrides,
  };
}

function makeOutput(overrides?: Partial<CharterOutputEnvelope>): CharterOutputEnvelope {
  return {
    output_version: "2.0",
    execution_id: "ex-1",
    charter_id: "support_steward",
    role: "primary",
    analyzed_at: new Date().toISOString(),
    outcome: "complete",
    confidence: { overall: "high", uncertainty_flags: [] },
    summary: "Test summary",
    classifications: [],
    facts: [],
    proposed_actions: [],
    tool_requests: [],
    escalations: [],
    ...overrides,
  };
}

describe("validateCharterOutput", () => {
  // Rule 1
  it("Rule 1: rejects execution_id mismatch", () => {
    const result = validateCharterOutput(makeOutput({ execution_id: "ex-2" }), makeInvocation());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Rule 1"))).toBe(true);
  });

  // Rule 2
  it("Rule 2: rejects charter_id mismatch", () => {
    const result = validateCharterOutput(makeOutput({ charter_id: "obligation_keeper" }), makeInvocation());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Rule 2") && e.includes("charter_id"))).toBe(true);
  });

  it("Rule 2: rejects role mismatch", () => {
    const result = validateCharterOutput(makeOutput({ role: "secondary" }), makeInvocation());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Rule 2") && e.includes("role"))).toBe(true);
  });

  // Rule 3
  it("Rule 3: rejects unrecognized output_version", () => {
    const result = validateCharterOutput(makeOutput({ output_version: "1.0" as "2.0" }), makeInvocation());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Rule 3"))).toBe(true);
  });

  // Rule 4
  it("Rule 4: strips actions not in allowed_actions", () => {
    const result = validateCharterOutput(
      makeOutput({
        proposed_actions: [
          { action_type: "send_reply", authority: "recommended", payload_json: "{}", rationale: "" },
          { action_type: "move_message", authority: "proposed", payload_json: "{}", rationale: "" },
        ],
      }),
      makeInvocation(),
    );
    expect(result.errors.some((e) => e.includes("Rule 4"))).toBe(true);
    expect(result.stripped_actions).toHaveLength(1);
    expect(result.stripped_actions![0].action_type).toBe("move_message");
  });

  // Rule 5
  it("Rule 5: strips tool requests not in available_tools", () => {
    const result = validateCharterOutput(
      makeOutput({
        tool_requests: [{ tool_id: "tool-b", arguments_json: "{}", purpose: "" }],
      }),
      makeInvocation(),
    );
    expect(result.errors.some((e) => e.includes("Rule 5"))).toBe(true);
    expect(result.stripped_tool_requests).toHaveLength(1);
    expect(result.stripped_tool_requests![0].tool_id).toBe("tool-b");
  });

  // Rule 6
  it("Rule 6: strips actions with unparseable payload_json", () => {
    const result = validateCharterOutput(
      makeOutput({
        proposed_actions: [
          { action_type: "send_reply", authority: "recommended", payload_json: "not-json", rationale: "" },
        ],
      }),
      makeInvocation(),
    );
    expect(result.errors.some((e) => e.includes("Rule 6"))).toBe(true);
    expect(result.stripped_actions).toHaveLength(1);
  });

  // Rule 7
  it("Rule 7: flags high-urgency escalation", () => {
    const result = validateCharterOutput(
      makeOutput({
        escalations: [{ kind: "security", reason: "suspicious", urgency: "high" }],
      }),
      makeInvocation(),
    );
    expect(result.errors.some((e) => e.includes("Rule 7"))).toBe(true);
  });

  // Rule 8
  it("Rule 8: flags low confidence without escalation", () => {
    const result = validateCharterOutput(
      makeOutput({ confidence: { overall: "low", uncertainty_flags: ["x"] } }),
      makeInvocation(),
    );
    expect(result.errors.some((e) => e.includes("Rule 8"))).toBe(true);
  });

  // Rule 9
  it("Rule 9: flags secondary charter asserting recommended authority", () => {
    const result = validateCharterOutput(
      makeOutput({
        proposed_actions: [
          { action_type: "send_reply", authority: "recommended", payload_json: "{}", rationale: "" },
        ],
      }),
      makeInvocation({ role: "secondary" }),
    );
    expect(result.errors.some((e) => e.includes("Rule 9"))).toBe(true);
  });

  // Rule 10
  it("Rule 10: corrects no_op when actions are present", () => {
    const result = validateCharterOutput(
      makeOutput({
        outcome: "no_op",
        proposed_actions: [
          { action_type: "send_reply", authority: "proposed", payload_json: "{}", rationale: "" },
        ],
      }),
      makeInvocation(),
    );
    expect(result.errors.some((e) => e.includes("Rule 10"))).toBe(true);
    expect(result.corrected_outcome).toBe("complete");
  });

  it("Rule 10: corrects complete to no_op when all actions stripped", () => {
    const result = validateCharterOutput(
      makeOutput({
        outcome: "complete",
        proposed_actions: [
          { action_type: "move_message", authority: "proposed", payload_json: "{}", rationale: "" },
        ],
      }),
      makeInvocation(),
    );
    expect(result.corrected_outcome).toBe("no_op");
  });

  it("returns valid for a well-formed output", () => {
    const result = validateCharterOutput(makeOutput(), makeInvocation());
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});

describe("arbitrateEvaluations", () => {
  it("primary wins by default", () => {
    const primary = { evaluation_id: "e1", proposed_actions: [], escalations: [] };
    const secondary = { evaluation_id: "e2", proposed_actions: [], escalations: [] };
    const result = arbitrateEvaluations(primary, secondary);
    expect(result.winner).toBe("primary");
  });

  it("secondary wins with high-urgency escalation", () => {
    const primary = { evaluation_id: "e1", proposed_actions: [], escalations: [] };
    const secondary = { evaluation_id: "e2", proposed_actions: [], escalations: [{ urgency: "high" }] };
    const result = arbitrateEvaluations(primary, secondary);
    expect(result.winner).toBe("secondary");
  });

  it("returns conflict when none provided", () => {
    const result = arbitrateEvaluations(undefined, undefined);
    expect(result.winner).toBe("conflict");
  });
});
