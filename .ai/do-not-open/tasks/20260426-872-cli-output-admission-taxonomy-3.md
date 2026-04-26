---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T21:15:24.096Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T21:15:24.213Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 872 — Test CLI output admission taxonomy

## Goal

Add focused tests proving stdout/stderr routing and exit-code admission without command-local console output.

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

- [x] Tests cover stdout line admission.
- [x] Tests cover stderr diagnostic admission.
- [x] Tests cover long-lived and interactive successful exits through injected exit functions.
