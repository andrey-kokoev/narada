---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:40:20.811Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:40:21.177Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 737 — Normalize writeTaskFile EOF output

## Goal

Ensure all task projection writes through writeTaskFile inherit the no-blank-EOF invariant.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a writeTaskFile regression test for bodies ending with blank lines.
2. Ensure writeTaskProjection inherits the same behavior through writeTaskFile.
3. Do not add per-command whitespace patches.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] writeTaskFile output does not end in two newline characters.
- [x] writeTaskFile output ends in exactly one newline.
- [x] The invariant is enforced below task finish/report/claim command layers.
- [x] Focused task-governance tests pass.
