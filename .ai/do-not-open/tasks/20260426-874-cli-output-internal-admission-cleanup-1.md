---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T21:21:02.339Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T21:21:02.451Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 874 — Allow finite exits in output admission primitive

## Goal

Extend the CLI output exit admission primitive so finite command exits use the same centralized exit path as interactive and long-lived commands.

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

- [x] CliExitAdmission supports the finite zone.
- [x] Finite command result failure exits delegate through exitCliOutputAdmission.
- [x] Finite command failure helper exits delegate through exitCliOutputAdmission.
