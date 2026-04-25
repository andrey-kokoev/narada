---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:02:41.023Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:13:01.026Z
closed_at: 2026-04-25T18:13:05.371Z
closed_by: a2
governed_by: task_close:a2
---

# Quarantine projection fallback authority

## Goal

Make legacy markdown/frontmatter fallback an explicit repair/backfill path rather than silent authority during normal command execution.

## Context

Compatibility projections remain necessary during migration, but Narada DNA requires authoritative rows to be owned by sanctioned commands, not silently inferred forever from readable files.

## Required Work

1. Inventory fallback-from-markdown paths in task read/evidence/governance. 2. Mark projection backfill as explicit compatibility behavior with bounded tests. 3. Stop normal lifecycle/evidence decisions from preferring projection over existing SQLite rows. 4. Add reconciliation finding or warning for missing authoritative rows where silent fallback remains.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:02:41.023Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] existing SQLite rows outrank markdown projection in lifecycle and evidence decisions
- [x] missing authority rows are backfilled only through sanctioned command code paths
- [x] tests cover a projection row mismatch where SQLite wins
- [x] residual fallback points are documented as transitional



