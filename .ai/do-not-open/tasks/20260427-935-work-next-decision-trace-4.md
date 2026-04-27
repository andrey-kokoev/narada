---
status: closed
depends_on: []
closed_at: 2026-04-27T01:24:21.281Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 935 — Work Next Decision Trace — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`
- `packages/layers/cli/src/commands/inbox.ts`

## Context

Inbox is the final work zone before idle; selected inbox and idle both need explicit trace.

## Goal

Trace inbox-work decisions and idle.

## Required Work

1. Add selected trace for inbox work.
2. Add empty trace for no matching inbox work.
3. Include all checked zones in idle output.

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

Inbox work now emits selected refs for envelopes and idle includes all empty checked zones.

## Verification

Focused tests assert inbox selected and idle checked traces.

## Acceptance Criteria

- [x] Inbox selected path has trace.
- [x] Idle path includes task, review, and inbox trace entries.
- [x] Inbox trace is finite and bounded.
