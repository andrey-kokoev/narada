---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:28:54.128Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:28:54.417Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 731 — Normalize SQLite busy failures at CLI boundary

## Goal

Prevent raw better-sqlite3 SQLITE_BUSY stack traces from reaching the operator during sanctioned task commands.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a narrow CLI error normalization path for SQLite busy/locked errors.
2. Return a terse actionable operator message and non-zero exit code.
3. Preserve detailed stack traces for non-SQLite or unexpected failures.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] SQLITE_BUSY errors are rendered as a concise command contention message.
- [x] The message recommends retrying or avoiding parallel lifecycle writes.
- [x] Non-SQLite errors continue to use the existing error path.
- [x] Focused tests cover the normalization behavior.
