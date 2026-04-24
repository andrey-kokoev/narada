---
status: closed
closed: 2026-04-24
depends_on: [562]
governed_by: task_close:a2
---

# Task 564 - First Operator Write Migration

## Goal

Migrate the first bounded governed task lifecycle write operator from markdown front-matter authority to SQLite authority.

## Required Work

1. Select the safest first writer, such as:
   - `task-claim`
   - `task-close`
   - `task-review`
2. Implement the SQLite-backed write path.
3. Preserve governed provenance and audit expectations.
4. Avoid duplicating authority in markdown.
5. Add focused tests.
6. Record verification or bounded blockers.

## Acceptance Criteria

- [x] One governed lifecycle writer uses SQLite authority
- [x] Governed provenance remains intact
- [x] Markdown is not left as a second authoritative lifecycle store
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

Selected `task-close` as the safest first writer because it has no roster dependency, no assignment JSON manipulation, and only writes status + three provenance fields (`closed_at`, `closed_by`, `governed_by`).

Changes made:

1. **`packages/layers/cli/src/lib/task-lifecycle-store.ts`**
   - Added `openTaskLifecycleStore(cwd: string)` helper that opens/creates `.ai/tasks/task-lifecycle.db`, initializes schema, and returns `SqliteTaskLifecycleStore`.

2. **`packages/layers/cli/src/commands/task-close.ts`**
   - Added optional `store?: TaskLifecycleStore` to `TaskCloseOptions`.
   - On execution: if store is provided, backfill task lifecycle row from markdown front matter if not yet in SQLite.
   - Status transition validation now uses SQLite status when available; falls back to markdown front matter during transition.
   - On successful close: writes authoritative state to SQLite via `updateStatus('closed', actor, { closed_at, closed_by, governed_by })`.
   - Markdown front matter is still updated for backward compatibility and git visibility, but is explicitly treated as a compatibility projection, not an authority source.

3. **`packages/layers/cli/src/main.ts`**
   - Wired `openTaskLifecycleStore(cwd)` into the `task close` CLI action.
   - Store is opened before command execution and closed in a `finally` block.

4. **`packages/layers/cli/test/commands/task-close.test.ts`**
   - Added 5 focused tests under `describe('with SQLite store (Task 564)')`:
     - `writes authoritative lifecycle state to SQLite on close`
     - `backfills markdown-only task into SQLite before closing`
     - `uses SQLite status over markdown status when both exist`
     - `blocks close when SQLite status is already terminal`
     - `preserves governed provenance in SQLite on closure`

## Verification

- `pnpm typecheck` passes for `@narada2/cli` ✅
- `npx vitest run test/commands/task-close.test.ts` — 19 tests pass (14 existing + 5 new) ✅
- `npx vitest run test/lib/task-lifecycle-store.test.ts` — 27 tests pass ✅
- Pre-existing `task-projection.test.ts` failure is unrelated to this change (reproduces without these edits) ✅

## Bounded Blockers

- **Task 563 dependency**: Read surfaces (`task-evidence`, `task-graph`) still inspect markdown front matter for `governed_by` and `status`. A full authority cutover requires Task 563 (projection-backed reads) to switch evidence inspection to prefer SQLite provenance.
- **Other writers**: `task-claim`, `task-report`, `task-review`, `task-reopen`, `task-continue` still mutate markdown front matter exclusively. They will be migrated in subsequent tasks (Wave 1 per Decision 548).
- **Backfill scope**: Only tasks touched by `task-close` are backfilled into SQLite. Historical closed tasks remain markdown-only until explicitly accessed.
