---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T03:53:12.578Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented conflict-safe Canonical Inbox portability: .ai/inbox.db is ignored/untracked, inbox export writes one JSON artifact per envelope, inbox import replays artifacts idempotently, doctor/submit delivery coordinates report local DB plus export posture, focused tests cover export/import and posture, live export/import succeeded, and pnpm verify passed.
closed_at: 2026-04-27T03:53:16.956Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Move inbox submissions off tracked SQLite conflict path

## Goal

Stop routine Canonical Inbox submissions from mutating tracked binary Git state by ignoring the local inbox database and providing explicit append-only export/import artifacts for portable or cross-site envelope sharing.

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

- [x] Local .ai/inbox.db is ignored/untracked so routine submissions do not create Git conflicts
- [x] inbox export writes one-envelope-per-file append artifacts with stable names
- [x] inbox import replays exported envelope artifacts idempotently into the local inbox store
- [x] Inbox doctor/submit delivery data explains local DB versus export artifact visibility
- [x] Focused tests cover export/import idempotency and ignored inbox DB posture
