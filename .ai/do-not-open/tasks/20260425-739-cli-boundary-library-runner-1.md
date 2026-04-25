---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:45:53.589Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:45:53.950Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 739 — Promote direct command runner to CLI boundary library

## Goal

Move the direct command runner out of main.ts into the reusable CLI command-wrapper library.

## Context

<!-- Context placeholder -->

## Required Work

1. Export runDirectCommand from packages/layers/cli/src/lib/command-wrapper.ts.
2. Keep output emission injected so the helper remains testable and format-agnostic.
3. Keep unexpected errors throwable while normalizing SQLite busy errors.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer defines runDirectCommand.
- [x] main.ts imports runDirectCommand from the CLI boundary library.
- [x] runDirectCommand normalizes SQLITE_BUSY errors through normalizeCommandError.
- [x] runDirectCommand can be unit-tested without process exit.
