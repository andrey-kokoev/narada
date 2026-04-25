---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:39.486Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:47:00.445Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:47:01.628Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Let task finish prove criteria when requested

## Goal

The common agent completion path should be one command after execution, not a remembered prove-then-finish ritual.

## Context

task finish --close still assumes acceptance criteria were already proved elsewhere.

## Required Work

Add task finish --prove-criteria; call task evidence prove-criteria before admission/close; expose proof action in JSON output; add focused regression.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:39.486Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task finish --prove-criteria --close proves criteria before close
- [x] Output reports criteria proof action
- [x] Existing finish behavior remains unchanged without the flag
- [x] Focused finish test passes


