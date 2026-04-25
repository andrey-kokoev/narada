---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T23:18:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [557, 558]
---

# Task 559 - Executable Task Filtering In Assignment Recommendation

## Goal

Make assignment recommendation consider only executable task artifacts, not chapter files or other non-executable task-shaped markdown artifacts.

## Why

The bounded autoassignment trials proved that recommendation and promotion work, but the recommendation surface still smears chapter artifacts into executable-task selection:

- chapter files like `546–550` appear as recommendation candidates
- executable tasks like `550` appear alongside their chapter artifact
- this creates noisy recommendations and weakens trust in the autoassignment surface

Narada already distinguishes executable task files from chapter files in task lookup. Recommendation should use the same distinction.

## Required Work

1. Inspect the recommendation input path and determine where candidate tasks are collected.
2. Reuse or align with the executable-task discrimination already used in task lookup / task graph fixes.
3. Ensure recommendation candidates exclude at least:
   - chapter range files
   - derivative status/report/closure artifacts
   - any non-executable task-shaped markdown file
4. Preserve recommendation behavior for true executable tasks.
5. Add focused tests covering:
   - chapter artifact + executable child task with overlapping numbers
   - recommendation for a specific executable task
   - repo-wide recommendation output excluding chapter artifacts
6. Verify bounded recommendation output no longer surfaces chapter files as candidates.

## Non-Goals

- Do not redesign scoring.
- Do not change chapter semantics.
- Do not widen this into a full recommendation-engine rewrite.

## Acceptance Criteria

- [x] Recommendation candidate set excludes chapter artifacts
- [x] Executable task recommendations still work
- [x] Overlapping chapter/task numbering does not reintroduce ambiguity in recommendation output
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined executable-task discrimination across the codebase:
- `packages/layers/cli/src/lib/task-graph.ts` — uses `/^[0-9]{8}-[0-9]+-[0-9]+/` to detect chapter range files
- `packages/layers/cli/src/lib/task-governance.ts` — `DERIVATIVE_SUFFIXES` excludes `-EXECUTED`, `-DONE`, `-RESULT`, `-FINAL`, `-SUPERSEDED`
- `packages/layers/cli/src/lib/task-recommender.ts` — previously loaded ALL `.md` files without filtering
- `packages/layers/cli/src/lib/task-governance.ts` — `listRunnableTasks` also loaded all `.md` files without filtering

### Key Changes

**1. Shared helper `isExecutableTaskFile` added to `task-governance.ts`**
- Excludes derivative files via `DERIVATIVE_SUFFIXES`
- Excludes chapter range files via `/^[0-9]{8}-[0-9]+-[0-9]+/`
- Exported for reuse by `task-graph.ts` (future alignment) and `task-recommender.ts`

**2. `task-recommender.ts` filtered**
- `generateRecommendations` now loads only executable task files: `(await readdir(tasksDir)).filter(isExecutableTaskFile)`
- Chapter files and derivative files are excluded from `allTasks` before any scoring begins

**3. `listRunnableTasks` filtered**
- `listRunnableTasks` now also uses `isExecutableTaskFile` instead of raw `.endsWith('.md')`
- Ensures consistency between `task list` and recommendation surfaces

### Test Coverage

Added 4 new tests in `task-recommend.test.ts`:
1. **"excludes chapter range files from recommendation candidates"**
   - Creates `20260420-995-999-chapter-artifact.md` with `status: opened`
   - Verifies it does NOT appear in primary, alternatives, or abstained
2. **"excludes derivative files from recommendation candidates"**
   - Creates `20260420-994-task-DONE.md` with `status: opened`
   - Verifies derivative files are excluded
3. **"recommends executable task when chapter file shares overlapping numbers"**
   - Creates chapter `20260420-990-995-chapter-range.md` and executable `20260420-991-executable-task.md`
   - Verifies chapter is excluded and executable task is included
4. **"filters by specific executable task number despite chapter files"**
   - Creates chapter range with `status: opened`
   - Filters recommendation to task 998
   - Verifies only task 998 is recommended, chapter is not present

### Verification

- `pnpm typecheck`: all 11 packages clean ✅
- CLI focused tests: 191/191 passing (8 test files including task-recommend, task-list, task-claim, task-promote-recommendation, task-roster, task-governance, construction-loop-run, workbench-server) ✅
- `debug2-recommend.test.ts`: 2/2 passing ✅
- No chapter files or derivative files appear in recommendation output ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
