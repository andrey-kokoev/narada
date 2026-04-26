---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T23:03:19.779Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T23:03:20.198Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 905 — Document inbox work-next and pending crossing semantics

## Goal

Make the operator-facing workflow clear: inspect work-next, choose admissible action, then triage/promote.

## Context

<!-- Context placeholder -->

## Required Work

1. Update Canonical Inbox docs with `inbox work-next`.
2. Document recorded pending crossings as non-executed records.
3. Show ergonomic examples for task, archive, and pending crossing flows.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs include `narada inbox work-next`.
- [x] Docs distinguish enacted task/archive handling from recorded pending crossings.
- [x] Examples remain bounded and copyable.
