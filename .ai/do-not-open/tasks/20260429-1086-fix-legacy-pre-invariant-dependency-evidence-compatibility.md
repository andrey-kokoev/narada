---
status: in_review
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T18:54:37.068Z
criteria_proof_verification:
  state: unbound
  rationale: Final focused task-governance regression suite covers legacy checked-criteria evidence, legacy verification-only evidence, modern provenance enforcement, and SQLite-carried governed closure/report evidence; task recommendation now lists 403 and 1002 as available alternatives rather than dependency-blocked; pnpm verify passed all 8 gates.
closed_at: 2026-04-29T18:47:47.413Z
closed_by: a2
closure_mode: peer_reviewed
reopened_at: 2026-04-29T18:53:36.251Z
reopened_by: builder
---

# Fix legacy pre-invariant dependency evidence compatibility

## Chapter

Task Lifecycle Compatibility

## Goal

Make dependency checks handle pre-invariant closed tasks without forcing unsafe legacy reconciliation cascades, while preserving strict governed provenance for modern terminal tasks.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Pre-invariant closed tasks with checked criteria and material execution or verification evidence can satisfy dependencies without direct lifecycle mutation.
- [x] Modern terminal tasks still require governed provenance and evidence for dependency completion.
- [x] Task recommendation no longer reports tasks 403 and 1002 as dependency-blocked when their prerequisites satisfy the compatibility rule.
- [x] Focused task-governance/recommender tests cover the legacy compatibility path.
- [x] pnpm verify passes.
