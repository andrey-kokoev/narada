---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:01:26.960Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:01:27.369Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 746 — Migrate store-owning lifecycle commands

## Goal

Remove store lifetime boilerplate from direct task review, close, and dispatch actions.

## Context

<!-- Context placeholder -->

## Required Work

1. Migrate task review to the store-scoped direct runner.
2. Migrate task close to the store-scoped direct runner.
3. Migrate task dispatch to the store-scoped direct runner.
4. Preserve each command's option mapping and format behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task review action has no local try/finally store close boilerplate.
- [x] task close action has no local try/finally store close boilerplate.
- [x] task dispatch action has no local try/finally store close boilerplate.
- [x] Each migrated command passes its store into the command service.
