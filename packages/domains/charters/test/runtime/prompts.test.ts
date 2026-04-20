import { describe, expect, it } from "vitest";
import { resolveSystemPrompt, registerPromptTemplate } from "../../src/runtime/prompts.js";
import type { CharterInvocationEnvelope } from "../../src/runtime/envelope.js";

function makeEnvelope(charterId: string): CharterInvocationEnvelope {
  return {
    invocation_version: "2.0",
    execution_id: "exec-001",
    work_item_id: "wi-001",
    context_id: "ctx-001",
    scope_id: "scope-001",
    charter_id: charterId,
    role: "primary",
    invoked_at: new Date().toISOString(),
    revision_id: "rev-001",
    context_materialization: {},
    vertical_hints: {},
    allowed_actions: ["draft_reply", "mark_read", "no_action"],
    available_tools: [],
    coordinator_flags: [],
    prior_evaluations: [],
    max_prior_evaluations: 3,
  };
}

describe("resolveSystemPrompt", () => {
  it("returns the support_steward template for support_steward charter_id", () => {
    const prompt = resolveSystemPrompt(makeEnvelope("support_steward"));
    expect(prompt).toContain("support steward for help@global-maxima.com");
    expect(prompt).toContain("You may DRAFT replies but you must NOT send them directly");
    expect(prompt).toContain("Do not make promises the business cannot keep");
    expect(prompt).toContain("Knowledge sources");
  });

  it("falls back to the generic template for unknown charter IDs", () => {
    const prompt = resolveSystemPrompt(makeEnvelope("unknown_charter"));
    expect(prompt).toContain("You are a charter agent");
    expect(prompt).not.toContain("support steward");
  });

  it("allows custom templates via registerPromptTemplate", () => {
    registerPromptTemplate("custom_test_charter", (envelope) =>
      `Custom prompt for ${envelope.charter_id}`
    );
    const prompt = resolveSystemPrompt(makeEnvelope("custom_test_charter"));
    expect(prompt).toBe("Custom prompt for custom_test_charter");
  });
});
