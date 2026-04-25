---
status: closed
depends_on: [663]
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T16:17:50.489Z
closed_at: 2026-04-25T16:18:01.399Z
closed_by: a2
governed_by: task_close:a2
---

# Make task lifecycle creation populate all authority rows

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Ensure create/claim/amend/report/close/reopen paths maintain lifecycle, spec, roster, assignment, evidence, and observation rows consistently.

## Context

<!-- Context placeholder -->

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

- [x] task create initializes lifecycle and task_specs completely
- [x] claim and roster assign preserve task_specs
- [x] report/review/close update evidence admission rows consistently
- [x] reconciliation inspect is clean after normal task lifecycle flows



