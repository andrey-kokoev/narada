---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:02:35.672Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:09:30.943Z
closed_at: 2026-04-25T18:09:35.526Z
closed_by: a2
governed_by: task_close:a2
---

# Bound all observation output surfaces

## Goal

Ensure observation/list/inspect commands default to bounded output or artifact pointers, never accidental giant transcripts.

## Context

Evidence list and reconcile inspect both exposed pressure toward unbounded CLI output. Narada output creation and output admission must remain separate.

## Required Work

1. Inventory commands with list/inspect/show/status output. 2. Add missing --limit, --range, --full, or artifact pointer behavior where output can grow. 3. Ensure JSON outputs use bounded summaries by default. 4. Add tests for at least the task-facing surfaces touched.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:02:35.672Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] no task-facing list or inspect command added in this chapter lacks an explicit bound
- [x] unbounded output requires explicit --full or equivalent
- [x] opt-in full output is documented in help
- [x] focused tests cover bounded output behavior



