---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T02:07:08.574Z
criteria_proof_verification:
  state: unbound
  rationale: Focused work-next regression proves non-executable artifacts are skipped; live peek-next no longer selects Task 1; package builds passed.
closed_at: 2026-04-27T02:07:10.200Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Exclude non-executable task artifacts from next-work routing

## Goal

Prevent work-next and pull-next from selecting legacy planning artifacts or malformed task files that lack executable acceptance criteria.

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

- [x] full verification passes
