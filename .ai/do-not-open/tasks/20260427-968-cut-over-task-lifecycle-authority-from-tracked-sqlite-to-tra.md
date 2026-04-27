---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T13:26:55.614Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented task lifecycle snapshot cutover. .ai/task-lifecycle.db is removed from Git index and ignored while preserved as local runtime state. .ai/task-lifecycle-snapshot.json is produced through narada task lifecycle export. Guard now enforces tracked snapshot plus ignored DB posture. Docs explain snapshot-backed Git handoff and local import/export workflow. Focused snapshot test proves deterministic repeated export and representative round-trip; live import reconstructed a fresh DB; pnpm verify passed.
closed_at: 2026-04-27T13:26:58.618Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Cut over task lifecycle authority from tracked SQLite to tracked snapshot

## Chapter

Task Lifecycle Snapshot Cutover

## Goal

Move the self-build task lifecycle Git posture from tracked binary .ai/task-lifecycle.db to a tracked deterministic snapshot artifact, while keeping the local SQLite DB as ignored runtime authority reconstructed through sanctioned import/export commands.

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

- [x] Tracked .ai/task-lifecycle.db is removed from the Git index and ignored without deleting the local runtime DB
- [x] Tracked .ai/task-lifecycle-snapshot.json is produced through narada task lifecycle export and committed as the portable lifecycle authority handoff
- [x] Posture guard accepts the new snapshot-backed posture and rejects missing snapshot state
- [x] Documentation states snapshot-backed Git posture
- [x] local SQLite runtime posture
- [x] and sanctioned refresh/import/export workflow
- [x] Verification proves snapshot import can reconstruct a fresh local DB and pnpm verify passes
