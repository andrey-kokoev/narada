---
status: closed
depends_on: []
closed_at: 2026-04-27T01:18:28.490Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 927 — Work Next Dispatch Start Bridge — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`
- `packages/layers/cli/src/commands/work-next-register.ts`

## Context

`work-next` default behavior should remain safe, but agents need an explicit opt-in to bridge from task selection into dispatch start.

## Goal

Define explicit dispatch-start options for the unified command.

## Required Work

1. Add non-default `startTask` option.
2. Add pass-through `execTask` option.
3. Keep default `work-next` behavior unchanged.

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

Added `startTask` and `execTask` to `WorkNextOptions`.

## Verification

Typecheck and focused tests passed.

## Acceptance Criteria

- [x] Start behavior is opt-in.
- [x] Exec behavior is opt-in.
- [x] Default unified action ordering remains unchanged.
