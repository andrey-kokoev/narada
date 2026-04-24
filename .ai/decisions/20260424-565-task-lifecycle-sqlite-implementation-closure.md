---
closes_tasks: [565]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: a2
governance: derive -> propose
---

# Decision 565 — Task Lifecycle SQLite Implementation Closure

## Status

Chapter 562–565 is closed. The first bounded SQLite-backed task lifecycle path is real, tested, and in production code.

---

## What This Chapter Produced

### Task 562 — SQLite Task Lifecycle Store

**File:** `packages/layers/cli/src/lib/task-lifecycle-store.ts`

A bounded SQLite store with five tables:

| Table | Purpose | Authority |
|-------|---------|-----------|
| `task_lifecycle` | Canonical lifecycle state | SQLite |
| `task_assignments` | Append-only assignment history | SQLite |
| `task_reports` | Durable execution evidence | SQLite |
| `task_reviews` | Durable review decisions | SQLite |
| `task_number_sequence` | Singleton allocator | SQLite |

**Store API:** `SqliteTaskLifecycleStore` provides initSchema, lifecycle CRUD, status updates with provenance, assignment tracking, report/review storage, and atomic task number allocation.

**Tests:** 27 tests in `test/lib/task-lifecycle-store.test.ts`.

### Task 563 — Projection-Backed Task Read Surface

**File:** `packages/layers/cli/src/lib/task-projection.ts`

The `inspectTaskEvidenceWithProjection()` function merges:
- **SQLite lifecycle** (status, assignments, reports, reviews, closure provenance)
- **Markdown specification** (acceptance criteria, execution notes, verification)

**Wired into:** `task-evidence` command — tries projection first, falls back to pure markdown when SQLite is unavailable.

**Tests:** 8 tests in `test/lib/task-projection.test.ts`.

### Task 564 — First Operator Write Migration

**Modified file:** `packages/layers/cli/src/commands/task-close.ts`

`task-close` is the first governed lifecycle writer to use SQLite authority:
- Reads authoritative status from SQLite (with markdown fallback during backfill)
- Backfills markdown-only tasks into SQLite on first touch
- Writes closure provenance (`closed_at`, `closed_by`, `governed_by`) to SQLite as the authoritative source
- Updates markdown front matter as a **compatibility projection**, not a second authority store

**Wired into:** `packages/layers/cli/src/main.ts` — opens `.ai/task-lifecycle.db` before command execution, closes in `finally`.

**Tests:** 5 additional tests in `test/commands/task-close.test.ts` (19 total).

---

## SQLite-Backed Surfaces (Now Real)

| Surface | File | SQLite Tables Used |
|---------|------|-------------------|
| Task lifecycle store | `task-lifecycle-store.ts` | All five |
| Evidence projection (read) | `task-projection.ts` | `task_lifecycle`, `task_assignments`, `task_reports`, `task_reviews` |
| Task close (write) | `task-close.ts` | `task_lifecycle` |
| Task number allocation | `task-lifecycle-store.ts` | `task_number_sequence` |

---

## Remaining Markdown-Authoritative Surfaces

| Surface | Why Still Markdown |
|---------|-------------------|
| Task specification (goal, required_work, acceptance criteria) | Markdown is the canonical authored spec per Decision 547 |
| Execution notes | Agent-authored body section |
| Verification notes | Agent-authored body section |
| `depends_on` | Markdown front matter (authored at creation) |
| `continuation_affinity` | Markdown front matter (authored at creation) |

---

## Deferred Migration Work (Post-565)

### Read Surfaces

| Surface | Current | Target | Blocker |
|---------|---------|--------|---------|
| `task evidence-list` | Pure markdown | Projection-backed | Batch-read optimization; straightforward extension of Task 563 pattern |
| `task graph` | Pure markdown | Projection-backed | Dependency data not yet in SQLite schema |
| `task roster show` | JSON roster | Projection-backed | Roster migration is a separate concern (Decision 546 out-of-scope #2) |

### Write Surfaces (Wave 1 per Decision 548)

| Operator | Current | Target | Complexity |
|----------|---------|--------|------------|
| `task-claim` | Markdown front matter | SQLite + markdown projection | Medium — involves assignment JSON → SQLite migration |
| `task-report` | Markdown front matter | SQLite + markdown projection | Medium — writes report record + status |
| `task-review` | Markdown front matter | SQLite + markdown projection | Medium — writes review record + status |
| `task-reopen` | Markdown front matter | SQLite + markdown projection | Low — status flip + provenance cleanup |
| `task-continue` | Markdown front matter | SQLite + markdown projection | Low — status flip + assignment record |

### Schema Extensions

| Extension | Need |
|-----------|------|
| `depends_on` in `task_lifecycle` | Required before `task graph` can migrate |
| `blocked_by` in `task_lifecycle` | Required before blocked-by graph edges can migrate |
| `created` timestamp | Currently in markdown front matter only |

---

## Authority Boundary Posture

The anti-duplication rule from Decision 549 is preserved:

- **SQLite owns:** `status`, `governed_by`, `closed_at`, `closed_by`, `reopened_at`, `reopened_by`, `continuation_packet_json`, `assignment_record_id`
- **Markdown owns:** `task_id`, `depends_on`, `continuation_affinity`, `goal`, `required_work`, `acceptance_criteria`, `execution_notes`, `verification`
- **Projection-only overlap (read-only in markdown):** `task_number` (displayed), `created` (displayed), `assigned_to` (derived), `review_status` (derived)

Markdown front matter for `task-close` is explicitly treated as a compatibility projection, not an authority source. The same pattern should apply to all subsequent writer migrations.

---

## Verification Evidence

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- `task-lifecycle-store.test.ts` — 27/27 pass ✅
- `task-projection.test.ts` — 8/8 pass ✅
- `task-close.test.ts` — 19/19 pass ✅
- `task-evidence.test.ts` — 12/12 pass ✅
- `task-evidence-list.test.ts` — 13/13 pass ✅
- No dual-authority fields introduced into markdown ✅

---

## Closure Statement

Chapter 562–565 closes with a real, tested SQLite-backed task lifecycle path. The store exists, one read surface uses projection-backed lifecycle state, and one governed writer (`task-close`) writes authoritative state to SQLite. Markdown remains the authored specification source. The migration is incremental — historical tasks remain inspectable without mandatory backfill, and the CLI falls back to markdown when SQLite is unavailable. Deferred work (remaining writer migrations, read surface cutover, schema extensions) is explicitly catalogued for subsequent chapters.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
