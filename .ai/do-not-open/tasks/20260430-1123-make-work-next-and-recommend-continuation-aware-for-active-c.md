---
status: closed
amended_by: architect
amended_at: 2026-04-30T13:58:22.057Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T14:33:37.586Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck/build, and live work-next/recommend/workboard readbacks prove continuation primary behavior, claimed-by-self reason, exact next commands, and workboard in-progress assignment resolution.
closed_at: 2026-04-30T14:33:44.169Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make work-next and recommend continuation-aware for active claimed work

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1122-1123-operator-surface-workstate-ergonomics.md

## Goal

Ensure agent next-work surfaces show current claimed work before offering fresh recommendations, and explain when a task is already claimed by the requesting agent.

## Context

The workboard reported no in-progress tasks while roster showed Builder working on task 1119. `task recommend --agent builder` also suggested task 1120 while Builder was still working, only indirectly noting workload. This makes the normal `next` loop ambiguous for operator-surface agents.

## Required Work

1. Trace how roster, lifecycle claimed/executing status, workboard in_progress, and task recommend determine active work.
2. Change work-next/recommend behavior so an agent with active claimed work gets an explicit continuation result before new task recommendations.
3. Make already-claimed-by-self and claimed-by-other states visible with agent id and task number.
4. Repair workboard in_progress so it reflects claimed/executing work consistently with roster/lifecycle authority.
5. Add tests for active claimed work, claimed-by-other blocking, no-active-work recommendation, and stale roster/lifecycle disagreement.

## Non-Goals

- Do not auto-steal or auto-release another agent's task.
- Do not make recommender own lifecycle transitions.
- Do not hide genuinely available unclaimed work after active continuation is shown.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada task recommend --agent <id>` or the canonical work-next surface reports active claimed work as the primary continuation before new recommendations
- [x] Workboard in_progress includes active claimed/executing tasks when roster/lifecycle says an agent is working
- [x] Recommendations explain blockers as claimed_by_self, claimed_by_other, dependency_blocked, or review_pending rather than generic abstention
- [x] Output gives exact next commands for continuing, reporting, releasing, or claiming work
- [x] Focused tests cover self-claimed continuation, other-agent claim visibility, and no-active-work recommendation
