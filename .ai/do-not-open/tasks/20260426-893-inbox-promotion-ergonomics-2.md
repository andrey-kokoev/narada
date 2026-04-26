---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:45:43.848Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:45:44.279Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 893 — Add ergonomic inbox task promotion command

## Goal

Provide an operator-friendly inbox task promotion surface that avoids the awkward --target-kind task --target-ref pattern.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a `narada inbox task <envelope-id>` subcommand that promotes an envelope to a task.
2. Support explicit `--title`, `--goal`, and repeatable `--criteria` overrides.
3. Keep `inbox promote --target-kind task` as a compatibility path using the same implementation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada inbox task <id> --by <principal>` creates a task for task candidate envelopes.
- [x] Explicit title/goal/criteria overrides take precedence over payload fields.
- [x] The command output remains bounded and reports the created task number.
