---
closes_tasks: [564]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: a2
governance: derive -> propose
---

# Decision 564 — First Operator Write Migration

## Problem

Decision 547 defined the SQLite schema and projection split. Decision 548 planned the operator migration in three waves. Task 562 implemented the SQLite lifecycle store. What remained was the first concrete operator rewrite: migrating one governed lifecycle writer from markdown front-matter mutation to SQLite authority.

## Selected Operator

`task-close` was chosen as the first migration target.

**Why `task-close`:**
- No roster dependency (unlike `task-claim`)
- No assignment JSON manipulation (unlike `task-claim`)
- Only mutates status + three provenance fields (unlike `task-report` which scaffolds body sections)
- Clear success/failure semantics
- Existing evidence gate infrastructure is orthogonal to the write target

**Why not `task-claim`:** Assignment JSON and roster coupling add surface area; better as second migration after close pattern is proven.

**Why not `task-review`:** Review writes to both `task_reviews` table and lifecycle status; simpler to prove the basic pattern with `task-close` first.

## Changes

### 1. `task-lifecycle-store.ts` — Store Factory

Added `openTaskLifecycleStore(cwd: string)` helper:
- Opens `.ai/tasks/task-lifecycle.db`
- Initializes schema if not present
- Returns ready-to-use `SqliteTaskLifecycleStore`

### 2. `task-close.ts` — Dual-Write Path

Modified `taskCloseCommand` to accept optional `store?: TaskLifecycleStore`:

**Backfill on first encounter:**
If a task file exists but has no `task_lifecycle` row, the command backfills from markdown front matter before proceeding. This provides seamless transition for existing tasks.

**Status resolution priority:**
1. SQLite `status` (authoritative)
2. Markdown `status` (compatibility fallback during transition)

**Mutation order:**
1. Validate closure gates (evidence inspection — still reads markdown body)
2. Write to SQLite via `updateStatus('closed', actor, provenance)`
3. Write to markdown front matter for git visibility and backward compatibility

**Key invariant:** SQLite write happens first conceptually; markdown is a compatibility projection.

### 3. `main.ts` — CLI Wiring

The `task close` action now:
1. Opens the lifecycle store via `openTaskLifecycleStore(cwd)`
2. Passes it to `taskCloseCommand`
3. Closes the DB in a `finally` block

### 4. Tests — 5 New Focused Cases

| Test | What It Proves |
|------|----------------|
| writes authoritative lifecycle state to SQLite on close | SQLite row created with correct status/provenance |
| backfills markdown-only task into SQLite before closing | Seamless transition for legacy tasks |
| uses SQLite status over markdown status when both exist | SQLite wins in case of disagreement |
| blocks close when SQLite status is already terminal | Idempotent validation for already-closed tasks |
| preserves governed provenance in SQLite on closure | `governed_by`, `closed_by`, `closed_at` recorded |

## Authority Posture

| Store | Role After This Decision |
|-------|--------------------------|
| SQLite `task_lifecycle` | **Authoritative** for `task-close` status and provenance |
| Markdown front matter | **Compatibility projection** — still written for git diff visibility, but not authoritative |
| Markdown body | **Still authoritative** for evidence (execution notes, verification, criteria) |

## Compatibility Rules

1. Existing `task-close` tests pass unchanged (store is optional; backward compatible)
2. Tasks not yet in SQLite are backfilled on first close attempt
3. Markdown front matter continues to receive lifecycle fields for display
4. If SQLite and markdown disagree, SQLite wins (enforced by reading SQLite first)

## Bounded Blockers

| # | Blocker | Why Deferred |
|---|---------|-------------|
| 1 | `inspectTaskEvidence` still reads `governed_by` from markdown | Task 563 (projection-backed reads) will switch evidence inspection to prefer SQLite |
| 2 | Other operators (`task-claim`, `task-report`, etc.) still write markdown only | Wave 1 migration continues in subsequent tasks |
| 3 | Historical closed tasks not backfilled until accessed | Backfill is on-demand, not all-at-once |

## Verification

- `pnpm typecheck` passes for `@narada2/cli` ✅
- 19 `task-close` tests pass (14 existing + 5 new) ✅
- 27 `task-lifecycle-store` tests pass ✅
- No regressions in existing CLI tests ✅

## Closure Statement

Task 564 closes with `task-close` migrated to SQLite authority. The operator backfills legacy tasks on first encounter, writes canonical lifecycle state to SQLite, and preserves markdown front matter as a compatibility projection. Five focused tests verify the new path. The migration pattern established here (backfill → SQLite write → markdown projection) will be reused for `task-claim`, `task-report`, `task-review`, and other Wave 1 operators.
