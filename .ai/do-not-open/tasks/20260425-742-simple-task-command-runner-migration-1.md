---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:49:41.490Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:49:41.788Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 742 — Migrate task lint to shared command runner

## Goal

Route task lint through the reusable direct CLI command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace local result/error/exit handling in task lint.
2. Preserve option mapping and output format behavior.
3. Do not change lint command service semantics.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task lint action calls runDirectCommand.
- [x] task lint action has no local console.error/process.exit boilerplate.
- [x] task lint still passes format and chapter options.
