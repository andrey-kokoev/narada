---
status: closed
depends_on: []
closed_at: 2026-04-27T01:18:31.229Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 929 — Work Next Dispatch Start Bridge — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/task-dispatch.ts`

## Context

Dispatch start owns transition from picked up to executing and builds the recommended Kimi command.

## Goal

Compose dispatch start after successful pickup.

## Required Work

1. Call `taskDispatchCommand` with `action: start`.
2. Pass through `execTask` to dispatch `exec`.
3. Return dispatch start result in unified output.

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

`workNextCommand` now runs dispatch start after pickup and returns `dispatch_result.start`.

## Verification

Focused test asserts `action: ready` and a Kimi recommended command.

## Acceptance Criteria

- [x] Dispatch start is delegated to task dispatch.
- [x] Recommended command is available in result.
- [x] Dispatch start failures are returned directly.
