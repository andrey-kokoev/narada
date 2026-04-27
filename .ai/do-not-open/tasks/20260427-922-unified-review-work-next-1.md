---
status: closed
depends_on: []
closed_at: 2026-04-27T01:13:13.214Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 922 — Unified Work Next Review Routing — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`

## Context

The unified `work-next` command could return task work, inbox work, or idle, but tasks awaiting review were still invisible to the unified surface.

## Goal

Add `review_work` as a first-class next-action kind.

## Required Work

1. Add review action kind handling to the command result.
2. Add human formatting for review work.
3. Preserve the existing task and inbox result contracts.

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

Extended `work-next.ts` with `review_work` result formatting and payload shape.

## Verification

Covered by focused `work-next.test.ts`.

## Acceptance Criteria

- [x] `review_work` is emitted as a stable `action_kind`.
- [x] Human output can render review work.
- [x] Existing `task_work`, `inbox_work`, and `idle` behavior remains covered.
