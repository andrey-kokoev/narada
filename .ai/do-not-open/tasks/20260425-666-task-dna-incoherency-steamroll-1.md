---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:02:24.795Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:05:03.831Z
closed_at: 2026-04-25T18:05:09.628Z
closed_by: a2
governed_by: task_close:a2
---

# Audit and enforce read-only command purity

## Goal

Find commands whose name or help declares inspection/read-only behavior while mutating durable state, then split mutation into explicit admission/record commands.

## Context

Task evidence inspect already violated this by writing admission rows. The chapter must make that class of violation mechanically visible and prevented for adjacent commands.

## Required Work

1. Inventory inspect/list/show/status commands under packages/layers/cli/src/commands. 2. Identify any command that writes SQLite, task files, observations, findings, or other durable artifacts while presenting as read-only. 3. Move mutation to explicit admission/record command or rename the command surface so the mutation is declared. 4. Add focused tests proving read-only command calls do not create new authority rows.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:02:24.795Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] read-only command inventory exists in code or tests
- [x] at least one mutation guard test proves an inspect command does not write durable rows
- [x] mutating inspection surfaces are split or explicitly named as record/admit surfaces
- [x] CLI help text stops calling mutating commands read-only



