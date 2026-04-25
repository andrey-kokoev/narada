---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:01:12.137Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:01:13.923Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 703 — Move criteria proof state toward SQLite authority

## Goal

Criteria proof should be queryable from SQLite authority rather than only visible as checked markdown projection.

## Context

prove-criteria still checks boxes in markdown projection even though task specs and evidence admission are SQLite-backed.

## Required Work

1. Persist criteria proof metadata in SQLite authority.
2. Keep markdown checkbox projection as compatibility output.
3. Make evidence inspection prefer admitted/proved criteria state from SQLite.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Criteria proof metadata is persisted in SQLite.
- [x] Markdown checkbox mutation is compatibility projection only.
- [x] Evidence inspection can observe proof state without trusting raw markdown checkboxes.


