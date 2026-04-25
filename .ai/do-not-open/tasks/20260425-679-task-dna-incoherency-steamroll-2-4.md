---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:10.583Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:36:49.413Z
closed_at: 2026-04-25T18:36:55.043Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Separate review verdict admission from lifecycle closure

## Goal

Peer review should admit a verdict artifact; lifecycle closure should be an explicit downstream crossing rather than an implicit side effect hidden inside review.

## Context

Review currently participates directly in closing tasks. That smears checking with admission into or out of lifecycle zones.

## Required Work

Inventory task review closure behavior; introduce or plan a compatibility-safe split between review verdict recording and lifecycle close; make default/help/test semantics explicit; preserve an operator path for accepted review followed by close.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:10.583Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Review behavior is documented as verdict admission versus lifecycle transition
- [x] Any direct close side effect is either removed or explicitly gated
- [x] Tests cover accepted review semantics after the split
- [x] Migration preserves existing operator ability to close reviewed work



