/**
 * Reactor Governance
 *
 * Bounds reactor proposals against runtime policy before they are admitted as
 * inbox envelopes or intents. Mirrors the foreman governance layer but is
 * specialized to reactor outputs.
 */

import type {
  ReactorOutput,
  ReactorProposal,
  ReactorGovernanceResult,
} from "./types.js";
import type { RuntimePolicy } from "../config/types.js";

export interface ReactorGovernanceOptions {
  /** If true, require human approval for every reactor proposal */
  require_human_approval?: boolean;
}

export function governReactorOutput(
  output: ReactorOutput,
  policy: RuntimePolicy,
  _opts: ReactorGovernanceOptions = {},
): ReactorGovernanceResult {
  const approved: ReactorProposal[] = [];
  const rejected: ReactorProposal[] = [];
  const errors: string[] = [];

  if (output.outcome === "escalate") {
    return {
      allowed: false,
      reason: output.escalation?.reason ?? "Reactor declared escalation",
      governance_errors: [],
      approved_proposals: [],
      rejected_proposals: output.proposals,
    };
  }

  if (output.outcome === "no_op") {
    return {
      allowed: true,
      reason: "Reactor declared no_op",
      governance_errors: [],
      approved_proposals: [],
      rejected_proposals: [],
    };
  }

  for (const proposal of output.proposals) {
    const result = governProposal(proposal, policy, output);
    if (result.allowed) {
      approved.push(proposal);
    } else {
      rejected.push(proposal);
      errors.push(`${proposal.proposal_id}: ${result.reason}`);
    }
  }

  return {
    allowed: approved.length > 0,
    reason: approved.length > 0 ? "Proposals passed governance" : `All proposals rejected: ${errors.join("; ")}`,
    governance_errors: errors,
    approved_proposals: approved,
    rejected_proposals: rejected,
  };
}

interface ProposalGovernanceResult {
  allowed: boolean;
  reason: string;
}

function governProposal(
  proposal: ReactorProposal,
  _policy: RuntimePolicy,
  output: ReactorOutput,
): ProposalGovernanceResult {
  // Payload must be valid JSON
  try {
    JSON.parse(proposal.payload_json);
  } catch {
    return { allowed: false, reason: "payload_json is not valid JSON" };
  }

  // Confidence floor
  if (output.confidence.overall === "low") {
    return { allowed: false, reason: "low confidence reactor output requires escalation" };
  }

  // Policy-bound authority level
  const allowedAuthorityLevels = ["agent_reported", "system_observed"];
  if (!allowedAuthorityLevels.includes(proposal.authority_level)) {
    return { allowed: false, reason: `authority_level ${proposal.authority_level} not allowed for reactor proposals` };
  }

  // Proposal kind bounded by policy (future: policy may restrict kinds)
  if (proposal.proposal_kind !== "inbox_envelope") {
    return { allowed: false, reason: `proposal_kind ${proposal.proposal_kind} not supported` };
  }

  return { allowed: true, reason: "" };
}
