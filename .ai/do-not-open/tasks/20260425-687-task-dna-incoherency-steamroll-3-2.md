---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:25.824Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:46:35.203Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:46:36.592Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Reconcile null closure modes on existing terminal rows

## Goal

Terminal lifecycle rows with null closure_mode must become visible reconciliation findings and repairable records.

## Context

closure_mode was introduced after many rows already existed. Null terminal modes create a silent semantic gap.

## Required Work

Detect closed or confirmed lifecycle rows with null closure_mode; infer a conservative mode from governed_by where possible; add a repair action; test detection and repair.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:25.824Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Reconcile inspect reports null closure_mode for terminal tasks
- [x] Repair backfills inferred closure_mode
- [x] Repair records changed surfaces and verification
- [x] Focused reconcile test passes


