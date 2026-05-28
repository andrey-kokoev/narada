# Incoming Intake Trust And Provenance Projection

Incoming intake surfaces should expose trust and provenance posture as evidence
attached to the artifact being inspected. Trust is not a new queue, admission
owner, or lifecycle authority.

## Rule

```text
Trust verifies or qualifies arrival evidence.
It does not admit consequence.
Local authority still decides mutation.
```

A signature, verification result, transport authentication result, forwarding
chain, or decryption posture may help a Site decide what to do with an
arrival. It never grants inbox admission, task lifecycle mutation, capability
consent, operator authority, knowledge authorship, Site relation activation, or
effect execution.

## Vocabulary

Incoming intake projections use the Verifiable Envelope Trust status
vocabulary:

| Status | Meaning |
| --- | --- |
| `verified` | Authenticity and integrity checks passed under the receiving locus trust policy. |
| `unverified` | The arrival carries trust material, but verification has not been completed. |
| `failed` | Verification was attempted and failed. |
| `expired` | Verification would otherwise fit, but signing material, policy, or freshness has expired. |
| `revoked` | Verification depends on revoked signing or trust material. |
| `unknown` | The receiving locus has no current basis to classify trust posture. |
| `not_signed` | No signature or equivalent provenance proof was supplied. |
| `encrypted_unreadable` | The arrival is encrypted and cannot currently be read by the receiving locus. |
| `decrypted_verified` | The arrival was decrypted and verified for the receiving locus. |

`unknown` and `not_signed` are routine postures for current local envelopes and
legacy submissions. This projection does not require all local envelopes to be
signed.

## Attachment Points

### Incoming Message Intake Edge

`IncomingMessageIntakeEdge` should expose trust posture for the configured path,
not for the target artifact's consequence decision.

Recommended projection fields:

| Field | Meaning |
| --- | --- |
| `trust_posture.verification_status` | One trust vocabulary status for the edge's current route policy or last bounded check. |
| `trust_posture.policy_ref` | Receiver-local trust policy reference, when configured. |
| `trust_posture.source_identity` | Claimed and, when available, verified source Site/principal/surface identity. |
| `trust_posture.transport_authentication` | Bounded posture for token, mTLS, signed webhook, mailbox auth, local CLI principal, or equivalent transport evidence. |
| `trust_posture.freshness` | Replay/freshness posture for arrivals on the edge. |
| `trust_posture.last_verified_at` | Time of the last verification or trust-policy check. |
| `trust_posture.evidence_refs` | Redacted refs to doctor, receipt, policy, key, or verification evidence. |
| `provenance.source_surface` | Surface family and source coordinate for the configured path. |
| `provenance.forwarding_chain` | Bounded relay summaries when material is forwarded before arrival. |

The edge may become `degraded` or `suspended` because verification is failing,
expired, revoked, or unreadable. That state remains an edge health projection;
it does not reject pending candidates or mutate target artifacts without a
local decision.

### Remote Candidate Exchange

Remote candidates should preserve the trust posture supplied by the submitter
and the posture observed by the remote surface as candidate evidence.

Recommended message or projection fields:

| Field | Meaning |
| --- | --- |
| `trust.verification_status` | Current status known to the preserving surface or target Site projection. |
| `trust.claimed_source` | Claimed source Site, principal, route, and surface. |
| `trust.verified_source` | Verified source coordinates, when verification succeeded. |
| `trust.envelope_digest` | Digest reference for the candidate body or canonical candidate projection. |
| `trust.forwarding_chain` | Ordered bounded forwarding records. |
| `trust.verification_evidence_refs` | Redacted references to verification, policy, and key evidence. |
| `trust.display_summary` | Human-bounded status summary for pending/detail/receipt views. |
| `provenance.submitted_at` | Sender preparation/submission time. |
| `provenance.received_at` | Remote preservation time. |
| `provenance.surface_id` | Hosted or remote surface that preserved the candidate. |
| `provenance.intake_edge_ref` | Edge that delivered or exposed the candidate, when known. |

Remote Candidate Exchange remains candidate-only. A `verified` or
`decrypted_verified` candidate may still be rejected, deferred, or require
manual review. An `encrypted_unreadable` candidate must not be locally admitted
as if its payload had been inspected.

### Canonical Inbox Envelope

Canonical Inbox envelopes may carry an optional `trust` block compatible with
Verifiable Envelope Trust fields:

| Field | Meaning |
| --- | --- |
| `trust.envelope_digest` | Stable digest over the canonical envelope body. |
| `trust.signing_principal` | Principal that signed or is claimed to have signed. |
| `trust.signing_site` | Site/locus associated with the signing context. |
| `trust.signed_at` | Signing time, when present. |
| `trust.forwarding_chain` | Bounded forwarding records. |
| `trust.encryption` | Confidentiality metadata without raw secrets. |
| `trust.verification_status` | One trust vocabulary status under the receiving locus posture. |
| `trust.verification_evidence` | Redacted policy, key, command, or receipt references. |
| `provenance.intake_edge_ref` | Edge or source path that admitted the inert envelope. |
| `provenance.source_candidate_ref` | Remote candidate, file-drop item, webhook event, mailbox fact, or CLI/MCP source ref. |

The envelope remains inert. A signed inbox envelope is still only an envelope
until a governed promotion admits a consequence.

### Admission Rejection Ledger

The ledger should snapshot candidate trust posture when recording local
decisions. The snapshot explains what was known at decision time; it is not the
decision authority by itself.

Recommended decision fields:

| Field | Meaning |
| --- | --- |
| `candidate_trust.verification_status` | Trust status considered for the candidate. |
| `candidate_trust.policy_ref` | Receiver-local trust policy used or missing. |
| `candidate_trust.source_identity` | Claimed and verified source summary. |
| `candidate_trust.evidence_refs` | Redacted verification or refusal evidence refs. |
| `candidate_trust.reason_codes` | Trust-specific reason codes such as `trust_failed`, `trust_expired`, `trust_revoked`, `encrypted_unreadable`, or `unsigned_not_allowed`. |
| `candidate_provenance.source_surface` | Source surface and route posture. |
| `candidate_provenance.source_candidate_ref` | Remote candidate, envelope, file-drop item, webhook event, mailbox fact, or other source ref. |
| `candidate_provenance.forwarding_chain` | Bounded forwarding summary. |

Local policy may use trust posture as one input to an admitted, rejected,
deferred, superseded, or error decision. The ledger entry must record the local
decision and its authority separately from the trust evidence.

## Default Displays

Default operator and agent surfaces should show concise trust posture without
cryptographic material:

| Surface | Default trust/provenance display |
| --- | --- |
| `narada inbox list`, `inbox show`, `inbox work-next` | `trust.verification_status`, source Site/principal summary, signed/decrypted posture, policy/evidence refs, and source candidate ref. |
| `narada inbox doctor` | Edge trust policy configured/missing, route verification state, last verification time, and bounded next repair/admission step. |
| Remote candidate pending/detail/receipt | Candidate trust status, claimed/verified source, forwarding summary, receipt status, and local-admission-required notice. |
| Intake edge doctor/readiness | Edge lifecycle state plus trust policy, source identity, transport authentication posture, freshness, and redacted evidence refs. |
| Admission ledger list/explain | Candidate trust snapshot, trust-related reason codes, local decision, deciding authority, and evidence refs. |
| Work-next surfaces | Trust posture as routing context only; no automatic promotion, claim, or task mutation from trust status alone. |

Default displays must not expose:

- raw signatures or cryptographic proofs;
- private keys, seed material, bearer tokens, refresh tokens, API keys, or raw
  credential values;
- decrypted payloads that are not otherwise authorized for the display;
- raw certificate chains or key records;
- full verification logs that may contain secret or payload material.

Those values belong only behind explicit diagnostic, export, or forensic
postures with their own capability and output policy.

## Authority Limits

Trust/provenance projection must state these non-authority claims:

- signature verification is evidence, not admission;
- decryption is evidence of readability/confidentiality handling, not
  consequence;
- transport authentication is route evidence, not capability consent;
- a verified source principal is not an operator authority unless the target
  crossing regime says so;
- a verified candidate cannot mutate task lifecycle, knowledge, Site config,
  relation lifecycle, capability registry, inbox routing, or effect execution
  without the target authority's governed command;
- failed, expired, revoked, or unreadable trust posture should be recorded as
  rejection, deferral, suspension, or incident evidence instead of disappearing
  by silence.

## Relationship To Existing Doctrine

| Doctrine | Relationship |
| --- | --- |
| [Verifiable Envelope Trust](../concepts/verifiable-envelope-trust.md) | Supplies the trust vocabulary and evidence-not-authority doctrine. |
| [Incoming Message Intake Edge](incoming-message-intake-edge.md) | Edge-level trust posture covers reachability, route authentication, freshness, and source evidence. |
| [Remote Candidate Exchange](remote-candidate-exchange.v0.md) | Remote candidates preserve trust/provenance evidence while awaiting local target-Site admission. |
| [Canonical Inbox](../concepts/canonical-inbox.md) | Local envelopes may carry trust metadata but remain inert until promotion. |
| [Canonical Admission Rejection Ledger](../concepts/canonical-admission-rejection-ledger.md) | Decisions snapshot trust posture and reason codes without making trust the decision authority. |
| [Hosted Message Local Admission Boundary](hosted-message-local-admission-boundary.md) | Pull/admit/finalize flows carry trust evidence through descriptor-only planning and local decisions. |

## Implementation Boundary

This doctrine does not choose a cryptographic substrate and does not implement
signing, encryption, key storage, verification commands, or mandatory signing
for current local envelopes. Those are future implementation tasks after an
operating case forces the specific substrate and capability posture.
