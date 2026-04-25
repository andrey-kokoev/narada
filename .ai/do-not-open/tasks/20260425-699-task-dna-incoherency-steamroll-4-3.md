---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:00:24.541Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:00:26.537Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 699 — Make programmatic task close require closure mode

## Goal

Closure authority choice must be mandatory below the CLI boundary too.

## Context

The CLI now requires --mode, but taskCloseCommand still falls back to operator_direct.

## Required Work

1. Make TaskCloseOptions.mode required.
2. Reject missing mode in taskCloseCommand.
3. Update internal orchestrators and focused tests to pass explicit modes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] taskCloseCommand has no operator_direct fallback.
- [x] Source typecheck proves all programmatic callers pass mode.
- [x] Focused close/finish/review tests pass.


