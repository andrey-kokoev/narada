---
status: closed
depends_on: []
closed_at: 2026-04-27T01:50:28.322Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 951 — Bootstrap Doctor Repair Plan — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/doctor.test.ts`

## Context

The repair plan contract must be stable enough for agents and UI surfaces.

## Goal

Verify structured repair plan output.

## Required Work

1. Assert repair plan includes install command.
2. Assert repair plan includes build command.
3. Assert argv arrays are stable.
4. Run live bootstrap doctor.

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

Extended degraded bootstrap doctor test with `repair_plan` and `remediation_args` assertions.

## Verification

Focused tests passed 8/8. Live bootstrap doctor returned healthy with empty repair plan.

## Acceptance Criteria

- [x] Repair plan test coverage exists.
- [x] Argv arrays are tested.
- [x] Live healthy command returns empty repair plan.
