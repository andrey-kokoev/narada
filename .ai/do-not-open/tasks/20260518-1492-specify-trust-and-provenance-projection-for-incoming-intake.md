---
status: confirmed
depends_on: [1489]
amended_by: narada.builder
amended_at: 2026-05-18T02:21:49.875Z
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T02:22:21.474Z
criteria_proof_verification:
  state: unbound
  rationale: Doctrine task verified by git diff --check and rg vocabulary/cross-link checks recorded in .ai/handoffs/task-1492-report.json.
closed_at: 2026-05-18T02:23:22.035Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: peer_reviewed
---

# Specify trust and provenance projection for incoming intake

## Goal

Define how incoming intake surfaces expose trust/provenance posture as evidence without making trust a mutation authority or separate admission owner.

## Context

Verifiable Envelope Trust doctrine exists, but ordinary incoming intake does not consistently expose trust posture. Trust should attach to edges, candidates, envelopes, and decisions as evidence/projection, not as a competing lifecycle authority.

## Required Work

1. Specify trust/provenance fields or projections for Intake Edge, Remote Candidate, Canonical Inbox envelope, and Admission/Rejection Ledger entries.
2. Use existing trust vocabulary: verified, unverified, failed, expired, revoked, unknown, not_signed, encrypted_unreadable, decrypted_verified.
3. Define which surfaces should show trust posture by default without exposing cryptographic material.
4. State that signature verification is evidence and does not grant admission, capability, task mutation, or operator authority.

## Non-Goals

- Do not choose a cryptographic substrate.
- Do not implement signing, encryption, key storage, or verification commands.
- Do not require all current local envelopes to be signed.

## Execution Notes

- Amended by narada.builder at 2026-05-18T02:21:49.875Z: title, goal, context, required work, non-goals, acceptance criteria
- Added `docs/product/incoming-intake-trust-provenance-projection.md` defining trust/provenance projection as evidence rather than admission, lifecycle, capability, task, operator, knowledge, Site relation, or effect authority.
- Specified attachment points for `IncomingMessageIntakeEdge`, Remote Candidate Exchange, Canonical Inbox envelopes, and Canonical Admission Rejection Ledger entries.
- Cross-linked the projection from the affected intake, candidate, inbox, ledger, hosted-boundary, and Verifiable Envelope Trust docs.

## Verification

- `git diff --check -- docs/product/incoming-intake-trust-provenance-projection.md docs/product/incoming-message-intake-edge.md docs/product/remote-candidate-exchange.v0.md docs/concepts/canonical-inbox.md docs/concepts/canonical-admission-rejection-ledger.md docs/product/hosted-message-local-admission-boundary.md docs/concepts/verifiable-envelope-trust.md` passed; only existing LF/CRLF working-copy warnings were emitted.
- `rg "verified|unverified|failed|expired|revoked|unknown|not_signed|encrypted_unreadable|decrypted_verified|Incoming Intake Trust" docs/product/incoming-intake-trust-provenance-projection.md docs/product/incoming-message-intake-edge.md docs/product/remote-candidate-exchange.v0.md docs/concepts/canonical-inbox.md docs/concepts/canonical-admission-rejection-ledger.md docs/product/hosted-message-local-admission-boundary.md docs/concepts/verifiable-envelope-trust.md` passed; vocabulary and cross-links are present.

## Acceptance Criteria

- [x] Trust is defined as evidence/projection, not lifecycle authority.
- [x] Trust vocabulary aligns with Verifiable Envelope Trust doctrine.
- [x] Affected intake artifacts have clear trust/provenance attachment points.
- [x] Raw cryptographic material remains excluded from default displays.
