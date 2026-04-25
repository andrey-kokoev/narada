---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:19:58.743Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:36:28.022Z
closed_at: 2026-04-25T18:36:32.142Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Migrate report tests away from filesystem report authority

## Goal

Task report verification must treat SQLite lifecycle/report records and sanctioned read surfaces as authority, not legacy report JSON files.

## Context

task-report tests still assert files under tasks/reports. That fossilizes the compatibility projection as if it were the governed report authority.

## Required Work

Replace filesystem report assertions with lifecycle-store or sanctioned command assertions; keep assignment and roster checks only where they verify compatibility projection behavior; run focused task-report tests through the focused test surface.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:19:58.743Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task-report tests no longer require report JSON files as authority
- [x] SQLite report records or sanctioned read surfaces verify submitted report fields
- [x] Idempotency test verifies one authoritative report record for one assignment
- [x] Reclaim test verifies a distinct authoritative report record for a distinct assignment



