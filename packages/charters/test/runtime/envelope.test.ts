import { describe, it, expect } from "vitest";
import {
  validateInvocationEnvelope,
  validateOutputEnvelope,
  CharterInvocationEnvelopeSchema,
  CharterOutputEnvelopeSchema,
} from "../../src/runtime/envelope.js";

function makeInvocation(overrides?: Record<string, unknown>) {
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
    allowed_actions: ["send_reply"],
    available_tools: [],
    coordinator_flags: [],
    prior_evaluations: [],
    max_prior_evaluations: 5,
    ...overrides,
  };
}

function makeOutput(overrides?: Record<string, unknown>) {
  return {
    output_version: "2.0",
    execution_id: "ex-1",
    charter_id: "support_steward",
    role: "primary",
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

describe("envelope validation", () => {
  describe("validateInvocationEnvelope", () => {
    it("accepts a valid envelope", () => {
      const result = validateInvocationEnvelope(makeInvocation());
      expect(result.execution_id).toBe("ex-1");
    });

    it("rejects missing execution_id", () => {
      expect(() => validateInvocationEnvelope(makeInvocation({ execution_id: "" }))).toThrow();
    });

    it("rejects invalid invocation_version", () => {
      expect(() =>
        validateInvocationEnvelope(makeInvocation({ invocation_version: "1.0" })),
      ).toThrow();
    });

    it("rejects invalid role", () => {
      expect(() => validateInvocationEnvelope(makeInvocation({ role: "tertiary" }))).toThrow();
    });

    it("rejects malformed ISO datetime", () => {
      expect(() =>
        validateInvocationEnvelope(makeInvocation({ invoked_at: "not-a-date" })),
      ).toThrow();
    });
  });

  describe("validateOutputEnvelope", () => {
    it("accepts a valid envelope", () => {
      const result = validateOutputEnvelope(makeOutput());
      expect(result.execution_id).toBe("ex-1");
    });

    it("rejects invalid output_version", () => {
      expect(() => validateOutputEnvelope(makeOutput({ output_version: "1.0" }))).toThrow();
    });

    it("rejects summary over 500 chars", () => {
      expect(() => validateOutputEnvelope(makeOutput({ summary: "a".repeat(501) }))).toThrow();
    });

    it("rejects rationale over 1000 chars in classification", () => {
      expect(() =>
        validateOutputEnvelope(
          makeOutput({
            classifications: [
              { kind: "test", confidence: "high", rationale: "a".repeat(1001) },
            ],
          }),
        ),
      ).toThrow();
    });
  });
});
