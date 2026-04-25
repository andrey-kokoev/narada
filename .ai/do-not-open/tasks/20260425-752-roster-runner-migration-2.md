---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:11:24.793Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:11:25.163Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 752 — Migrate roster review and completion commands

## Goal

Route roster review, done, and idle through the shared direct command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task roster review to runDirectCommand.
2. Migrate task roster done to runDirectCommand.
3. Migrate task roster idle to runDirectCommand.
4. Preserve strict, allow-incomplete, verbose, cwd, task, and agent option mapping.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] roster review action has no local console.error/process.exit boilerplate.
- [x] roster done action has no local console.error/process.exit boilerplate.
- [x] roster idle action has no local console.error/process.exit boilerplate.
- [x] Each action emits only through emitCommandResult via runDirectCommand.
