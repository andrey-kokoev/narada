---
status: closed
depends_on: []
closed_at: 2026-04-27T01:13:19.116Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 926 — Unified Work Next Review Routing — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/work-next.test.ts`

## Context

Review routing needs regression coverage because wrong ordering silently sends agents to inbox work while review work waits.

## Goal

Verify review routing in the unified next-action command.

## Required Work

1. Add an in-review task fixture.
2. Add a competing inbox fixture.
3. Assert unified command returns `review_work`.
4. Keep existing tests for task, inbox, idle, and agent errors passing.

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

Added review-before-inbox regression to `work-next.test.ts`.

## Verification

`pnpm --filter @narada2/cli exec vitest run test/commands/work-next.test.ts --pool=forks` passed 5/5.

## Acceptance Criteria

- [x] Review-before-inbox behavior is tested.
- [x] Existing unified work-next tests still pass.
- [x] CLI package typecheck passes.
