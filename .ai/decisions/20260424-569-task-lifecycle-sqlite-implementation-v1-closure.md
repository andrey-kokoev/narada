---
closes_tasks: [569]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 569 — Task Lifecycle SQLite Implementation v1 Closure

## Status

Chapter 566–569 is closed. The second slice of SQLite-backed task governance is landed: a projection-backed read surface, a governed writer migration, and dependency/recommendation lifecycle reads are now SQLite-authoritative.

---

## What This Chapter Produced

### Task 566 — Second Projection-Backed Read Surface

**Artifact:** `.ai/do-not-open/tasks/20260424-566-second-projection-backed-read-surface.md`

**Files:**
- `packages/layers/cli/src/lib/task-projection.ts` — `listRunnableTasksWithProjection(cwd, store?)`
- `packages/layers/cli/src/commands/task-list.ts` — uses projection first, falls back to markdown
- `packages/layers/cli/test/lib/task-projection.test.ts` — 5 new tests
- `packages/layers/cli/test/commands/task-list.test.ts` — 1 new test

**Surface behavior:**
- Queries SQLite `task_lifecycle` for runnable statuses (`opened`, `claimed`, `needs_continuation`)
- Queries SQLite for ALL tasks to build a suppression set (tasks with non-runnable SQLite status are excluded even if markdown says otherwise)
- Scans markdown for executable tasks not yet in SQLite
- SQLite status wins authoritatively; title/affinity/dependencies read from markdown (authored spec)
- Returns `null` when SQLite DB does not exist (caller falls back to pure-markdown `listRunnableTasks`)

**Bug fix:** `findTaskFile` regex relaxed from `/^# Task (\d+)(?:\s+-|\s*$)/m` to `/^# Task (\d+)\b/m` to match headings like `# Task 998: Dependency`.

### Task 567 — Second Governed Writer Migration

**Artifact:** `.ai/do-not-open/tasks/20260424-567-second-governed-writer-migration.md`

**Files:**
- `packages/layers/cli/src/commands/task-review.ts` — SQLite-backed review and status transition
- `packages/layers/cli/src/main.ts` — wired `openTaskLifecycleStore` into `task review` action
- `packages/layers/cli/test/commands/task-review.test.ts` — 4 new tests

**Writer behavior:**
- Optional `store?: TaskLifecycleStore` in `TaskReviewOptions`
- SQLite backfill: if task exists in markdown but not in SQLite, backfills lifecycle row from frontmatter
- `in_review` validation uses SQLite status when available; falls back to markdown
- On successful review:
  - Writes review record to SQLite `task_reviews` table
  - Updates task status in SQLite `task_lifecycle` table
  - `accepted`/`accepted_with_notes` → `closed` with `closed_at`, `closed_by`, `governed_by`
  - `rejected` → `opened`
- Markdown front matter updated for backward compatibility and git visibility, but treated as compatibility projection, not authority

### Task 568 — SQLite-Backed Dependency And Recommendation Reads

**Artifact:** `.ai/do-not-open/tasks/20260424-568-sqlite-backed-dependency-and-recommendation-reads.md`

**Files:**
- `packages/layers/cli/src/lib/task-governance.ts` — `resolveTaskStatus()`, `checkDependencies(store?)`, `listRunnableTasks(store?)`, `inspectTaskEvidence(store?)`, `hasGovernedProvenance(resolvedStatus?)`
- `packages/layers/cli/src/lib/task-recommender.ts` — `generateRecommendations({ store? })`
- `packages/layers/cli/src/lib/task-lifecycle-store.ts` — `getAllLifecycle()`
- `packages/layers/cli/src/commands/task-dispatch.ts` — passes store to `checkDependencies`
- `packages/layers/cli/src/commands/task-claim.ts` — opens store, passes to `checkDependencies`
- `packages/layers/cli/src/commands/task-recommend.ts` — opens store, passes to `generateRecommendations`
- `packages/layers/cli/src/commands/task-promote-recommendation.ts` — opens store, uses `resolveTaskStatus()`, passes to `checkDependencies`
- `packages/layers/cli/src/commands/task-roster.ts` — opens store, uses `resolveTaskStatus()`, passes to `checkDependencies`
- `packages/layers/cli/test/lib/task-governance.test.ts` — 7 new tests
- `packages/layers/cli/test/lib/task-recommender.test.ts` — 3 new tests (new file)

**Read behavior:**
- `resolveTaskStatus(cwd, taskNumber, store?)` — SQLite-first, markdown fallback
- `checkDependencies(cwd, dependsOn, store?)` — dependency terminal checks via `resolveTaskStatus()`
- `listRunnableTasks(cwd, store?)` — filters by SQLite status when store provided
- `inspectTaskEvidence(cwd, taskNumber, store?)` — uses SQLite status for verdict and `hasGovernedProvenance()`
- `generateRecommendations(options)` — optional `store`; pre-loads all SQLite statuses into a map; passes store to `checkDependencies()`
- All authority-bearing callers wired; graceful markdown fallback preserved for unwired callers

---

## Settled Doctrine

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Second projection-backed read surface | ✅ | `listRunnableTasksWithProjection` in `task-projection.ts` |
| Second governed writer migrated | ✅ | `task-review` writes to `task_reviews` + `task_lifecycle` |
| Dependency validation SQLite-backed | ✅ | `checkDependencies(store?)` uses `resolveTaskStatus()` |
| Recommendation reads SQLite-backed | ✅ | `generateRecommendations({ store? })` pre-loads SQLite statuses |
| Evidence inspection uses SQLite status | ✅ | `inspectTaskEvidence(store?)` + `hasGovernedProvenance(resolvedStatus?)` |
| All authority-bearing callers wired | ✅ | dispatch, claim, recommend, promote-recommendation, roster |
| Tests exist | ✅ | 15 new tests across task-governance, task-recommender, task-review, task-projection, task-list |
| Markdown not duplicate authority | ✅ | SQLite status wins; markdown is compatibility projection |

---

## Remaining Markdown-Only Surfaces

| Surface | Why Still Markdown | Migration Path |
|---------|-------------------|----------------|
| `task-claim` | Creates assignments in JSON; roster mutation | Future task: migrate assignments to SQLite |
| `task-report` | Writes report JSON; no lifecycle transition | Future task: reports already in SQLite; assignment linking deferred |
| `task-continue` | Manages continuations/takeovers in JSON | Future task: continuation records in SQLite |
| `task-reopen` | Reopens terminal tasks | Future task: status transition + provenance update |
| `task evidence-list` | Lists evidence for multiple tasks | Can use `inspectTaskEvidence` with store |
| `task graph` | Mermaid rendering | Read-only; can query SQLite for status colors |
| `listRunnableTasks(..., store)` explicit tests | No dedicated SQLite-filtering test | Low risk; fallback behavior verified |

---

## Deferred Gaps

| Item | Why Deferred |
|------|-------------|
| **Assignment migration to SQLite** | Assignments still in JSON; `assignment_id` FK deferred until assignment table exists |
| **Auto-dispatch on claim** | Flag exists in contract but not wired into `task-claim` yet |
| **Full roster state in SQLite** | Roster still JSON; operational status updates mutate JSON |
| **Historical task backfill** | Only tasks touched by `task-close`, `task-review`, or `task-dispatch` are backfilled |
| **Governed writer: task-claim** | Assignment JSON manipulation makes it larger than bounded writer migration |
| **Governed writer: task-continue** | Continuation records involve multiple tables (assignments, continuations) |
| **Governed writer: task-reopen** | Reopening requires undoing closure provenance; needs careful design |

---

## Residual Risks

1. **JSON assignment drift.** Assignments are still in JSON while some lifecycle state is in SQLite. If the JSON and SQLite diverge (e.g., task released in JSON but still `claimed` in SQLite), read surfaces may show inconsistent state. Mitigation: both are read from the same filesystem; the risk is bounded to concurrent mutations.
2. **Backfill inconsistency.** Tasks backfilled from markdown may have stale `governed_by` or `closed_at` values if the markdown was edited after closure. Mitigation: backfill reads front matter at touch time; tasks that were properly closed through governed operators have correct provenance.
3. **Markdown as visible projection.** Markdown front matter is still updated for git visibility, creating a potential for human editors to trust it as authority. Mitigation: all new read surfaces prefer SQLite; the invariant "SQLite wins" is documented.
4. **Unwired callers.** `task-list` falls back to markdown when SQLite DB does not exist; `task-promote-recommendation` and `task-roster` did not pass store until Task 568. Mitigation: all authority-bearing callers are now wired; fallback is graceful and bounded.

---

## Verification Evidence

- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅
- `task-governance.test.ts`: 57/57 pass ✅
- `task-recommender.test.ts`: 3/3 pass ✅
- `task-review.test.ts`: 19/19 pass ✅
- `task-projection.test.ts`: 13/13 pass ✅
- `task-list.test.ts`: 4/4 pass ✅
- `task-dispatch.test.ts`: 14/14 pass ✅
- `task-recommend.test.ts`: 11/11 pass ✅
- `task-promote-recommendation.test.ts`: 15/15 pass ✅
- `task-roster.test.ts`: 27/27 pass ✅
- `task-lifecycle-store.test.ts`: 27/27 pass ✅

---

## Closure Statement

Chapter 566–569 closes with three concrete SQLite-backed surfaces landed: a projection-backed task list, a governed review writer, and dependency/recommendation lifecycle reads. The task governance system now has multiple read surfaces and two governed writers (`task-close` from v0, `task-review` from v1) that treat SQLite as the authoritative lifecycle source. Markdown remains the authored spec and compatibility projection, not a duplicate authority. Deferred work (assignment migration, remaining governed writers, roster SQLite) is explicitly catalogued for subsequent chapters.

---

**Closed by:** a3  
**Closed at:** 2026-04-24
