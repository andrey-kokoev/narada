---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T21:21:14.979Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T21:21:02.428Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 875 — Route finite result output through admission primitive

## Goal

Make finite command result helpers use emitCliOutputAdmission for stdout and stderr instead of raw console writes.

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

- [x] emitCommandResult delegates through emitCliOutputAdmission.
- [x] emitFiniteCommandFailure delegates stderr output through emitCliOutputAdmission.
- [x] emitFormatterBackedCommandResult delegates stdout and stderr output through emitCliOutputAdmission.
