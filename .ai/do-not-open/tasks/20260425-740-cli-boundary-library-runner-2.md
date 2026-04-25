---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:46:10.717Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:46:11.020Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 740 — Add direct runner boundary tests

## Goal

Prove direct command boundary behavior without invoking real CLI processes.

## Context

<!-- Context placeholder -->

## Required Work

1. Test success emission and no exit.
2. Test non-zero result emission and exit code propagation.
3. Test SQLite busy thrown error emits normalized retryable result and exits non-zero.
4. Test unexpected thrown errors are re-thrown.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused command-wrapper tests cover success result emission.
- [x] Focused command-wrapper tests cover non-zero exit propagation.
- [x] Focused command-wrapper tests cover SQLite busy normalization.
- [x] Focused command-wrapper tests cover unexpected error rethrow.
