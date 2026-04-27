---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T23:18:21.989Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T23:18:22.376Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 907 — Add inbox handling lease model

## Goal

Prevent duplicate handling by adding explicit inbox claim/release semantics.

## Context

<!-- Context placeholder -->

## Required Work

1. Extend inbox envelope status to include `handling`.
2. Persist handling metadata on the envelope without breaking existing rows.
3. Add store methods for claim and release with validation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Received envelopes can transition to handling with handler metadata.
- [x] Handling envelopes can be released back to received by the current handler.
- [x] Claiming already-handled or terminal envelopes fails with a bounded error.
