---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T23:02:54.610Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T23:02:54.970Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 902 — Add inbox work-next advisory surface

## Goal

Return the next inbox envelope together with admissible actions so agents do not have to infer legal handling manually.

## Context

<!-- Context placeholder -->

## Required Work

1. Add `narada inbox work-next` as a read-only advisory command.
2. Reuse inbox next selection and include admissible actions derived from envelope kind/status/authority.
3. Keep output bounded: one primary envelope, alternatives count, and action descriptors only.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `inbox work-next --format json` returns `primary`, `admissible_actions`, and `alternatives`.
- [x] Task candidates include a task action and archive action.
- [x] Non-task envelopes do not advertise task enactment.
