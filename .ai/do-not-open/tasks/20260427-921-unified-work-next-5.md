---
status: closed
depends_on: []
closed_at: 2026-04-27T01:06:51.097Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 921 — Unified Agent Work Next Surface — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/work-next.test.ts`

## Context

Cross-zone composition needs focused regression tests because failures can silently route the agent to the wrong zone.

## Goal

Verify the unified next-action routing.

## Required Work

1. Test task-first behavior.
2. Test inbox fallback behavior.
3. Test idle behavior.
4. Test non-roster agent rejection.

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

Added `work-next.test.ts` with four focused cases over the unified routing.

## Verification

`pnpm --filter @narada2/cli exec vitest run test/commands/work-next.test.ts --pool=forks` passed 4/4.

## Acceptance Criteria

- [x] Task-first routing is tested.
- [x] Inbox fallback is tested.
- [x] Idle result is tested.
- [x] Agent admission error is tested.
