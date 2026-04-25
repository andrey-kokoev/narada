---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:46:24.062Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:46:24.348Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 741 — Migrate next direct task command batch

## Goal

Use the library runner for another bounded batch of task commands with duplicated result/error/exit handling.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task allocate to runDirectCommand.
2. Migrate task amend to runDirectCommand.
3. Migrate task derive-from-finding to runDirectCommand.
4. Preserve each command's option mapping and format behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task allocate action has no local console.error/process.exit boilerplate.
- [x] task amend action has no local console.error/process.exit boilerplate.
- [x] task derive-from-finding action has no local console.error/process.exit boilerplate.
- [x] CLI typecheck and build pass.
- [x] Chapter 739-741 is evidence-complete and committed.
