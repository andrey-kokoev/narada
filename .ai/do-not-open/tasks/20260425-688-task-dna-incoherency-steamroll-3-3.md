---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:27.129Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:46:49.462Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:46:50.635Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Separate review verdict status from lifecycle status in output

## Goal

task review output must distinguish the review artifact verdict from the downstream lifecycle status.

## Context

After review delegates closure, returning only new_status collapses review admission and lifecycle transition.

## Required Work

Add explicit review_status or review_verdict_status and lifecycle_status fields to task review output; preserve new_status as compatibility if needed; test accepted review output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:27.129Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Review JSON exposes review verdict status
- [x] Review JSON exposes lifecycle status
- [x] Compatibility new_status remains bounded or documented
- [x] Focused review output test passes


