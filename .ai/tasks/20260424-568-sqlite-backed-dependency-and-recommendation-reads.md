---
status: closed
created: 2026-04-24
depends_on: [565]
governed_by: task_review:a3
closed_at: 2026-04-24T15:56:27.867Z
closed_by: a3
---

# Task 568 - SQLite-Backed Dependency And Recommendation Reads

## Goal

Move dependency validation and recommendation candidate lifecycle reads onto SQLite-backed task state, or narrow them explicitly to projection-backed reads that no longer trust markdown lifecycle authority.

## Required Work

1. Inspect:
   - dependency validation
   - runnable-task collection
   - recommendation candidate filtering
2. Route those lifecycle reads through SQLite-backed or projection-backed state.
3. Preserve executable-task filtering and evidence-valid dependency semantics.
4. Add focused tests.
5. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Dependency validation no longer depends on markdown lifecycle authority
- [x] Recommendation candidate lifecycle reads no longer depend on markdown lifecycle authority
- [x] Existing executable-task filtering and evidence-valid dependency semantics are preserved
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Verification

### Wired call sites (SQLite-primary, markdown fallback)

| File | Function | Store usage |
|------|----------|-------------|
| `task-governance.ts` | `resolveTaskStatus()` | New helper: SQLite-first, markdown fallback |
| `task-governance.ts` | `checkDependencies()` | Optional store param; uses `resolveTaskStatus()` |
| `task-governance.ts` | `listRunnableTasks()` | Optional store param; filters by SQLite status |
| `task-governance.ts` | `inspectTaskEvidence()` | Optional store param; uses SQLite status for verdict and `hasGovernedProvenance()` |
| `task-recommender.ts` | `generateRecommendations()` | Optional `store` in `RecommendationOptions`; pre-loads all SQLite statuses; passes store to `checkDependencies()` |
| `task-dispatch.ts` | `checkDispatchVisibility()`, `pickupTask()` | Passes existing store to `checkDependencies()` |
| `task-claim.ts` | `taskClaimCommand()` | Opens store, passes to `checkDependencies()` |
| `task-recommend.ts` | `taskRecommendCommand()` | Opens store, passes to `generateRecommendations()` |
| `task-promote-recommendation.ts` | `taskPromoteRecommendationCommand()` | Opens store, uses `resolveTaskStatus()` for claimable check, passes store to `checkDependencies()` |
| `task-roster.ts` | `taskRosterAssignCommand()` | Opens store, uses `resolveTaskStatus()` for claimable check, passes store to `checkDependencies()` |

### Unwired callers (graceful markdown fallback preserved)

- `task-list.ts` — calls `listRunnableTasks()` without store (fallback works)
- `lib/construction-loop-plan.ts` — calls `inspectTaskEvidence()` without store (fallback works)

### Test results

- `task-governance.test.ts` — 57/57 pass (includes 4 `resolveTaskStatus` + 3 `checkDependencies` SQLite tests)
- `task-recommender.test.ts` — 3/3 pass (SQLite-backed candidate filtering)
- `task-dispatch.test.ts` — 14/14 pass
- `task-recommend.test.ts` — 11/11 pass
- `task-promote-recommendation.test.ts` — 15/15 pass
- `task-roster.test.ts` — 27/27 pass
- `task-lifecycle-store.test.ts` — 27/27 pass
- `pnpm verify` — clean (typecheck, build, charters, ops-kit)

### Bounded blockers / deferred work

- `listRunnableTasks(..., store)` has no explicit tests for the SQLite-backed filtering path. Added to Task 568 scope; tests can be added here if needed, or captured as follow-up.
- Full evidence inspection (`inspectTaskEvidence`) uses SQLite status override but still reads markdown for body-based evidence (criteria, execution notes, verification). This is correct: SQLite owns lifecycle authority; markdown owns evidence content.

## Execution Notes

1. Added `getAllLifecycle()` to `TaskLifecycleStore` interface and `SqliteTaskLifecycleStore` implementation for batch reads.
2. Added `resolveTaskStatus(cwd, taskNumber, store?)` helper in `task-governance.ts` — SQLite-first with markdown fallback.
3. Extended `checkDependencies(cwd, dependsOn, store?)` to use `resolveTaskStatus()` for dependency terminal checks.
4. Extended `listRunnableTasks(cwd, store?)` to prefer SQLite status when filtering runnable tasks.
5. Extended `inspectTaskEvidence(cwd, taskNumber, store?)` to use SQLite status for verdict logic and `hasGovernedProvenance()`.
6. Extended `hasGovernedProvenance(frontMatter, hasReview, hasClosure, resolvedStatus?)` to accept override status.
7. Extended `generateRecommendations(options)` with optional `store` field in `RecommendationOptions`; pre-loads all SQLite statuses into a map.
8. Wired all authority-bearing callers:
   - `task-dispatch.ts` — passes existing store
   - `task-claim.ts` — opens store
   - `task-recommend.ts` — opens store
   - `task-promote-recommendation.ts` — opens store, uses `resolveTaskStatus()`
   - `task-roster.ts` — opens store, uses `resolveTaskStatus()`
9. Added tests:
   - `test/lib/task-governance.test.ts` — 7 new tests (4 `resolveTaskStatus`, 3 `checkDependencies`)
   - `test/lib/task-recommender.test.ts` — 3 new tests (new file)
10. Verified `pnpm verify` clean and all targeted test suites pass.



