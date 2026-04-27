---
status: closed
depends_on: []
closed_at: 2026-04-27T01:13:17.674Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 925 — Unified Work Next Review Routing — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/task-lifecycle-register.ts`
- `packages/layers/cli/src/commands/work-next.ts`

## Context

The unified surface should not perform review. It should return the governed review command to run.

## Goal

Return an actionable but non-mutating review packet.

## Required Work

1. Include task identity and status.
2. Include latest report identity when available.
3. Include bounded command args for `narada task review`.

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

Review work payload now includes `task_id`, `task_number`, `status`, optional `report_id`, `reported_by`, `command`, and `command_args`.

## Verification

Focused test asserts `command_args` for review work.

## Acceptance Criteria

- [x] Review packet includes task number.
- [x] Review packet includes command args.
- [x] Review packet does not mutate task state.
