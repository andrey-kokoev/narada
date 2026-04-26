---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:55:10.278Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:55:10.677Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 899 — Add inbox triage action surface

## Goal

Provide ergonomic one-step handling for the next envelope while preserving explicit governed actions.

## Context

<!-- Context placeholder -->

## Required Work

1. Add `narada inbox triage <envelope-id>` with actions `archive`, `task`, and `pending`.
2. Route `archive` and `task` through existing promotion implementations.
3. Route `pending` through `inbox promote` with a required target kind/ref where appropriate.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `inbox triage <id> --action archive --by <principal>` archives the envelope.
- [x] `inbox triage <id> --action task --by <principal>` creates a task for a task candidate.
- [x] Invalid action/target combinations fail with bounded errors.
