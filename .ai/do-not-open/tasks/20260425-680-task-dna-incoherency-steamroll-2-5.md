---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:15.346Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:37:01.484Z
closed_at: 2026-04-25T18:37:06.070Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Add explicit task closure modes

## Goal

Task closure must record which authority path closed the task instead of collapsing operator direct close, peer reviewed close, and emergency close into one status change.

## Context

A single closed status is not enough to explain the crossing regime that admitted the task into terminal lifecycle state.

## Required Work

Define closure mode vocabulary; thread mode through task close result and durable metadata; infer mode from admitted evidence or explicit operator input where safe; update help/tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:15.346Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task close exposes a closure mode in JSON result
- [x] Closure mode is durable enough for evidence and reconciliation to inspect
- [x] Default mode preserves existing command compatibility
- [x] Tests cover at least direct and reviewed closure modes



