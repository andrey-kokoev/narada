---
status: closed
depends_on: []
closed_at: 2026-04-27T01:06:48.075Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 919 — Unified Agent Work Next Surface — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/inbox.ts`
- `docs/concepts/canonical-inbox.md`

## Context

Inbox handling is real work, but it should not override already-claimable task execution work.

## Goal

Use Canonical Inbox work-next as fallback when no task work is available.

## Required Work

1. Call `inboxWorkNextCommand` only after task result is empty.
2. Claim the selected inbox envelope for the agent.
3. Return admissible inbox actions through the preserved inbox result.

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

`workNextCommand` calls `inboxWorkNextCommand({ claim: true, by: agent })` after task emptiness and returns `action_kind: inbox_work`.

## Verification

Focused test proves inbox fallback returns a `handling` envelope leased to `architect`.

## Acceptance Criteria

- [x] Inbox fallback runs only after no task work exists.
- [x] Inbox fallback claims the envelope for the agent.
- [x] Inbox admissible actions remain available in the nested result.
