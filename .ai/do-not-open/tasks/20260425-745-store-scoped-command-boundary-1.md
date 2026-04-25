---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:01:16.249Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:01:16.538Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 745 — Introduce store-scoped direct command runner

## Goal

Centralize resource lifetime for direct CLI commands that need a task lifecycle store.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a reusable resource-scoped direct runner in the CLI boundary library.
2. Ensure it always closes the resource on success, command failure, and normalized SQLite busy errors.
3. Keep it generic so the CLI boundary library does not depend on task governance store types.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The runner opens a resource, passes it to the invocation, and closes it in a finally path.
- [x] The runner reuses runDirectCommand result/error/exit semantics.
- [x] The runner is unit-tested for resource closure.
- [x] The runner does not import task lifecycle store types.
