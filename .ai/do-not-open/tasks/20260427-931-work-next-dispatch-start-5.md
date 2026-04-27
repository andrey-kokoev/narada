---
status: closed
depends_on: []
closed_at: 2026-04-27T01:18:34.036Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 931 — Work Next Dispatch Start Bridge — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/work-next.test.ts`

## Context

The bridge crosses from action selection into dispatch state, so regression coverage must prove it uses dispatch rather than direct mutation.

## Goal

Verify `work-next --start-task` produces dispatch pickup and start output.

## Required Work

1. Add task fixture.
2. Call `workNextCommand` with `startTask: true`.
3. Assert task work remains selected.
4. Assert pickup and start dispatch results are present.

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

Added focused `starts dispatch context for task work when requested` test.

## Verification

`pnpm --filter @narada2/cli exec vitest run test/commands/work-next.test.ts --pool=forks` passed 6/6.

## Acceptance Criteria

- [x] Start bridge test passes.
- [x] Existing work-next tests still pass.
- [x] CLI package typecheck passes.
