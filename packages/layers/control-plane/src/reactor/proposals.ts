/**
 * Reactor Proposal Materialization
 *
 * Converts approved reactor proposals into durable inbox envelopes. The
 * resulting envelope is inert until an authority admits it.
 */

import type { ReactorProposal, ReactorOutput } from "./types.js";
import type { InboxEnvelope, CreateInboxEnvelopeOptions } from "../inbox/types.js";
import { createInboxEnvelope } from "../inbox/types.js";

export interface MaterializeProposalOptions {
  /** Optional explicit envelope_id; otherwise derived from proposal_id */
  envelopeId?: string;
  /** Optional target locus for routing */
  targetLocus?: string;
}

/**
 * Materialize a single reactor proposal into an inbox envelope.
 *
 * The envelope status is `received`. It must still be admitted by an authority
 * before it can become an intent or outbound effect.
 */
export function materializeProposal(
  output: ReactorOutput,
  proposal: ReactorProposal,
  opts: MaterializeProposalOptions = {},
): InboxEnvelope<unknown> {
  const payload = parsePayload(proposal.payload_json);

  const sourceRef = {
    kind: proposal.source_kind,
    ref: proposal.source_ref,
  };

  const options: CreateInboxEnvelopeOptions<unknown> = {
    envelope_id: opts.envelopeId ?? `env_${proposal.proposal_id}`,
    received_at: output.evaluated_at,
    source: sourceRef,
    ...(opts.targetLocus ? { target_locus: opts.targetLocus } : {}),
    kind: proposal.envelope_kind,
    authority: {
      level: proposal.authority_level,
      principal: output.reactor_id,
      evidence_ref: proposal.source_ref,
    },
    payload,
  };

  return createInboxEnvelope(options);
}

/**
 * Materialize all approved proposals from a reactor output.
 */
export function materializeApprovedProposals(
  output: ReactorOutput,
  opts: MaterializeProposalOptions = {},
): InboxEnvelope<unknown>[] {
  return output.proposals.map((proposal) => materializeProposal(output, proposal, opts));
}

function parsePayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return { raw_json: payloadJson, parse_error: true };
  }
}
