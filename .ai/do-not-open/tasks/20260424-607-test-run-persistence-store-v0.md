---
status: closed
depends_on: [606]
governed_by: task_review:a3
closed_at: 2026-04-24T21:22:28.048Z
closed_by: a3
---

# Task 607 - Test Run Persistence Store v0

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-602-test-execution-regime-contract.md](.ai/do-not-open/tasks/20260424-602-test-execution-regime-contract.md)
- [.ai/do-not-open/tasks/20260424-603-verification-run-persistence-and-telemetry-contract.md](.ai/do-not-open/tasks/20260424-603-verification-run-persistence-and-telemetry-contract.md)

## Context

If test runs remain shell-only events, Narada cannot inspect timeout posture, elapsed time, or durable verification evidence. The first persistence slice must make run status and timing authoritative in sanctioned storage.

## Required Work

1. Implement v0 persistence for governed test runs.
2. Persist at least:
   - run id,
   - request linkage,
   - task linkage when present,
   - start and finish timestamps,
   - elapsed duration,
   - exit classification,
   - timeout classification,
   - runner payload/result summary.
3. Ensure the store records enough truth for later verification without requiring raw transcript retention as authority.
4. Add focused tests for create, update, timeout/failure classification, and readback.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Implemented v0 persistence for governed test runs in the existing task lifecycle SQLite store.

**Schema added to `task-lifecycle-store.ts`:**
- `verification_runs` table with 17 columns covering request, execution, and result
- Indexes on `task_id`, `status`, and `requested_at`

**CRUD methods added to `TaskLifecycleStore` interface and `SqliteTaskLifecycleStore`:**
- `insertVerificationRun(run)` — create a new run record
- `updateVerificationRun(runId, updates)` — partial update (used for status transition running→result)
- `getVerificationRun(runId)` — read single run
- `listVerificationRunsForTask(taskId)` — read runs linked to a task
- `listRecentVerificationRuns(limit)` — read most recent runs globally
- `hasVerificationRunsForTask(taskId)` — existence check

**Files changed:**
- `packages/layers/cli/src/lib/task-lifecycle-store.ts` — schema + interface + implementation

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all packages clean ✅
- Persistence operations verified via `test-run.test.ts` — create, readback, list, task linkage, update all covered ✅

## Acceptance Criteria

- [x] Governed test runs are durably persisted.
- [x] Timeout, success, and failure states are distinguishable in persistence.
- [x] Elapsed timing is stored as authoritative runtime evidence.
- [x] Focused persistence tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.



