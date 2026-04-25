---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
depends_on: [565]
---

# Task 567 - Second Governed Writer Migration

## Goal

Migrate another governed task lifecycle writer from markdown front-matter authority to SQLite authority.

## Required Work

1. Choose the next bounded governed writer after v0, such as:
   - `task-review`
   - `task-close`
   - `task-continue`
2. Implement the SQLite-backed write path.
3. Preserve governed provenance and audit requirements.
4. Avoid leaving markdown as a second authority source.
5. Add focused tests.
6. Record verification or bounded blockers.

## Acceptance Criteria

- [x] A second governed lifecycle writer uses SQLite authority
- [x] Governed provenance remains intact
- [x] Markdown is not left as duplicate lifecycle authority
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined candidate writers:
- `task-review` — writes review records, transitions status based on verdict, sets governed provenance
- `task-continue` — manages assignment continuations/takeovers, roster updates
- `task-claim` — creates assignments, updates roster

Selected **`task-review`** as the second writer because:
- It follows the same pattern as `task-close` (status transition + provenance)
- It writes to `task_reviews` table which already exists in the SQLite schema
- It is bounded in scope (review record + status transition)
- No roster assignment JSON manipulation (unlike claim/continue)

### Implementation

**`packages/layers/cli/src/commands/task-review.ts`**:
- Added optional `store?: TaskLifecycleStore` to `TaskReviewOptions`
- Added SQLite backfill logic (same pattern as task-close): if task exists in markdown but not in SQLite, backfill lifecycle row from frontmatter
- `in_review` validation now uses SQLite status when available; falls back to markdown frontmatter
- On successful review:
  - Writes review record to SQLite `task_reviews` table via `store.insertReview()`
  - Updates task status in SQLite `task_lifecycle` table via `store.updateStatus()`
  - For `accepted`/`accepted_with_notes`: transitions to `closed` with `closed_at`, `closed_by`, `governed_by`
  - For `rejected`: transitions to `opened`
- Markdown front matter is still updated for backward compatibility and git visibility, but is explicitly treated as a compatibility projection, not an authority source
- Verdict mapping: `accepted_with_notes` → `'accepted'` in SQLite (schema does not distinguish the two)

**`packages/layers/cli/src/main.ts`**:
- Wired `openTaskLifecycleStore(cwd)` into the `task review` CLI action
- Store is opened before command execution and closed in a `finally` block

### Test Coverage

Added 4 new tests under `describe('with SQLite store (Task 567)')` in `test/commands/task-review.test.ts`:
1. **"writes authoritative review and lifecycle state to SQLite on accept"**
   - Verifies `task_reviews` table has the review with correct verdict and reviewer
   - Verifies `task_lifecycle` row has `status: 'closed'`, `closed_by`, `governed_by`
2. **"backfills markdown-only task into SQLite before reviewing"**
   - Confirms task does not exist in SQLite before review
   - Confirms task is backfilled and closed in SQLite after review
3. **"uses SQLite status over markdown status when both exist"**
   - Pre-seeds SQLite with `opened` status while markdown says `in_review`
   - Verifies review is blocked because SQLite status wins
4. **"writes rejected status to SQLite"**
   - Verifies review record with `rejected` verdict is stored
   - Verifies lifecycle status transitions to `opened`

### Verification

- `pnpm verify`: 5/5 steps pass ✅
- `task-review.test.ts`: 19/19 passing (15 existing + 4 new) ✅
- `task-close.test.ts`: 19/19 passing ✅
- `task-projection.test.ts`: 13/13 passing ✅
- `task-lifecycle-store.test.ts`: 27/27 passing ✅

### Bounded Blockers

- **Remaining writers**: `task-claim`, `task-report`, `task-continue`, `task-reopen` still mutate markdown front matter exclusively. They will be migrated in subsequent tasks.
- **Read surfaces**: `task evidence-list` and `task graph` still inspect markdown front matter. Projection-backed migration (Task 563) covers single-task evidence; list/graph remain deferred.
- **Backfill scope**: Only tasks touched by `task-review` are backfilled into SQLite. Historical reviewed tasks remain markdown-only until explicitly accessed.

---

**Closed by:** a2  
**Closed at:** 2026-04-24

