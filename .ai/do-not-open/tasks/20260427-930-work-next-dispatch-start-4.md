---
status: closed
depends_on: []
closed_at: 2026-04-27T01:18:32.601Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 930 — Work Next Dispatch Start Bridge — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next-register.ts`

## Context

The root CLI needs ergonomic flags for the optional bridge.

## Goal

Expose dispatch start bridge options on `narada work-next`.

## Required Work

1. Add `--start-task`.
2. Add `--exec-task`.
3. Wire both options to `workNextCommand`.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Added `--start-task` and `--exec-task` to `work-next-register.ts`.

## Verification

CLI typecheck passed.

## Acceptance Criteria

- [x] `narada work-next --start-task` is registered.
- [x] `narada work-next --exec-task` is registered.
- [x] Options are passed to command implementation.
