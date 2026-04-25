---
status: closed
depends_on: [657]
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T16:00:59.130Z
closed_at: 2026-04-25T16:01:11.648Z
closed_by: a2
governed_by: task_close:a2
---

# Enforce JSON output purity for task lifecycle commands

## Chapter

Task Governance DNA Coherence Sweep

## Goal

Ensure --format json never emits human prelude lines from task close/report/review/amend/reconcile/evidence paths.

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

- [x] task close --format json emits parseable JSON only
- [x] task report/review/amend/reconcile JSON paths emit parseable JSON only
- [x] tests capture stdout/stderr purity
- [x] no human formatter is invoked on JSON paths



