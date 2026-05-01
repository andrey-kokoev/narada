---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T04:15:53.040Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777608920461_s2t0nl
closed_at: 2026-05-01T04:16:27.003Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Formalize AgentWorkDutyLoop state machine

## Chapter

state-machine-formalization

## Goal

Make role duty-loop nudges such as next deterministic through explicit agent work states.

## Context

Recent Operator nudges rely on cultural memory that next means the current role duty loop. This task formalizes duty-loop states so agents and CLI surfaces can reconstruct idle/working/status/report/blocker posture.

## Required Work

Define AgentWorkDutyLoop states and transitions; integrate unbound, idle, has_active_task, needs_status_report, in_review, blocked, done, and handoff_needed into work-next, role-loop, roster, operator-surface status, and agent onboarding docs; add tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The state machine distinguishes unbound, idle, active task, needs status report, in review, blocked, done, and handoff-needed states.
- [x] next/duty-loop behavior is derived from state, not remembered convention only.
- [x] work-next and operator-surface status agree on active task and next command.
- [x] Observer, Architect, Builder, and Resident role boundaries are preserved in transitions.
- [x] Tests cover common nudges, claimed work, no work, blocked work, and unbound surface.
