---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T01:27:14.007Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T01:27:14.142Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 770 — Add resource-scoped command action helper

## Goal

Reduce repeated resource-scoped command registration boilerplate without changing runDirectCommandWithResource semantics.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a helper that adapts Commander action arguments to runDirectCommandWithResource.
2. Support argument-derived output format selection.
3. Preserve guaranteed resource close behavior on success, normalized SQLite busy failures, and unexpected errors.
4. Add focused command-wrapper tests for the helper.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The helper invokes the supplied resource-scoped command with Commander action arguments.
- [x] The helper emits through the supplied output emitter.
- [x] The helper closes resources after success and failure.
- [x] Existing command-wrapper tests continue to pass.
