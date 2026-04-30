---
status: opened
---

# Prevent non-actionable task handoffs with placeholder required work

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Stop Narada from creating, claiming, recommending, or handing off executable tasks whose Required Work is a placeholder such as `1. TBD` rather than an actionable work plan.

## Context

CAPA source: task 1133 was claimed by Builder and had acceptance criteria, but its Required Work degraded to `1. TBD`. Workboard, evidence, work-next, and recommend correctly showed the task as claimed/incomplete, but Builder reasonably reported there was nothing to do because the executable handoff body was missing. Architect amended the task afterward, but the system should have prevented or surfaced the non-actionable handoff before Builder got stuck.

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Executable task creation/commissioning rejects or flags placeholder Required Work before Builder handoff.
- [ ] Claim/work-next/recommend detect when the active claimed task is underspecified and return repair guidance rather than only continue/report/release.
- [ ] Task read/evidence/workboard expose handoff_actionability or equivalent actionable/underspecified state.
- [ ] A sanctioned amendment path can repair Required Work and clear the blocker without releasing the task.
- [ ] Tests cover `1. TBD`, empty Required Work, valid multi-step Required Work, and non-executable planning/deferred exceptions.
- [ ] The 1133 failure mode is represented as a regression fixture or explicit test case.
