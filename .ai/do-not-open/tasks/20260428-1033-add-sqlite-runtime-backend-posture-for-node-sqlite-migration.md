---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T21:00:43.364Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck, and pnpm verify passed; all acceptance criteria were implemented in the SQLite runtime posture module, lifecycle open guard, doctor check, and docs.
closed_at: 2026-04-28T21:00:55.590Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add SQLite runtime backend posture for node:sqlite migration

## Chapter

runtime-substrate

## Goal

Prepare Narada SQLite lifecycle usage for a future node:sqlite backend on Node 22+ without breaking the current better-sqlite3 runtime.

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

- [x] SQLite backend selection is explicit and defaults safely;node:sqlite availability is detected without static import on older Node;explicit unsupported node:sqlite selection fails with a clear diagnostic;doctor/help surfaces report SQLite backend posture instead of only native binding status;documentation records adapter-first migration posture and runtime floor;focused tests cover fallback and diagnostics;pnpm verify passes
