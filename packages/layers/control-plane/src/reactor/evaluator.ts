/**
 * In-Kernel Reactor Evaluator
 *
 * Mechanical, deterministic reactor implementation that evaluates facts against
 * a charter's rules without an external agent runtime.
 */

import type {
  Reactor,
  ReactorInput,
  ReactorOutput,
  ReactorProposal,
  ReactorRuleCondition,
  ReactorRuleConsequence,
  ReactorConfidence,
} from "./types.js";
import type { Fact } from "../facts/types.js";

export interface InKernelReactorOptions {
  reactor_id: string;
}

export class InKernelReactor implements Reactor {
  constructor(private readonly opts: InKernelReactorOptions) {}

  get reactor_id(): string {
    return this.opts.reactor_id;
  }

  async evaluate(input: ReactorInput): Promise<ReactorOutput> {
    const outputId = `react_${input.reactor_id}_${Date.now()}`;
    const proposals: ReactorProposal[] = [];
    const summaryParts: string[] = [];
    let overallOutcome: ReactorOutput["outcome"] = "no_op";
    let overallConfidence: ReactorConfidence = "high";

    for (const rule of input.charter.rules) {
      const matched = evaluateCondition(rule.condition, input.facts);
      if (!matched) {
        continue;
      }

      if (rule.consequence.kind === "no_op") {
        summaryParts.push(`rule ${rule.rule_id}: no_op`);
        continue;
      }

      if (rule.consequence.kind === "escalate") {
        overallOutcome = "escalate";
        summaryParts.push(`rule ${rule.rule_id}: escalation`);
        continue;
      }

      if (rule.consequence.kind === "propose_inbox_envelope") {
        const proposal = buildProposal(input, outputId, rule.consequence);
        if (proposal) {
          proposals.push(proposal);
          overallOutcome = "propose";
          summaryParts.push(`rule ${rule.rule_id}: proposed ${proposal.envelope_kind}`);
        }
      }
    }

    if (overallOutcome === "escalate" && proposals.length === 0) {
      overallConfidence = "medium";
    }

    const confidenceFloor = input.charter.confidence_floor;
    if (confidenceFloor && confidenceRank(overallConfidence) < confidenceRank(confidenceFloor)) {
      overallOutcome = "escalate";
      summaryParts.push(`confidence ${overallConfidence} below floor ${confidenceFloor}`);
    }

    return {
      output_id: outputId,
      reactor_id: input.reactor_id,
      charter_id: input.charter.charter_id,
      context_id: input.context.context_id,
      scope_id: input.context.scope_id,
      evaluated_at: input.evaluated_at,
      outcome: overallOutcome,
      confidence: {
        overall: overallConfidence,
        uncertainty_flags: proposals.length > 0 ? [] : ["no_matching_rule"],
      },
      summary: summaryParts.join("; ") || "No rules matched",
      proposals,
    };
  }
}

function evaluateCondition(condition: ReactorRuleCondition, facts: Fact[]): boolean {
  if (condition.kind === "always") {
    return true;
  }

  if (condition.kind === "fact_type_is") {
    if (!condition.value) return false;
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    return facts.some((f) => values.includes(f.fact_type));
  }

  if (condition.kind === "fact_field_equals" || condition.kind === "fact_field_contains") {
    const field = condition.field;
    if (!field) return false;
    const expected = Array.isArray(condition.value) ? condition.value : condition.value ? [condition.value] : [];
    return facts.some((fact) => {
      const actual = extractField(fact.payload_json, field);
      if (actual === undefined) return false;
      if (condition.kind === "fact_field_equals") {
        return expected.includes(String(actual));
      }
      return expected.some((e) => String(actual).toLowerCase().includes(e.toLowerCase()));
    });
  }

  return false;
}

function extractField(payloadJson: string, field: string): unknown {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const parts = field.split(".");
    let current: unknown = payload;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  } catch {
    return undefined;
  }
}

function buildProposal(
  input: ReactorInput,
  outputId: string,
  consequence: ReactorRuleConsequence,
): ReactorProposal | null {
  if (!consequence.envelope_kind) {
    return null;
  }

  const proposalId = `${outputId}_prop_${Math.random().toString(36).slice(2, 10)}`;
  const payload = consequence.payload_json
    ? consequence.payload_json
    : JSON.stringify({ context_id: input.context.context_id, scope_id: input.context.scope_id });

  return {
    proposal_id: proposalId,
    proposal_kind: "inbox_envelope",
    envelope_kind: consequence.envelope_kind,
    authority_level: consequence.authority_level ?? "agent_reported",
    source_kind: "agent_report",
    source_ref: outputId,
    payload_json: payload,
    rationale: consequence.rationale_template ?? `Triggered by rule in ${input.charter.charter_id}`,
  };
}

function confidenceRank(confidence: ReactorConfidence): number {
  switch (confidence) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    default:
      return 0;
  }
}
