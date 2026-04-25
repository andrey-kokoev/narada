---
status: closed
amended_by: a2
amended_at: 2026-04-25T15:47:56.731Z
closed_at: 2026-04-25T15:48:01.516Z
closed_by: a2
governed_by: task_close:a2
---

# Unify task read/spec backfill authority

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Make task read and task creation/claim surfaces agree on SQLite task spec authority so every command-created or claimable task is readable through sanctioned task read.

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
- Amended by a2 at 2026-04-25T15:47:56.731Z: checked all acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task read works for command-created tasks without manual spec backfill
- [x] claimable task with markdown projection gets task_specs row before read failure
- [x] focused tests cover missing task_specs backfill
- [x] no direct task file reading is required for operator task read


