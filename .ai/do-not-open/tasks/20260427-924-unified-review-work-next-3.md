---
status: closed
depends_on: []
closed_at: 2026-04-27T01:13:16.092Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 924 — Unified Work Next Review Routing — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`
- `packages/layers/cli/test/commands/work-next.test.ts`

## Context

Adding review work must not demote active task execution or let inbox work hide review-ready tasks.

## Goal

Preserve the correct ordering of next-action zones.

## Required Work

1. Keep task work first.
2. Run review discovery after task-empty result.
3. Run inbox fallback only after no review work exists.

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

`workNextCommand` now orders action sources as task work, review work, inbox work, idle.

## Verification

Focused test verifies review work is returned before inbox fallback.

## Acceptance Criteria

- [x] Task work remains first priority.
- [x] Review work precedes inbox fallback.
- [x] Inbox fallback remains available when no task or review work exists.
