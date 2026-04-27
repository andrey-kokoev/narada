---
status: closed
depends_on: []
closed_at: 2026-04-27T01:24:16.664Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 933 — Work Next Decision Trace — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`
- `packages/layers/cli/test/commands/work-next.test.ts`

## Context

Task work has highest priority and needs an explicit trace entry when selected or empty.

## Goal

Trace task-work decisions.

## Required Work

1. Add selected trace for task work.
2. Add empty trace for no admissible task.
3. Include task selected refs.

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

Task work now emits `checked: [{ zone: 'task_work', status: 'selected', selected_ref: 'task:<n>' }]` or an empty reason.

## Verification

Focused tests assert task selection and task empty traces.

## Acceptance Criteria

- [x] Selected task path has task trace.
- [x] Non-task paths include task empty trace.
- [x] Task selected ref is stable.
