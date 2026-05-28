---
status: confirmed
depends_on: [1488]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T03:48:55.511Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T03:48:56.012Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Reconcile Site Registry communication UI plan with relation contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1494-1498-operator-site-communication-relation.md

## Goal

Review the existing Site Registry communication/chat tasks and docs against the Operator Site Communication Relation contract, then record the concrete implementation adjustments needed before UI work proceeds.

## Context

A prior Site Communication Surface chapter planned message composer and site-scope chat features. The new relation contract may require adjustment to naming, receipts, lifecycle display, and capability/trust checks before Builder implementation continues.

## Required Work

1. Inspect existing Site Registry communication surface tasks, docs, fixtures, and Worker/UI code related to messages or chat.
2. Map each planned UI/API element to relation, inbound edge, outbound edge/outbox, remote candidate, receipt, or projection.
3. Identify any planned route, UI label, or schema that would overclaim admission, approval, or target Site authority.
4. Produce a bounded reconciliation note with required implementation changes, compatibility notes, and residual risks.
5. Create follow-up task candidates only if implementation tasks need to be split or reordered.

## Non-Goals

- Do not implement the UI or Worker changes in this task unless the reconciliation finds a trivial docs-only correction.
- Do not publish or deploy Cloudflare resources.
- Do not mutate external Site configuration.

## Execution Notes

- Inspected Site Registry communication docs, relation docs, Worker routes,
  embedded composer/chat UI, Site-scope chat runtime tests, and Worker boundary
  tests.
- Added `docs/product/site-registry-communication-relation-reconciliation-20260518.md`.
- Linked the reconciliation note from
  `docs/product/operator-site-communication-relation.v0.md`.
- Decided no immediate task split is required in this crystallization chapter;
  the note names implementation follow-up candidates for the next Site Registry
  communication implementation chapter.

## Verification

- `rg -n "SiteCommunication|site_communication|site-communications|outbound_communication|delivery_receipt|admission_receipt|recorded_not_delivered|local_admission|remote_preserved|acknowledge|approval|operator" packages/site-registry-cloudflare/src/index.ts packages/site-registry-cloudflare/src/site-scope-chat.ts packages/site-registry-cloudflare/test -g "*.ts"` showed the live send/detail/receipt, embedded UI, chat, and tests.
- `rg -n "relation|inbound edge|outbound edge|receipt|operator acknowledgement|operator approval|remote candidate|local admission|site communication" docs/product/operator-site-communication-relation.v0.md docs/product/site-communication-surface.v0.md docs/product/hosted-message-local-admission-boundary.md docs/product/site-telemetry-hosted-route-storage-contract.v0.md -g "*.md"` confirmed the relevant doctrine surfaces and compatibility routes.
- Manual review checked that admission, approval, acknowledgement, delivery,
  remote preservation, and relation lifecycle labels are explicitly separated in
  the reconciliation note.

## Acceptance Criteria

- [x] A reconciliation note exists and maps communication features to relation components.
- [x] Admission, approval, acknowledgement, delivery, and remote preservation labels are reviewed.
- [x] Any needed implementation follow-ups are named with clear ownership.
- [x] No unresolved authority overclaim remains hidden.
