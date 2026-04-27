---
status: opened
depends_on: [994]
amended_by: architect
amended_at: 2026-04-27T21:49:39.824Z
---

# Emit inbox mutation evidence

## Chapter

canonical-mutation-evidence-implementation

## Goal

Make inbox mutating commands emit canonical mutation evidence records and align exported envelopes with the same operation-evidence posture.

## Context

Inbox already has exported envelope artifacts, but status transitions and promotions still need an explicit mutation-evidence reading. This brings inbox closer to the canonical mutation evidence model without weakening the inert-envelope invariant.

## Required Work

1. Route inbox mutating commands through a shared mutation-evidence writer.
2. Cover submit, claim, release, triage, pending, promote, task promotion, import, and archive-producing flows.
3. Record envelope id, previous status, next status, principal, command, promotion target, and read-back confirmation.
4. Clarify import/replay posture so imported evidence is not double-counted as a new mutation.
5. Add focused tests for submit, archive, pending crossing, and task promotion.

## Non-Goals

- Do not make inbox envelopes executable by submission alone.
- Do not remove exported envelopes.
- Do not implement full task lifecycle evidence replay here.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Submit, claim, release, triage, pending, promote, task, import, and archive-producing flows emit evidence records or are classified as import/replay.
- [ ] Evidence records identify envelope id, previous status, next status, principal, command, promotion target, and read-back confirmation.
- [ ] Import/replay does not fabricate new mutation authority.
- [ ] Focused tests cover submit, triage archive, pending crossing, and task promotion.
- [ ] `pnpm verify` passes.
