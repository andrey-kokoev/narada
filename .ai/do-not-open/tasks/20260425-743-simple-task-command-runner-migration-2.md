---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:49:54.569Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:49:54.862Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 743 — Migrate task list to shared command runner

## Goal

Route task list through the reusable direct CLI command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace local result/error/exit handling in task list.
2. Preserve option mapping and output format behavior.
3. Do not change task list service semantics.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task list action calls runDirectCommand.
- [x] task list action has no local console.error/process.exit boilerplate.
- [x] task list still passes range and format options.
