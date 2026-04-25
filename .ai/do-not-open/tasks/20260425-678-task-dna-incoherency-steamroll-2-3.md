---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:05.609Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:36:38.992Z
closed_at: 2026-04-25T18:36:42.974Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Make task finish a governed close-capable completion path

## Goal

Agents need one canonical completion command that can report, review when requested, admit evidence, close lifecycle, and release roster without manual choreography.

## Context

Prior work exposed the ritual: prove criteria, report, review, evidence admit, close, roster done. task finish should own the governed orchestration without inventing a new lifecycle transition.

## Required Work

Wire task finish --close through existing evidence admit and task close operators; preserve default non-closing behavior; expose close action and blockers in output; add a focused regression test.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:05.609Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task finish --close admits evidence through task evidence admit
- [x] task finish --close closes lifecycle through task close rather than direct mutation
- [x] Default task finish behavior remains compatible
- [x] Focused task-finish regression passes



