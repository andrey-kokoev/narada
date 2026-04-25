---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:16:18.091Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:16:18.367Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 755 — Migrate evidence mutation commands

## Goal

Route evidence prove-criteria and admit through the shared direct command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task evidence prove-criteria to runDirectCommand.
2. Migrate task evidence admit to runDirectCommand.
3. Preserve by, verification-run, no-run-rationale, format, cwd, and task option mapping.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] evidence prove-criteria action has no local console.error/process.exit boilerplate.
- [x] evidence admit action has no local console.error/process.exit boilerplate.
- [x] Both actions emit only through emitCommandResult via runDirectCommand.
