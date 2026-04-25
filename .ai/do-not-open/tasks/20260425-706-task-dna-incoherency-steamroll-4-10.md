---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:01:44.932Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:01:46.243Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 706 — Record residual direct-db guard limitation

## Goal

The DB guard must stop pretending it proves sanctioned provenance when it only detects dirty tracked DB state.

## Context

The guard flags dirty DB state but cannot distinguish command-created mutations from ad hoc SQLite mutations.

## Required Work

1. Rename or reword guard output to match its actual authority.
2. Document that true provenance requires future mutation ledger work.
3. Avoid claiming ad hoc mutation is impossible before provenance exists.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Guard wording is epistemically accurate.
- [x] Docs name mutation-ledger follow-up explicitly.
- [x] No output claims stronger provenance than the guard has.


