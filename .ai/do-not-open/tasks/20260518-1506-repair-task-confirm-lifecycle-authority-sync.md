---
status: confirmed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-18T12:32:02.417Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria proven by focused task-confirm tests, typecheck/build, and readback of task 1505 through task read and evidence inspect showing status=confirmed.
closed_at: 2026-05-18T12:32:07.748Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
confirmed_by: narada.architect
confirmed_at: 2026-05-18T12:32:16.185Z
---

# Repair task confirm lifecycle authority sync

## Chapter

Task Lifecycle Confirmation Coherence

## Goal

Make `narada task confirm` keep SQLite lifecycle authority and task markdown projection coherent, including repair of already-confirmed markdown with a stale closed lifecycle row.

## Context

Task 1505 was confirmed by `narada task confirm`, and the task markdown projection says `status: confirmed`, but canonical `narada task read 1505` and evidence inspection still report `status: closed` from SQLite lifecycle authority. Source inspection shows `task-confirm.ts` updates markdown and mutation evidence but does not update the task lifecycle store.

## Required Work

1. Update `task confirm` so a successful confirmation updates SQLite task lifecycle to `confirmed` with governed provenance. 2. Preserve rejection of ordinary already-confirmed tasks, but allow the repair case where markdown is `confirmed` and SQLite lifecycle is still `closed`. 3. Add focused regression coverage for SQLite lifecycle sync and stale closed-row repair. 4. Run focused confirm tests, typecheck/build as appropriate, and read back task 1505 as confirmed. 5. Export lifecycle evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Updated `packages/layers/cli/src/commands/task-confirm.ts` so successful confirmation also updates an existing SQLite lifecycle row to `confirmed`.
- Added a guarded repair path for the observed residue: markdown projection already says `confirmed`, but SQLite lifecycle authority is still `closed`.
- Preserved the ordinary rejection behavior for tasks that are already confirmed without the stale-closed lifecycle repair case.
- Added focused tests in `packages/layers/cli/test/commands/task-confirm.test.ts` for lifecycle authority sync and stale closed-row repair.
- Re-ran `narada task confirm 1505 --by narada.architect --format json`; task 1505 now reads back as `confirmed` from canonical task read and task evidence surfaces.

## Verification

- `pnpm --dir packages/layers/cli test -- test/commands/task-confirm.test.ts` passed: 10 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada task confirm 1505 --by narada.architect --format json` passed and repaired SQLite lifecycle authority for task 1505.
- `narada task read 1505 --format json` passed with `status=confirmed`.
- `narada task evidence inspect 1505 --format json` passed with `status=confirmed`.

## Acceptance Criteria

- [x] `narada task read 1505 --format json` reports `status=confirmed`.
- [x] `narada task evidence inspect 1505 --format json` reports `status=confirmed`.
- [x] Focused task confirm tests pass.
