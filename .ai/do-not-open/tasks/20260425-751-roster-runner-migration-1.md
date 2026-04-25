---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:11:10.675Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:11:11.205Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 751 — Migrate roster observation and assignment commands

## Goal

Route roster show and assign through the shared direct command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task roster show to runDirectCommand.
2. Migrate task roster assign to runDirectCommand.
3. Preserve cwd, agent, no-claim, verbose, and format mapping.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] roster show action has no local console.error/process.exit boilerplate.
- [x] roster assign action has no local console.error/process.exit boilerplate.
- [x] Both actions emit only through emitCommandResult via runDirectCommand.
