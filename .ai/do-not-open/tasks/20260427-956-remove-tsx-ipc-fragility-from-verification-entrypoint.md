---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T02:15:17.600Z
criteria_proof_verification:
  state: unbound
  rationale: Canonical pnpm verify now runs through node --import tsx; task-file guard child also avoids tsx CLI; full pnpm verify passed.
closed_at: 2026-04-27T02:15:19.045Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Remove TSX IPC fragility from verification entrypoint

## Goal

Make the canonical pnpm verify path avoid intermittent tsx IPC startup failures in restricted shells.

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

- [x] pnpm verify no longer invokes tsx in a way that requires a /tmp IPC listener
- [x] the verification script remains TypeScript-authored or has an equivalent compiled/runtime-safe entrypoint
- [x] full pnpm verify passes from the canonical root script
