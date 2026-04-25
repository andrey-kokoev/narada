---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:33:54.715Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:33:55.084Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 733 — Introduce direct CLI command admission runner

## Goal

Replace ad hoc direct command result/error/exit handling with one reusable runner for commands that are not yet using wrapCommand.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a direct command runner near CLI registration that emits through the canonical output admission function.
2. Route thrown SQLite busy errors through the existing normalization path.
3. Use one consistent exit behavior for success and failure results.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The helper emits command results only through emitCommandResult.
- [x] The helper normalizes SQLITE_BUSY errors before exit.
- [x] The helper preserves thrown unexpected errors for the existing uncaught path.
- [x] Typecheck covers the helper.
