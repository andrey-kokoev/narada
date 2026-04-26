---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:18:51.754Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:17:34.948Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 818 — Add shared registrar output helpers

## Goal

Create shared helpers for registrar-owned command result emission and silent command context construction.

## Context

Several registrars duplicate formatter-backed result emission and silent CommandContext scaffolding. This weakens command output discipline.

## Required Work

1. Add a shared helper for creating a silent CommandContext.
2. Add a shared helper for emitting formatter-backed command results with consistent nonzero exit handling.
3. Keep helper behavior compatible with existing formatter-side-effect commands.
4. Do not change command implementations.

## Non-Goals

- Do not redesign the formatter.
- Do not migrate long-lived serve command output yet.
- Do not change command result schemas.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Shared helpers exist in an appropriate CLI lib module.
- [x] Helpers cover json emission and nonzero exit handling currently duplicated in registrars.
- [x] Typecheck/build succeeds.
- [x] No command behavior changes are required by this task.
