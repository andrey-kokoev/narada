---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T22:20:42.928Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:20:43.305Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 883 — Add Canonical Inbox CLI commands

## Goal

Expose narada inbox submit/list/show/promote as bounded command surfaces over the SQLite store.

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

- [x] narada inbox submit creates a received envelope.
- [x] narada inbox list and show inspect envelopes without mutation.
- [x] narada inbox promote records governed promotion metadata.
