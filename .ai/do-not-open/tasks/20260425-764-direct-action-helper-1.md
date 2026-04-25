---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:48:33.336Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:48:33.445Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 764 — Add direct command action helper

## Goal

Reduce repeated commander action boilerplate while preserving the shared direct-command output/error boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a helper that adapts Commander action arguments to runDirectCommand.
2. Support static or argument-derived output format selection.
3. Keep runDirectCommand behavior unchanged.
4. Add focused unit coverage for the helper.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The helper emits successful command results through the supplied emitter.
- [x] The helper exits with the service exit code for nonzero command results.
- [x] The helper can derive format from action arguments.
- [x] Existing runDirectCommand and resource-scoped runner tests continue to pass.
