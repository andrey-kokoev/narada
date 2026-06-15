/**
 * Reactor Pattern Types
 *
 * Core contracts for components that consume admitted facts, evaluate them
 * against a bound charter, and may propose an effect.
 *
 * See: docs/concepts/reactor-pattern.md
 */

import type { Fact } from "../facts/types.js";
import type { PolicyContext } from "../foreman/context.js";
import type { RuntimePolicy } from "../config/types.js";
import type {
  InboxEnvelopeKind,
  InboxAuthorityLevel,
  InboxSourceKind,
} from "../inbox/types.js";

/** Stable reactor identifier */
export type ReactorId = string;

/** Reactor charter: authority-bearing instruction set bound to a reactor */
export interface ReactorCharter {
  charter_id: string;
  version: string;
  /** Which runtime executes this charter */
  runtime: "in_kernel" | "agent_runtime";
  /** Human-readable description */
  description: string;
  /** Context selectors that determine when this reactor is eligible */
  triggers: ReactorTrigger[];
  /** Evaluation rules (interpretation depends on runtime) */
  rules: ReactorRule[];
  /** Action bounding: which proposal kinds this reactor may emit */
  allowed_proposal_kinds: ReactorProposalKind[];
  /** Optional confidence floor for autonomous proposals */
  confidence_floor?: ReactorConfidence;
}

export interface ReactorTrigger {
  /** Match by fact type. Empty / omitted means any fact type */
  fact_types?: string[];
  /** Match by context_id prefix (e.g. "mail:", "timer:") */
  context_prefix?: string;
  /** Match by vertical hint */
  vertical?: string;
}

export interface ReactorRule {
  rule_id: string;
  /** Rule condition. Format depends on runtime */
  condition: ReactorRuleCondition;
  /** Rule consequence if condition matches */
  consequence: ReactorRuleConsequence;
}

/** Mechanical reactor condition */
export interface ReactorRuleCondition {
  kind: "fact_field_equals" | "fact_field_contains" | "fact_type_is" | "always";
  /** JSON path or field name inside the fact payload */
  field?: string;
  value?: string | string[];
}

/** Mechanical reactor consequence */
export interface ReactorRuleConsequence {
  kind: "propose_inbox_envelope" | "escalate" | "no_op";
  /** Inbox envelope kind when kind === "propose_inbox_envelope" */
  envelope_kind?: InboxEnvelopeKind;
  /** Authority level for the proposed envelope */
  authority_level?: InboxAuthorityLevel;
  /** Static payload or template (mechanical reactors only) */
  payload_json?: string;
  /** Human-readable rationale template */
  rationale_template?: string;
}

export type ReactorProposalKind = "inbox_envelope";

export type ReactorConfidence = "low" | "medium" | "high";

/** Input to a reactor evaluation */
export interface ReactorInput {
  reactor_id: ReactorId;
  charter: ReactorCharter;
  context: PolicyContext;
  facts: Fact[];
  /** Prior reactor outputs for this context, newest first */
  prior_outputs: ReactorOutput[];
  policy: RuntimePolicy;
  evaluated_at: string;
}

/** Output of a reactor evaluation */
export interface ReactorOutput {
  output_id: string;
  reactor_id: ReactorId;
  charter_id: string;
  context_id: string;
  scope_id: string;
  evaluated_at: string;
  outcome: "propose" | "no_op" | "escalate";
  confidence: {
    overall: ReactorConfidence;
    uncertainty_flags: string[];
  };
  summary: string;
  proposals: ReactorProposal[];
  escalation?: {
    reason: string;
    urgency: "low" | "medium" | "high";
  };
}

/** A proposed effect emitted by a reactor */
export interface ReactorProposal {
  proposal_id: string;
  proposal_kind: ReactorProposalKind;
  /** For inbox_envelope proposals */
  envelope_kind: InboxEnvelopeKind;
  authority_level: InboxAuthorityLevel;
  source_kind: InboxSourceKind;
  /** Stable ref back to the originating reactor output */
  source_ref: string;
  payload_json: string;
  rationale: string;
}

/** Reactor interface: consumes facts, may propose effects */
export interface Reactor {
  readonly reactor_id: ReactorId;
  evaluate(input: ReactorInput): Promise<ReactorOutput>;
}

/** Result of applying reactor governance to an output */
export interface ReactorGovernanceResult {
  allowed: boolean;
  reason: string;
  governance_errors: string[];
  approved_proposals: ReactorProposal[];
  rejected_proposals: ReactorProposal[];
}

/**
 * Minimal store surface required for reactor output persistence.
 *
 * Decoupled from CoordinatorStore so implementations can use either
 * better-sqlite3 or node:sqlite.
 */
export interface ReactorOutputStore {
  getReactorOutputById(outputId: string): import("../coordinator/types.js").ReactorOutputRow | undefined;
  insertReactorOutput(output: import("../coordinator/types.js").ReactorOutputRow): void;
}
