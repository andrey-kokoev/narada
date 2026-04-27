---
status: closed
depends_on: []
closed_at: 2026-04-27T01:06:46.572Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 918 — Unified Agent Work Next Surface — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/task-next.ts`

## Context

Existing `task work-next` already owns task claim and packet construction. The unified command must not duplicate or bypass that authority.

## Goal

Compose existing task work-next as the first-priority work source.

## Required Work

1. Call `taskWorkNextCommand` in JSON mode.
2. Return task work immediately when a packet exists.
3. Preserve agent-not-found and other task errors.

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

`workNextCommand` delegates to `taskWorkNextCommand` first and returns `action_kind: task_work` for successful non-empty task packets.

## Verification

Focused test proves task work wins even when inbox work also exists.

## Acceptance Criteria

- [x] Task work is selected before inbox work.
- [x] Existing task claim behavior is preserved.
- [x] Non-roster agent errors are not hidden by inbox fallback.
