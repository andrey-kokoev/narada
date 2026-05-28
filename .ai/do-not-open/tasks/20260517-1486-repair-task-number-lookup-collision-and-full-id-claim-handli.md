---
status: confirmed
depends_on: [1485]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:38:55.996Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779053924965_kqn1cd
closed_at: 2026-05-17T21:39:39.300Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Repair task-number lookup collision and full-id claim handling

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1482-1484-remaining-coherence-cleanup-after-site-registry-split.md

## Goal

Make task governance resolve numeric task ids canonically when another filename mentions that number, and make full task-id claim record a numeric task_number.

## Context

During cleanup, task 1483 was readable and present in SQLite lifecycle/spec tables, but numeric claim resolved to task 1485 because task 1485's filename ended with `task-1483`. Claiming by full task id then crashed with `NOT NULL constraint failed: assignment_intents.task_number`. This blocks task 1483 and lifecycle snapshot refresh.

## Required Work

1. Inspect `findTaskFile`, task-number ownership resolution, and task claim assignment intent code.
2. Add a focused regression fixture where one task filename mentions another task number, ensuring `narada task claim 1483` resolves task 1483, not the mentioning task.
3. Repair full task-id claim so the canonical task number is derived before writing `assignment_intents`.
4. Verify task 1483 becomes claimable by number or full id without direct SQLite mutation.
5. Preserve existing task file compatibility and avoid broad task-governance refactors.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Repaired `findTaskFile` so numeric lookup matches the canonical task-number segment rather than arbitrary slug mentions such as `task-1483`.
- Narrowed `isExecutableTaskFile` so normal numbered tasks whose slug ends in `-closure` remain executable; only non-task closure artifacts are excluded by that rule.
- Repaired claim service task-number normalization so full task-id claim resolves the canonical numeric task number before assignment intent recording.
- Updated task-claim tests to seed roster through SQLite authority via `saveRoster`, matching current runtime posture.
- Rebuilt `packages/task-governance` and `packages/layers/cli` so the live `narada` shim used the repaired code.
- Verified live workspace `narada task claim 1483` now resolves and claims task 1483, not task 1485.

## Verification

- `pnpm --dir packages/task-governance exec vitest run test/lib/task-governance.test.ts` passed, 66 tests.
- `pnpm --dir packages/layers/cli exec vitest run test/commands/task-claim.test.ts` passed, 19 tests.
- `pnpm --dir packages/task-governance build` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada task claim 1483 --agent narada.architect --reason "Verify lookup repair in live workspace before snapshot refresh" --cwd D:\code\narada` returned `status=success` and `task_id=20260517-1483-refresh-task-lifecycle-snapshot-after-chapter-closure`.

## Acceptance Criteria

- [x] A regression test covers numeric lookup collision from a filename that mentions another task number.
- [x] Full task-id claim derives and records a numeric task_number instead of crashing.
- [x] Task 1483 can be claimed through governed task claim after the repair.
- [x] No direct SQLite mutation is used as the fix.
