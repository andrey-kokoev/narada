---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:49:25.231Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:49:25.334Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 766 — Verify direct action helper migration

## Goal

Prove the helper abstraction is useful without hiding command-specific semantics.

## Context

<!-- Context placeholder -->

## Required Work

1. Run focused tests for command-wrapper and affected task command modules.
2. Run CLI typecheck and build.
3. Run full fast verification before commit.
4. Record any residual command-registration boilerplate as future pressure, not as hidden incompleteness.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused tests pass.
- [x] CLI typecheck and build pass.
- [x] pnpm verify passes.
- [x] Chapter 764-766 passes chapter assert-complete after closure.
