---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:55:01.760Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:55:02.217Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 898 — Add inbox next inspection surface

## Goal

Give operators and agents a bounded way to see the next inbox item without listing or reading the whole inbox.

## Context

<!-- Context placeholder -->

## Required Work

1. Add `narada inbox next` as a read-only bounded inspection command.
2. Default to received envelopes and allow `--kind`, `--status`, and `--limit` filters.
3. Return one primary envelope and a bounded alternatives list.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada inbox next --format json` returns `primary` and `alternatives`.
- [x] No mutation occurs.
- [x] Output is bounded and does not dump all inbox rows.
