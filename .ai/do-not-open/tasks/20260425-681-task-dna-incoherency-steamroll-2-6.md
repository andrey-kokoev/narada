---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:22.111Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:37:11.480Z
closed_at: 2026-04-25T18:37:16.088Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Make reconciliation finding IDs deterministic

## Goal

The same reconciliation defect should produce the same finding identifier across repeated inspections and records.

## Context

Current reconciliation finding IDs include wall clock time and random suffixes. That makes findings hard to diff, repair, reconcile, and reference.

## Required Work

Replace runtime-random finding ID generation with deterministic IDs derived from finding kind, task number, and stable mismatch identity; preserve repair IDs if they represent application events; add or update focused tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:22.111Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Repeated reconcile inspect over the same state returns identical finding IDs
- [x] Distinct finding kinds or task numbers do not collide
- [x] Recorded findings can be re-recorded idempotently
- [x] Focused reconciliation tests pass



