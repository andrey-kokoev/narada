---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:24.754Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:46:25.904Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:46:26.951Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Require explicit closure mode at CLI boundary

## Goal

Direct task close should not silently default to operator_direct when the operator has not selected a closure authority path.

## Context

task close has closure_mode, but the CLI still supplies a default. That hides authority choice at the boundary.

## Required Work

Make the CLI require --mode for direct task close; keep orchestrators responsible for passing their mode; preserve programmatic compatibility only where existing tests need it; update help and tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:24.754Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Direct CLI task close requires an explicit closure mode
- [x] task finish passes agent_finish
- [x] task review passes peer_reviewed
- [x] Focused close/finish/review tests cover the explicit modes


