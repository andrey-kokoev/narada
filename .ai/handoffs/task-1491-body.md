# Specify hosted message pull and finalize local admission boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1488-1493-incoming-message-intake-edge-coherence.md

## Goal

Define the target-Site pull/admit/finalize boundary for hosted Site Communication and Remote Candidate Exchange without treating remote preservation as local admission.

## Context

Hosted registry message APIs preserve pending candidates and receipts. The target Site still needs a local puller/admission path that maps remote candidates to local inbox admission, rejection, deferral, or error evidence, then finalizes the remote receipt.

## Required Work

1. Specify the local pull/admit/finalize flow from Remote Candidate Exchange to Canonical Inbox or Admission/Rejection Ledger.
2. Define descriptor-only local admission plan semantics for `target_authority=canonical_inbox`.
3. Define finalization evidence requirements for admitted, rejected, deferred, expired, superseded, and error outcomes.
4. Keep submit, poll, read, finalize, and admin capabilities separate.
5. Identify compatibility mapping for existing `/api/messages` routes without requiring route renames.

## Non-Goals

- Do not deploy or mutate hosted Cloudflare state.
- Do not implement network pullers.
- Do not rename existing hosted routes.

## Execution Notes

Added `docs/product/hosted-message-local-admission-boundary.md`.

The doctrine defines:

- the target-Site pull/admit/finalize sequence from remote candidate preservation to local Canonical Inbox or Admission Rejection Ledger evidence;
- descriptor-only local admission plan semantics for `target_authority=canonical_inbox`, including `descriptor_only=true`, `db_mutated=false`, and `envelope_written=false` before local admission;
- local decision mapping for `admitted`, `rejected`, `deferred`, `expired`, `superseded`, and `error`;
- finalization evidence requirements for each outcome;
- strict separation of submit, poll, read/detail/receipt, finalize, and admin capabilities;
- compatibility mapping for existing `/api/messages` routes without renaming them.

Cross-linked the new doctrine from:

- `docs/product/remote-candidate-exchange.v0.md`
- `docs/product/site-communication-surface.v0.md`
- `docs/product/site-telemetry-hosted-route-storage-contract.v0.md`
- `docs/product/incoming-message-intake-edge.md`

No hosted Cloudflare state was deployed or mutated. No network puller was implemented. Existing hosted route names were preserved.

## Verification

- Read `docs/product/remote-candidate-exchange.v0.md`, `docs/product/site-communication-surface.v0.md`, `docs/product/site-telemetry-hosted-route-storage-contract.v0.md`, `packages/site-inbox/test/remote-exchange.test.ts`, and hosted route implementation references in `packages/site-registry-cloudflare/src/index.ts`.
- Ran `git diff --check -- docs\product\hosted-message-local-admission-boundary.md docs\product\remote-candidate-exchange.v0.md docs\product\site-communication-surface.v0.md docs\product\site-telemetry-hosted-route-storage-contract.v0.md docs\product\incoming-message-intake-edge.md`; no whitespace errors were reported. Git emitted line-ending warnings for existing markdown files.
- Ran `rg -n "Remote preservation, local admission|Descriptor-Only Local Admission Plan|Local Decisions|Finalization Payload|Capability Separation|Existing Route Compatibility|POST /api/messages|GET /api/messages/pending|finalize|admitted|rejected|deferred|expired|superseded|error" docs\product\hosted-message-local-admission-boundary.md`; confirmed required flow, plan semantics, outcomes, capabilities, and route compatibility are present.
- Ran `Select-String` across linked docs for `hosted-message-local-admission-boundary`; confirmed cross-links are present.

## Acceptance Criteria

- [x] Remote preservation, local admission, and finalization are separate states.
- [x] Local decisions map to Canonical Inbox or Admission/Rejection Ledger.
- [x] Capability separation is explicit.
- [x] Existing hosted route compatibility is preserved.
