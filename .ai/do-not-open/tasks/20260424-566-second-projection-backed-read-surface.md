---
status: closed
closed_by: operator
closed_at: 2026-04-24T15:07:00Z
governed_by: task_close:operator
created: 2026-04-24
depends_on: [565]
---

# Task 566 - Second Projection-Backed Read Surface

## Goal

Move another meaningful task read surface onto SQLite-backed lifecycle projection beyond the first bounded v0 surface.

## Required Work

1. Choose a real read surface not yet migrated in v0, such as:
   - task list / roster-facing state views
   - task graph state rendering
   - task inspection surfaces adjacent to evidence
2. Implement the projection-backed lifecycle read.
3. Preserve user-facing behavior where possible.
4. Add focused tests.
5. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Another real read surface uses projection-backed lifecycle state
- [x] Markdown remains authored spec only
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Surface chosen: `task list`

The first v0 projection-backed read surface was `task evidence` (`inspectTaskEvidenceWithProjection`). The second surface migrated is `task list` (`listRunnableTasksWithProjection`).

### Implementation

**`packages/layers/cli/src/lib/task-projection.ts`**
- Added `listRunnableTasksWithProjection(cwd, store?)` — a merged read surface that:
  - Queries SQLite `task_lifecycle` for all tasks with runnable status (`opened`, `claimed`, `needs_continuation`)
  - Queries SQLite for ALL tasks (not just runnable) to build a suppression set, so a task with non-runnable SQLite status (e.g., `closed`) is excluded even if its markdown frontmatter says `opened`
  - Scans markdown for executable tasks not yet in SQLite
  - For tasks present in both: SQLite status wins authoritatively
  - Reads title, affinity, and dependencies from markdown (authored spec)
  - Computes affinity and sorts by strength descending
  - Returns `null` when SQLite DB does not exist (caller falls back to pure-markdown `listRunnableTasks`)

**`packages/layers/cli/src/commands/task-list.ts`**
- Now tries `listRunnableTasksWithProjection` first
- Falls back to `listRunnableTasks` when projection returns `null`
- No change to output shape or user-facing behavior

**Bug fix discovered during verification**
- `findTaskFile` regex `/^# Task (\d+)(?:\s+-|\s*$)/m` (introduced in Tasks 558–560) failed to match headings like `# Task 998: Dependency`
- This caused `findTaskFile` to throw ambiguity errors when a chapter range file shared a task number with an executable task
- Fixed to `/^# Task (\d+)\b/m` so it matches `# Task N`, `# Task N: Title`, and `# Task N - Title`

### Tests added

**`test/lib/task-projection.test.ts`** (5 new tests in `listRunnableTasksWithProjection` describe block):
1. Returns `null` when SQLite DB does not exist
2. Returns merged list with SQLite-authoritative status + markdown title/affinity
3. SQLite `closed` status excludes task even if markdown says `opened`
4. SQLite `opened` status includes task even if markdown says `closed`
5. Sorts by affinity strength descending

**`test/commands/task-list.test.ts`** (1 new test):
1. Uses SQLite projection when DB exists — verifies SQLite status wins over markdown frontmatter

### Verification

| Check | Result |
|-------|--------|
| `pnpm typecheck` (all 11 packages) | Clean |
| `test/lib/task-projection.test.ts` | 13/13 passing |
| `test/commands/task-list.test.ts` | 4/4 passing |
| `test/commands/task-claim.test.ts` | 14/14 passing (regex fix included) |

## Verification

- [x] `pnpm typecheck` all packages clean
- [x] New projection tests pass
- [x] `task-list` integration test passes
- [x] `findTaskFile` regex fix verified across task-claim suite
