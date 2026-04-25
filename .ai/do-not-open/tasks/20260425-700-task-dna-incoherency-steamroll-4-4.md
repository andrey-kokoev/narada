---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:00:36.380Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:00:38.482Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 700 — Avoid schema migration during ordinary store open

## Goal

Read-oriented CLI opens should not take migration locks when the schema is already current.

## Context

The previous chapter reduced SQLITE_BUSY, but normal open still calls initSchema in each fresh process.

## Required Work

1. Add current-schema detection before initSchema.
2. Only run migration when tables or required columns are absent.
3. Verify parallel evidence/reconcile inspection succeeds.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] openTaskLifecycleStore skips initSchema when schema is current.
- [x] busy_timeout remains configured.
- [x] Parallel evidence and reconcile inspection succeeds.


