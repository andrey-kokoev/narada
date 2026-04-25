---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:42.128Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:47:22.814Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:47:24.802Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Add chapter task-spec validation command

## Goal

Structured chapter task specs should be validated by a sanctioned command before chapter init consumes them.

## Context

chapter init --tasks-file now accepts JSON, but there is no CLI inspection/validation surface for that file.

## Required Work

Add a chapter validate-tasks-file command or equivalent; validate shape and count; return bounded JSON; add focused tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:42.128Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] CLI can validate a task specs JSON file
- [x] Count mismatch is reported without writes
- [x] Valid files return normalized summary
- [x] Focused validation tests pass


