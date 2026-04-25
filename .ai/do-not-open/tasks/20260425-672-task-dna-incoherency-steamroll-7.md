---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:03:09.330Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:11:48.648Z
closed_at: 2026-04-25T18:11:53.345Z
closed_by: a2
governed_by: task_close:a2
---

# Create explicit governed task completion orchestration

## Goal

Provide a higher-level command that performs report/proof/admit/close sequencing through declared crossings instead of relying on operator ritual.

## Context

Manual sequencing is coherent but fragile. Narada wants crossings to be explicit and durable, not remembered by the operator.

## Required Work

1. Inspect existing task finish behavior. 2. Align or replace it so it performs only sanctioned subcommands/crossings. 3. Ensure it records which crossing artifacts were created or consumed. 4. Add focused tests for successful completion and blocked completion.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:03:09.330Z: title, goal, context, required work, acceptance criteria, dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] one command can perform the allowed completion sequence without direct file editing
- [x] the command exposes report id admission id and close result
- [x] the command fails with clear blocker reasons when evidence is insufficient
- [x] tests prove it routes through evidence admission rather than direct close-only mutation



