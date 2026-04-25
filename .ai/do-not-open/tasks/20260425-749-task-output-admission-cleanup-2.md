---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:05:30.302Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:05:30.829Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 749 — Migrate object-printing task commands

## Goal

Route simple task commands that printed result objects directly through shared CLI output admission.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task promote-recommendation to runDirectCommand.
2. Migrate task graph to runDirectCommand.
3. Migrate task reopen to runDirectCommand.
4. Migrate task confirm to runDirectCommand.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task promote-recommendation no longer calls console.log(result.result).
- [x] task graph no longer calls console.log(result.result).
- [x] task reopen no longer calls console.log(result.result).
- [x] task confirm no longer hand-rolls json/human output.
