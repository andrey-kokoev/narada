---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T22:20:54.364Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:20:54.948Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 885 — Document Canonical Inbox operator surface

## Goal

Document the initial CLI surface and the inert-envelope promotion invariant.

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

- [x] A concept doc explains submit/list/show/promote.
- [x] The doc states that inbox items do not execute or mutate target authority directly.
- [x] The doc includes the Windows hostname/COMPUTERNAME friction as an example envelope.
