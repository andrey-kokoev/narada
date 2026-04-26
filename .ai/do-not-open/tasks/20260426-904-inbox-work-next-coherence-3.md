---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T23:03:11.534Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T23:03:11.894Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 904 — Reduce inbox CLI test runtime

## Goal

Improve agent loop ergonomics by keeping inbox focused tests fast while preserving coverage.

## Context

<!-- Context placeholder -->

## Required Work

1. Avoid unnecessary SQLite/task creation setup in tests that do not need task promotion.
2. Split or reuse setup paths so read-only inbox tests do not create task governance fixtures.
3. Keep the existing coverage for task promotion, triage, next/work-next, archive, and pending behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Inbox command tests still cover all critical behaviors.
- [x] Inbox test runtime is materially lower than the previous ~27s run where feasible.
- [x] No coverage is removed for executable task promotion.
