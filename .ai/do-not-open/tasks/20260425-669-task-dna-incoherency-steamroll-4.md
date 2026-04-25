---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:02:49.124Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:09:47.963Z
closed_at: 2026-04-25T18:09:52.711Z
closed_by: a2
governed_by: task_close:a2
---

# Expose task command zone ownership in CLI help

## Goal

Make task command help explain which zone each command belongs to and which authority mutation it may perform.

## Context

Command names hide zone crossings. Operators and agents should see whether they are reading, admitting evidence, reviewing, or transitioning lifecycle before running the command.

## Required Work

1. Update task command descriptions for create/amend/evidence/review/close/reconcile/roster/claim/report. 2. Ensure help distinguishes inspect from admit/repair/transition. 3. Link or summarize the task command zone taxonomy in help text where practical. 4. Add tests or snapshot checks for the most important help strings if existing help tests cover this surface.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:02:49.124Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task evidence help names inspect admit prove-criteria and list with correct zone semantics
- [x] task reconcile help distinguishes inspect from repair
- [x] task close help states it consumes admitted evidence
- [x] task amend help states spec-only mutation



