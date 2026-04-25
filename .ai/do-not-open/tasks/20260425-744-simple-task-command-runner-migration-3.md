---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:50:08.204Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:50:08.567Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 744 — Migrate task read to shared command runner

## Goal

Route task read through the reusable direct CLI command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace local result/error/exit handling in task read.
2. Preserve option mapping and output format behavior.
3. Run focused command-wrapper tests, CLI typecheck, CLI build, chapter assertion, and full verification.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task read action calls runDirectCommand.
- [x] task read action has no local console.error/process.exit boilerplate.
- [x] task read still passes verbose, cwd, and format options.
- [x] Chapter 742-744 is evidence-complete and committed.
