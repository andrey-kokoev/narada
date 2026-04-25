---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:03:20.582Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:07:57.586Z
closed_at: 2026-04-25T18:08:02.268Z
closed_by: a2
governed_by: task_close:a2
---

# Make accepted-learning guidance output opt-in

## Goal

Stop default JSON command outputs from embedding accepted-learning guidance unless explicitly requested.

## Context

Guidance rows are useful, but default command result payloads should stay austere and bounded. Guidance belongs behind --verbose or an observation/advisory surface.

## Required Work

1. Inventory commands that include guidance in JSON by default. 2. Move guidance into verbose/human opt-in or an explicit advisory field only when requested. 3. Preserve guidance availability for operators who ask for it. 4. Add tests proving default JSON outputs are bounded and guidance-free.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:03:20.582Z: title, goal, context, required work, acceptance criteria, dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task report default JSON output has no guidance array
- [x] task roster mutation default JSON output has no guidance array
- [x] verbose or explicit option still exposes guidance where supported
- [x] tests cover at least report and roster done outputs



