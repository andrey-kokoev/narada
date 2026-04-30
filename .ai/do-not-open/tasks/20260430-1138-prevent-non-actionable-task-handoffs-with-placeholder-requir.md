---
status: claimed
amended_by: architect
amended_at: 2026-04-30T17:26:03.316Z
---

# Prevent non-actionable task handoffs with placeholder required work

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Stop Narada from creating, claiming, recommending, or handing off executable tasks whose Required Work is a placeholder such as `1. TBD` rather than an actionable work plan.

## Context

CAPA source: task 1133 was claimed by Builder and had acceptance criteria, but its Required Work degraded to `1. TBD`. Workboard, evidence, work-next, and recommend correctly showed the task as claimed/incomplete, but Builder reasonably reported there was nothing to do because the executable handoff body was missing. Architect amended the task afterward, but the system should have prevented or surfaced the non-actionable handoff before Builder got stuck.

## Required Work

1. Inspect task create, inbox task, chapter commission, task amend, task claim, task work-next, task recommend, task read, task evidence, and task workboard surfaces for task actionability validation.
2. Define a handoff_actionability model that detects placeholder, empty, or non-actionable Required Work in executable Builder handoff tasks.
3. Make task creation or commissioning reject or flag executable tasks whose Required Work is missing or placeholder text such as TBD.
4. Make claim, work-next, and recommend surface an underspecified active task as a blocker with repair guidance instead of only a normal continue instruction.
5. Expose handoff_actionability in task read, evidence, and workboard output so Architect can detect whether a task is executable before assigning Builder.
6. Add or verify a sanctioned amendment path that can repair Required Work and clear the actionability blocker without releasing the task.
7. Add tests for placeholder Required Work, empty Required Work, valid multi-step Required Work, and non-executable planning/deferred exceptions, including the 1133 regression shape.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T17:26:03.316Z: required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Executable task creation/commissioning rejects or flags placeholder Required Work before Builder handoff.
- [ ] Claim/work-next/recommend detect when the active claimed task is underspecified and return repair guidance rather than only continue/report/release.
- [ ] Task read/evidence/workboard expose handoff_actionability or equivalent actionable/underspecified state.
- [ ] A sanctioned amendment path can repair Required Work and clear the blocker without releasing the task.
- [ ] Tests cover `1. TBD`, empty Required Work, valid multi-step Required Work, and non-executable planning/deferred exceptions.
- [ ] The 1133 failure mode is represented as a regression fixture or explicit test case.
