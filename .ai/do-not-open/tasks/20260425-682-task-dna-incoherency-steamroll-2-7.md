---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:30.392Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:37:27.191Z
closed_at: 2026-04-25T18:37:32.990Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Decide and enforce task lifecycle database tracking posture

## Goal

The mutable task lifecycle database must have an explicit repository posture instead of drifting as a tracked live artifact by accident.

## Context

.ai/task-lifecycle.db is authoritative state for the self-build Site, but a mutable SQLite file in git creates unclear authority and merge behavior.

## Required Work

Choose the posture for the self-build lifecycle DB; encode it in ignore/index/docs or sanctioned export/import commands; avoid silent direct DB mutation paths; record any destructive index action as operator-approved if required.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:30.391Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The lifecycle DB tracking posture is documented
- [x] Repo ignore or tracked-artifact behavior matches the chosen posture
- [x] Any required index removal is not performed without explicit approval
- [x] Operators and agents know the sanctioned way to preserve or move lifecycle authority



