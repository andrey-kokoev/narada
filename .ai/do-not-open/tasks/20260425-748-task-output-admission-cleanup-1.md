---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:05:16.692Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:05:16.983Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 748 — Remove task create store leak

## Goal

Stop opening an unused task lifecycle store in the task create CLI action.

## Context

<!-- Context placeholder -->

## Required Work

1. Remove the openTaskLifecycleStore call from task create in main.ts.
2. Let taskCreateCommand remain the owner of its own store lifecycle.
3. Route task create through runDirectCommand for result/error/exit handling.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task create action does not open a lifecycle store in main.ts.
- [x] task create action calls runDirectCommand.
- [x] task create still passes title, goal, chapter, dependencies, criteria, number, dry-run, from-file, format, and cwd options.
