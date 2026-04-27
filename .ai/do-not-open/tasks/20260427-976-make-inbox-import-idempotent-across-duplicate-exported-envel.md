---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:14:54.706Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:14:55.132Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Make inbox import idempotent across duplicate exported envelope files

## Chapter

Canonical Inbox import coherence

## Goal

Ensure narada inbox import never crashes when multiple exported JSON files contain the same envelope_id; duplicate exported envelopes must be skipped or reported deterministically.

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

- [x] Importing two files with the same envelope_id does not throw a SQLite uniqueness error.
- [x] The command reports imported/skipped counts deterministically and includes duplicate files in skipped accounting.
- [x] Existing idempotent import behavior for repeated imports is preserved.
- [x] Add focused tests for duplicate exported envelope files with the same envelope_id.
- [x] Verify with focused inbox tests and pnpm verify.
