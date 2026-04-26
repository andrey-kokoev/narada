---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:35:31.945Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:35:32.395Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 889 — Add archive as a first-class inbox promotion target

## Goal

Provide a non-mutating target crossing for envelopes that should leave the active inbox without being converted to work.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a store-level archive transition or reuse promotion metadata with target_kind archive.
2. Expose archive behavior through the promote command without requiring a fake target ref.
3. Keep archive output bounded and explicit that no task/operator action was created.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] narada inbox promote <id> --target-kind archive --by <principal> archives the envelope.
- [x] Archived envelopes are listable by status and do not appear in received-only lists.
- [x] Archive promotion output says no target-zone mutation was performed.
