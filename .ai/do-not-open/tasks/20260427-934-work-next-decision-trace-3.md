---
status: closed
depends_on: []
closed_at: 2026-04-27T01:24:19.285Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 934 — Work Next Decision Trace — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/work-next.ts`

## Context

Review work is second priority and should explain when it wins or when inbox fallback is allowed.

## Goal

Trace review-work decisions.

## Required Work

1. Add selected trace for review work.
2. Add empty trace when no reviewable task exists.
3. Preserve review-before-inbox ordering.

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

Review work now adds a selected trace with `task:<n>` or empty reason `no_reviewable_task`.

## Verification

Focused tests assert review trace and inbox fallback trace.

## Acceptance Criteria

- [x] Review selected path has trace.
- [x] Inbox/idle paths show review empty reason.
- [x] Ordering remains task, review, inbox.
