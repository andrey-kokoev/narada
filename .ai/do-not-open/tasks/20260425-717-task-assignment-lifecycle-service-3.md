---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:23:30.584Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:23:32.614Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 717 — Extract Task Release Service and Document Assignment Lifecycle Service Boundary

## Goal

Move task release semantics into @narada2/task-governance and document the resulting assignment lifecycle service boundary.

## Context

Release completes the first assignment-lifecycle extraction chapter. The end state should make claim, continue, and release package-owned, with CLI commands acting as adapters.

## Required Work

1. Inspect task-release.ts and identify release reason, lifecycle, assignment, roster, and continuation packet semantics currently command-owned.
2. Extend the assignment lifecycle package service to own release behavior and expose stable service entrypoints.
3. Refactor task-release.ts to an adapter over the package service.
4. Add package-level tests for normal release, budget_exhausted continuation packet behavior, completed/abandoned/superseded/transferred reasons, and invalid release rejection.
5. Update task service extraction rails or package README with the assignment lifecycle boundary now extracted and any residual seams discovered.
6. Run chapter-level verification and reconcile/evidence checks before commit.

## Non-Goals

- Do not extract report/review/finish in this chapter.
- Do not change lifecycle vocabulary.
- Do not create new direct markdown task editing paths.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Release semantics are package-owned and not CLI-owned.
- [x] task-release.ts is a thin adapter over the package service.
- [x] Package tests cover release reason outcomes and continuation packet behavior.
- [x] Documentation names claim/continue/release as extracted or records exact residuals if any bounded seam remains.
- [x] pnpm verify passes.
- [x] Task evidence and reconciliation checks for this chapter are clean.


