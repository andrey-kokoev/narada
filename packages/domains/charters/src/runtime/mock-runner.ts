/**
 * Mock Charter Runner
 *
 * Deterministic runner for integration tests. Validates the invocation envelope
 * and returns a predictable CharterOutputEnvelope based on envelope content.
 *
 * Spec: .ai/tasks/20260414-006-assignment-agent-b-charter-invocation-v2.md
 */

import type { CharterInvocationEnvelope, CharterOutputEnvelope } from "./envelope.js";
import { validateInvocationEnvelope } from "./envelope.js";
import type { CharterRuntimeHealth } from "./health.js";

export interface CharterRunner {
  run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope>;
  probeHealth(): Promise<import("./health.js").CharterRuntimeHealth>;
}

export interface MockCharterRunnerOptions {
  /** Force a specific outcome (default: "complete") */
  fixedOutcome?: CharterOutputEnvelope["outcome"];
  /** Force a specific confidence level (default: "high") */
  fixedConfidence?: CharterOutputEnvelope["confidence"]["overall"];
  /** Delay in ms to simulate work (default: 0) */
  delayMs?: number;
}

export class MockCharterRunner implements CharterRunner {
  constructor(private readonly opts: MockCharterRunnerOptions = {}) {}

  async probeHealth(): Promise<CharterRuntimeHealth> {
    return {
      class: "unconfigured",
      checked_at: new Date().toISOString(),
      details:
        "Mock runtime is active. No real executor is attached. Configure `charter.runtime` to 'codex-api' or 'kimi-api' with a valid API key to enable real charter execution.",
    };
  }

  async run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope> {
    validateInvocationEnvelope(envelope);

    if (this.opts.delayMs && this.opts.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.opts.delayMs));
    }

    const now = new Date().toISOString();
    const outcome = this.opts.fixedOutcome ?? this.inferOutcome(envelope);
    const confidenceOverall = this.opts.fixedConfidence ?? "high";

    const mat = envelope.context_materialization as Record<string, unknown> | undefined;
    const matLength = mat && Array.isArray(mat.messages) ? mat.messages.length : 0;

    const proposedActions =
      outcome === "no_op" || outcome === "escalation"
        ? []
        : envelope.allowed_actions.slice(0, 1).map((action) => ({
            action_type: action,
            authority: "recommended" as const,
            payload_json: JSON.stringify({ generated_by: "mock_runner" }),
            rationale: `Mock runner recommends ${action} for context ${envelope.context_id}`,
          }));

    return {
      output_version: "2.0",
      execution_id: envelope.execution_id,
      charter_id: envelope.charter_id,
      role: envelope.role,
      analyzed_at: now,
      outcome,
      confidence: {
        overall: confidenceOverall,
        uncertainty_flags: [],
      },
      summary: `Mock analysis completed for ${envelope.context_id} (${matLength} messages)`,
      classifications: [],
      facts: [],
      proposed_actions: proposedActions,
      tool_requests: [],
      escalations:
        outcome === "escalation"
          ? [
              {
                kind: "mock_escalation",
                reason: "Mock runner was configured to escalate",
                urgency: "medium",
              },
            ]
          : [],
      reasoning_log: `Mock runner executed for work item ${envelope.work_item_id}`,
    };
  }

  private inferOutcome(envelope: CharterInvocationEnvelope): CharterOutputEnvelope["outcome"] {
    if (envelope.coordinator_flags.includes("force_escalation")) {
      return "escalation";
    }
    if (envelope.coordinator_flags.includes("force_clarification")) {
      return "clarification_needed";
    }
    if (envelope.allowed_actions.length === 0 || envelope.allowed_actions[0] === "no_action") {
      return "no_op";
    }
    return "complete";
  }
}
