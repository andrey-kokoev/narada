---
status: opened
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

- [ ] The state machine distinguishes unbound, idle, active task, needs status report, in review, blocked, done, and handoff-needed states.
- [ ] next/duty-loop behavior is derived from state, not remembered convention only.
- [ ] work-next and operator-surface status agree on active task and next command.
- [ ] Observer, Architect, Builder, and Resident role boundaries are preserved in transitions.
- [ ] Tests cover common nudges, claimed work, no work, blocked work, and unbound surface.
