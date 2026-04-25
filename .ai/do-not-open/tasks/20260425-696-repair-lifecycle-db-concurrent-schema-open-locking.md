---
status: closed
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:49:36.665Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:49:38.111Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Repair lifecycle DB concurrent schema-open locking

## Goal

Concurrent read-oriented CLI inspections must not fail because each process attempts schema migration on open.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] openTaskLifecycleStore avoids unnecessary schema writes when the schema is already current
- [x] SQLite busy timeout is set before schema initialization
- [x] Parallel evidence and reconcile inspection no longer fails with SQLITE_BUSY
- [x] Focused typecheck and range checks pass


