---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:16:05.494Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:16:05.792Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 754 — Migrate evidence inspection and listing

## Goal

Route task evidence inspect/list/assert-complete through the shared direct command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task evidence inspect to runDirectCommand.
2. Migrate task evidence list to runDirectCommand.
3. Migrate task evidence assert-complete to runDirectCommand while preserving human default output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] evidence inspect action has no local console.error/process.exit boilerplate.
- [x] evidence list action has no local console.error/process.exit boilerplate.
- [x] evidence assert-complete action has no local exit boilerplate.
- [x] assert-complete keeps human default output.
