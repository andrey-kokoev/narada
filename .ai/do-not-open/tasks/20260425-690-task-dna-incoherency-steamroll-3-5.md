---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:40.757Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:47:10.582Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:47:12.237Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Tie criteria proof to verification authority

## Goal

Criteria proof should declare what verification authority it is resting on instead of being a magical markdown check-all operation.

## Context

task evidence prove-criteria currently checks criteria and admits evidence without naming a verification run or proof posture.

## Required Work

Add an optional verification-run binding or explicit no-run rationale to criteria proof; persist it in projection metadata and output; keep existing usage compatible but visible as unbound.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:40.757Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Criteria proof output exposes verification binding state
- [x] Criteria proof projection records the binding or unbound rationale
- [x] Bounded tests cover unbound and bound proof output
- [x] No existing criteria proof caller breaks


