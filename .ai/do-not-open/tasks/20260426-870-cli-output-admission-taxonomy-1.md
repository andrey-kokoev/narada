---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T21:15:24.064Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T21:15:24.186Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 870 — Define CLI output admission taxonomy primitive

## Goal

Introduce a small shared primitive that names the output admission zone and stream explicitly.

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

- [x] The shared CLI output layer defines explicit admission zones for finite, interactive, and long-lived command output.
- [x] The shared CLI output layer defines explicit stdout/stderr stream admission.
- [x] Existing helper behavior is preserved through the taxonomy primitive.
