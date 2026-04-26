---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:35:43.006Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:35:43.419Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 890 — Test executable inbox promotion behavior

## Goal

Cover executable promotion and idempotence so Inbox cannot silently drift back to metadata-only behavior.

## Context

<!-- Context placeholder -->

## Required Work

1. Add focused CLI tests for task promotion, repeated task promotion, archive promotion, and unsupported target pending/rejection behavior.
2. Add store tests for promotion status and archive status persistence.
3. Run focused control-plane and CLI tests plus fast verification.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused inbox CLI tests pass.
- [x] Focused inbox store tests pass.
- [x] pnpm verify passes.
