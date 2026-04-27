---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T13:13:10.406Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented sanctioned task lifecycle snapshot export/import commands. Export writes JSON snapshot of task lifecycle SQLite user tables without admitting the full snapshot to stdout; import reconstructs SQLite via sanctioned command and creates the target authority directory when needed. Representative round-trip preserves lifecycle, assignments, reports, reviews, roster, task specs, and repo publication rows. Updated DB posture docs to mark export/import as prerequisite, not cutover. Focused snapshot test, live export/import, and pnpm verify passed.
closed_at: 2026-04-27T13:13:13.192Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add task lifecycle snapshot export and import

## Goal

Create sanctioned task lifecycle export/import commands that can preserve and reconstruct the SQLite authority state, preparing for a later conflict-safe cutover away from tracked task-lifecycle.db without deleting authority prematurely.

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

- [x] narada task lifecycle export writes a deterministic JSON snapshot of task lifecycle SQLite tables
- [x] narada task lifecycle import reconstructs a lifecycle DB from that snapshot via sanctioned command
- [x] round-trip preserves core lifecycle
- [x] assignment
- [x] evidence
- [x] report
- [x] review
- [x] roster
- [x] task spec
- [x] command run
- [x] verification run
- [x] and publication rows present in the snapshot
- [x] docs update clarifies this is the prerequisite for a later DB index cutover
- [x] not the cutover itself
- [x] focused tests cover export/import round trip
