---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:53.657Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:47:43.945Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:47:45.258Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Reduce direct writeTaskFile imports

## Goal

Compatibility projection writes should be visibly named at call sites, not look like arbitrary task-file authority writes.

## Context

writeTaskFile is documented as projection, but command imports still make direct task artifact mutation look normal.

## Required Work

Introduce a projection-named wrapper or alias; migrate representative lifecycle command imports; keep task amend/spec paths clear; update tests or typecheck.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:53.657Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Lifecycle commands call a projection-named writer
- [x] Spec amendment remains distinct
- [x] Typecheck proves imports are coherent
- [x] Residual direct imports are explained or limited


