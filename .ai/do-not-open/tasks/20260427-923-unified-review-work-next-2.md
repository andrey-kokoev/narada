---
status: closed
depends_on: []
closed_at: 2026-04-27T01:13:14.627Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 923 — Unified Work Next Review Routing — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/task-governance/src/task-governance.ts`
- `packages/layers/cli/src/commands/work-next.ts`

## Context

Review discovery must observe task state without crossing the review boundary or mutating lifecycle state.

## Goal

Find reviewable `in_review` tasks for the requesting agent.

## Required Work

1. Scan task files for candidate tasks.
2. Prefer SQLite lifecycle status when available.
3. Skip tasks already reviewed by the same agent.
4. Skip tasks reported by the same agent when report metadata exists.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Added `findReviewWork()` using task scan plus SQLite lifecycle, reports, and reviews.

## Verification

Typecheck and focused tests passed.

## Acceptance Criteria

- [x] Review discovery is read-only.
- [x] SQLite lifecycle status is preferred when available.
- [x] Previously reviewed tasks are skipped for that reviewer.
