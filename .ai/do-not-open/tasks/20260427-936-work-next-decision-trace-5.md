---
status: closed
depends_on: []
closed_at: 2026-04-27T01:24:23.258Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 936 — Work Next Decision Trace — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/work-next.test.ts`

## Context

Decision trace is only useful if all routing branches are covered.

## Goal

Verify the trace contract on all existing `work-next` branches.

## Required Work

1. Assert task selected trace.
2. Assert review selected trace.
3. Assert inbox selected trace.
4. Assert idle all-empty trace.

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

Extended `work-next.test.ts` trace assertions across task, review, inbox, and idle.

## Verification

`pnpm --filter @narada2/cli exec vitest run test/commands/work-next.test.ts --pool=forks` passed 6/6.

## Acceptance Criteria

- [x] Trace test coverage covers selected task.
- [x] Trace test coverage covers selected review.
- [x] Trace test coverage covers selected inbox.
- [x] Trace test coverage covers idle.
