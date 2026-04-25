---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:45.997Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:38:04.413Z
closed_at: 2026-04-25T18:38:08.528Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Make chapter init produce pressure-intent tasks

## Goal

chapter init should be able to create detailed pressure-intent tasks, not only generic TBD placeholders that require immediate manual cleanup.

## Context

Generic placeholder task creation is incoherent with Narada becoming discipline: task artifacts should carry executable pressure at birth when the operator already knows the work.

## Required Work

Add a structured input path for chapter init to receive task specifications; validate count and task details; use those specifications when creating child tasks; preserve placeholder mode only as an explicit fallback.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:45.997Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] chapter init can create child tasks from structured detailed specs
- [x] Spec count mismatch fails before writing files
- [x] Generated child tasks include concrete goal required work and criteria
- [x] Existing simple chapter init behavior remains available



