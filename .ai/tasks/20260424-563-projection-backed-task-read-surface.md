---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
depends_on: [562]
---

# Task 563 - Projection-Backed Task Read Surface

## Goal

Move at least one real task read surface onto projection-backed lifecycle state from SQLite plus markdown-authored specification.

## Required Work

1. Choose bounded read surfaces such as:
   - task evidence
   - dependency readiness
   - task graph state rendering
2. Implement a merged projection that reads lifecycle authority from SQLite and task narrative/spec from markdown.
3. Preserve current user-facing behavior as much as possible.
4. Add focused tests.
5. Record verification or bounded blockers.

## Acceptance Criteria

- [x] At least one real read surface uses projection-backed lifecycle state
- [x] Markdown remains authored spec source only
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined existing read surfaces:
- `task evidence` (single task inspection) — reads status, criteria, execution notes, verification, reports, reviews, assignments, closures
- `task evidence-list` (repo-wide listing) — iterates all tasks and calls `inspectTaskEvidence`
- `task graph` — reads dependencies and status for Mermaid/JSON rendering

Selected **task evidence** as the first projection-backed read surface because:
- It exercises all SQLite tables (`task_lifecycle`, `task_assignments`, `task_reports`, `task_reviews`)
- It clearly demonstrates the merged projection pattern (SQLite lifecycle + markdown spec)
- It is a real, user-facing command (`narada task evidence <number>`)

### Implementation

**New file: `packages/layers/cli/src/lib/task-projection.ts`**

The projection layer provides:
- `getTaskLifecycleDbPath(cwd)` — standard path resolution (`.ai/task-lifecycle.db`)
- `openTaskLifecycleStore(cwd)` — dynamic import of `Database` from `@narada2/control-plane`, opens DB if file exists, returns null otherwise
- `inspectTaskEvidenceWithProjection(cwd, taskNumber, store?)` — merged projection function

**Merged projection logic:**
1. Find the task markdown file (for task_id mapping)
2. Open SQLite store (or use provided store)
3. Read lifecycle row from SQLite by `task_number` or `task_id`
4. Read authored specification from markdown:
   - Acceptance criteria (checked/unchecked count)
   - Execution notes section presence
   - Verification section presence
5. Read durable state from SQLite (authoritative):
   - `status` from `task_lifecycle.status`
   - `has_report` from `task_reports` count
   - `has_review` from `task_reviews` count
   - `has_closure` from `task_lifecycle.closed_at !== null`
   - `active_assignment_intent` from active `task_assignments` row
6. Merge SQLite lifecycle fields into frontmatter for `hasGovernedProvenance` check
7. Compute evidence verdict using the same rules as the original `inspectTaskEvidence`

**Modified file: `packages/layers/cli/src/commands/task-evidence.ts`**
- Added import for `inspectTaskEvidenceWithProjection`
- Changed evidence fetching to try projection first, fall back to `inspectTaskEvidence` when SQLite is unavailable or task not found in SQLite
- Zero changes to output formatting or user-facing behavior

### Design Decisions

**Why task evidence (not evidence-list or graph)?**
- `task evidence` is the most granular read surface; if the projection works here, the same pattern applies to list and graph
- Evidence-list iterates all tasks; making it projection-aware is a straightforward extension once the single-task projection is proven
- Task graph depends on dependency data which is not yet in the SQLite schema

**Backward compatibility:**
- When `.ai/task-lifecycle.db` does not exist, `inspectTaskEvidenceWithProjection` returns `null`
- The command falls back to `inspectTaskEvidence` (pure markdown/filesystem)
- Existing tests pass without modification
- No breaking changes to CLI interface or output format

**Authority boundary (Decision 547):**
- SQLite owns lifecycle state: status, assignments, reports, reviews, closure timestamps
- Markdown owns authored specification: criteria, execution notes, verification
- `hasGovernedProvenance` uses merged frontmatter (SQLite `closed_by`/`closed_at`/`governed_by` + markdown fields)

### Test Coverage

**New tests in `test/lib/task-projection.test.ts` (8 tests):**
1. Returns `null` when SQLite DB does not exist
2. Returns `null` when task is not in SQLite store
3. Returns merged evidence when task is in SQLite (status, criteria, execution notes)
4. Uses SQLite status over markdown frontmatter status
5. Uses reports from SQLite
6. Uses reviews from SQLite (accepted review → verdict computation)
7. Uses active assignment from SQLite
8. `openTaskLifecycleStore` returns `null` when DB file does not exist

**Existing test preservation:**
- `test/commands/task-evidence.test.ts`: 12/12 passing ✅
- `test/commands/task-evidence-list.test.ts`: 13/13 passing ✅
- `test/lib/task-lifecycle-store.test.ts`: 27/27 passing ✅

### Verification

- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅
- `task-projection.test.ts`: 8/8 passing ✅
- `task-evidence.test.ts`: 12/12 passing ✅
- `task-evidence-list.test.ts`: 13/13 passing ✅

### Deferred / Next Steps

- **Task evidence-list**: Can be migrated to use projection by batch-reading lifecycle rows and merging with markdown. Deferred to Task 564 or a follow-up.
- **Task graph**: Dependency data is not yet in SQLite schema. Requires schema extension before projection migration.
- **Write migration**: Task 564 will migrate the first governed writers to SQLite authority, populating the store with real data.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
