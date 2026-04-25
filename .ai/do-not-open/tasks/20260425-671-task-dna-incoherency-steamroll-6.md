---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:03:00.179Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:08:34.836Z
closed_at: 2026-04-25T18:08:39.447Z
closed_by: a2
governed_by: task_close:a2
---

# Split reconciliation observation from finding admission

## Goal

Make reconciliation inspect read-only and move durable finding creation to an explicit record/admit command.

## Context

Current reconcile inspect writes durable findings. That may be useful, but the word inspect creates the same zone confusion that evidence inspect had.

## Required Work

1. Change task reconcile inspect to compute and return findings without writing them. 2. Add task reconcile record or admit command that stores findings explicitly. 3. Keep task reconcile repair consuming recorded findings only. 4. Add tests proving inspect does not write finding rows and record does.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:03:00.179Z: title, goal, context, required work, acceptance criteria, dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] reconcile inspect creates zero reconciliation_finding rows
- [x] reconcile record/admit writes findings with stable IDs
- [x] reconcile repair still requires a recorded finding ID
- [x] range-bound reconciliation remains supported



