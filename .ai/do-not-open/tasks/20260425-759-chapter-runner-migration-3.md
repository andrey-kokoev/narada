---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:23:13.845Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:23:14.215Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 759 — Verify chapter runner migration and leave remaining special cases explicit

## Goal

Prove the migrated chapter commands remain functional and record why any remaining chapter commands still use bespoke handling.

## Context

<!-- Context placeholder -->

## Required Work

1. Run focused verification for chapter command modules and the command wrapper.
2. Run package-level typecheck or build for the CLI package.
3. Confirm chapter init and chapter close are either migrated or intentionally left as special cases with bounded rationale.
4. Close this chapter only after command behavior and formatting remain stable.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused chapter command tests pass.
- [x] CLI package typecheck or build passes.
- [x] Chapter 757-759 passes chapter assert-complete after task closure.
- [x] Commit includes only the chapter tasks, implementation, and verification artifacts required for this chapter.
