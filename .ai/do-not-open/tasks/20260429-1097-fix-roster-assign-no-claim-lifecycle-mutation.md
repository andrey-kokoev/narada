---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T23:30:28.261Z
criteria_proof_verification:
  state: unbound
  rationale: Added regression coverage proving roster assign --no-claim leaves an existing SQLite lifecycle row opened and does not claim, while default roster assign still claims. Human output now explicitly reports claim: skipped; JSON already reports claimed:false. Focused roster tests, CLI typecheck, and CLI build pass.
closed_at: 2026-04-29T23:30:49.480Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Fix roster assign --no-claim lifecycle mutation

## Chapter

Task Roster Lifecycle Semantics

## Goal

Make narada task roster assign --no-claim obey its name by updating assignment/roster intent without claiming or mutating task lifecycle to claimed.

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

- [x] Reproduce the current defect with a focused regression: narada task roster assign <task> --agent <agent> --no-claim must not transition an opened task to claimed.
- [x] Fix the command implementation so --no-claim updates roster/assignment projection only and leaves lifecycle status unchanged.
- [x] Preserve the existing default behavior without --no-claim: assigning may claim when that is the documented default path.
- [x] JSON and human output must accurately report claimed:false when --no-claim is used.
- [x] Add regression tests covering opened task
- [x] already claimed task
- [x] and output claimed flag behavior.
- [x] Update help text or docs if needed so --no-claim semantics are explicit.
