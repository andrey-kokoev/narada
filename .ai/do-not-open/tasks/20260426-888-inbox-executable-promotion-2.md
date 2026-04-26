---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:35:20.153Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:35:20.598Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 888 — Implement sanctioned task promotion from inbox envelope

## Goal

Make inbox task promotion call the task-authoring command path instead of only recording target metadata.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a task promotion path that creates a task via the existing taskCreateCommand surface.
2. Derive the task title/body from the envelope payload deterministically with explicit fallbacks.
3. Record the created task number/ref back onto the inbox envelope promotion metadata.
4. Ensure promotion is idempotent for envelopes already promoted to a task.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Promoting a task_candidate or upstream_task_candidate envelope with --target-kind task creates a task through sanctioned command code.
- [x] The resulting inbox envelope contains promotion metadata pointing at the created task.
- [x] A repeated promotion of the same envelope does not create duplicate tasks.
