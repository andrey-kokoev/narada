---
status: closed
depends_on: []
closed_at: 2026-04-27T01:18:29.909Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 928 — Work Next Dispatch Start Bridge — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/task-dispatch.ts`
- `packages/layers/cli/src/commands/work-next.ts`

## Context

Dispatch pickup owns packet creation and lease setup. `work-next` should not duplicate that logic.

## Goal

Compose dispatch pickup for selected task work.

## Required Work

1. Detect numeric task number from selected task work.
2. Open task lifecycle store for dispatch.
3. Call `taskDispatchCommand` with `action: pickup`.

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

`workNextCommand` now calls dispatch pickup when `--start-task` is used and task work is selected.

## Verification

Focused test asserts nested `dispatch_result.pickup`.

## Acceptance Criteria

- [x] Pickup is delegated to task dispatch.
- [x] Missing task number fails explicitly.
- [x] Dispatch store is closed after use.
