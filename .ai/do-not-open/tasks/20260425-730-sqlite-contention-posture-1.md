---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:28:42.313Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:28:42.687Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 730 — Enable lifecycle SQLite contention posture

## Goal

Make task lifecycle SQLite connections tolerate short concurrent CLI writes without immediate SQLITE_BUSY failures.

## Context

<!-- Context placeholder -->

## Required Work

1. Configure lifecycle SQLite connections with a deterministic busy timeout and WAL-compatible pragmas.
2. Keep the posture local to the task lifecycle store, not scattered through individual commands.
3. Add focused tests that prove the opened store carries the expected SQLite pragmas.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] openTaskLifecycleStore configures busy_timeout to a non-zero command-safe value.
- [x] openTaskLifecycleStore configures journal_mode to wal for file-backed task lifecycle stores.
- [x] openTaskLifecycleStore configures a sane synchronous mode for WAL-backed command usage.
- [x] Focused tests cover the connection posture without using direct task workflow mutation.
