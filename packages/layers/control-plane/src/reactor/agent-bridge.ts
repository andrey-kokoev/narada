/**
 * Agent Reactor Bridge
 *
 * Boundary for Option-2 reactors: an external agent runtime evaluates facts
 * against a charter and submits a ReactorOutput back to the control plane.
 *
 * The bridge does not execute the agent. It only validates that the submitted
 * output is well-formed and bounded by the charter's allowed proposal kinds.
 */

import type {
  Reactor,
  ReactorCharter,
  ReactorInput,
  ReactorOutput,
  ReactorProposalKind,
  ReactorConfidence,
} from "./types.js";

export interface AgentReactorRuntime {
  /** Submit a context to the external agent runtime for evaluation */
  submit(input: ReactorInput): Promise<unknown>;
  /** Poll or await the external runtime's output */
  collect(submissionRef: unknown): Promise<ReactorOutput>;
}

export interface AgentReactorBridgeOptions {
  reactor_id: string;
  runtime: AgentReactorRuntime;
}

export class AgentReactorBridge implements Reactor {
  constructor(private readonly opts: AgentReactorBridgeOptions) {}

  get reactor_id(): string {
    return this.opts.reactor_id;
  }

  async evaluate(input: ReactorInput): Promise<ReactorOutput> {
    const rawSubmission = await this.opts.runtime.submit(input);
    const output = await this.opts.runtime.collect(rawSubmission);
    return validateAgentOutput(output, input.charter, input.reactor_id);
  }
}

function validateAgentOutput(
  output: ReactorOutput,
  charter: ReactorCharter,
  reactorId: string,
): ReactorOutput {
  if (output.reactor_id !== reactorId) {
    throw new Error(`Agent reactor output reactor_id mismatch: ${output.reactor_id} !== ${reactorId}`);
  }
  if (output.charter_id !== charter.charter_id) {
    throw new Error(`Agent reactor output charter_id mismatch: ${output.charter_id} !== ${charter.charter_id}`);
  }

  const allowedKinds = new Set<ReactorProposalKind>(charter.allowed_proposal_kinds);
  for (const proposal of output.proposals) {
    if (!allowedKinds.has(proposal.proposal_kind)) {
      throw new Error(
        `Agent reactor proposed disallowed kind ${proposal.proposal_kind}; allowed: ${[...allowedKinds].join(", ")}`,
      );
    }
  }

  const confidenceFloor = charter.confidence_floor;
  if (confidenceFloor && confidenceRank(output.confidence.overall) < confidenceRank(confidenceFloor)) {
    return {
      ...output,
      outcome: "escalate",
      summary: `${output.summary}; confidence ${output.confidence.overall} below floor ${confidenceFloor}`,
    };
  }

  return output;
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
