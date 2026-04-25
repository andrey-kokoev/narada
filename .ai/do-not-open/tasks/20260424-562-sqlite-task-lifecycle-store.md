---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T13:18:00.000Z
closed_by: a3
governed_by: task_close:a3
depends_on: [550]
---

# Task 562 - SQLite Task Lifecycle Store

## Goal

Implement the bounded SQLite store for authoritative task lifecycle state described in Tasks 546 and 547.

## Required Work

1. Add the minimum SQLite schema for task lifecycle authority.
2. Place it in the appropriate Narada control/governance layer rather than as an ad hoc local file.
3. Define the first canonical read/write helpers for lifecycle rows.
4. Keep markdown task specification separate.
5. Record verification or bounded blockers.

## Acceptance Criteria

- [x] SQLite lifecycle schema exists
- [x] Read/write helpers exist for bounded lifecycle operations
- [x] No duplicated lifecycle authority is introduced into markdown
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Implementation

Created `packages/layers/cli/src/lib/task-lifecycle-store.ts` — the bounded SQLite-backed task lifecycle store.

**Schema (5 tables):**
- `task_lifecycle` — canonical lifecycle state (task_id PK, task_number UNIQUE, status, governed_by, closed_at, closed_by, reopened_at, reopened_by, continuation_packet_json, updated_at)
- `task_assignments` — append-only assignment history (FK to task_lifecycle)
- `task_reports` — durable execution evidence records (FK to task_lifecycle)
- `task_reviews` — durable review decisions (FK to task_lifecycle)
- `task_number_sequence` — singleton allocator table replacing `.ai/do-not-open/tasks/tasks/.registry.json`

**Store class (`SqliteTaskLifecycleStore`):**
- `initSchema()` — idempotent schema creation with indexes and FK enforcement
- `upsertLifecycle()` / `getLifecycle()` / `getLifecycleByNumber()` — lifecycle CRUD
- `updateStatus()` — atomic status transition with optional provenance updates
- `insertAssignment()` / `getActiveAssignment()` / `getAssignments()` / `releaseAssignment()` — assignment tracking
- `insertReport()` / `listReports()` — report storage
- `insertReview()` / `listReviews()` — review storage
- `allocateTaskNumber()` / `getLastAllocated()` — atomic number allocation via transaction

**Design choices:**
- Placed in `packages/layers/cli/src/lib/` alongside existing `task-governance.ts`
- Uses `Database.Database` type imported via `@narada2/control-plane` (avoids eager native-module load)
- Constructor accepts `db` parameter; caller manages DB lifecycle (consistent with CLI command patterns)
- No markdown mutation — store is pure SQLite authority
- `update_at` generated in JS layer for explicit control

### Tests

Created `packages/layers/cli/test/lib/task-lifecycle-store.test.ts` with 27 tests covering:
- Schema initialization (idempotency, singleton sequence)
- Lifecycle CRUD (insert, read, upsert, unique constraints)
- Status updates with provenance
- Assignment lifecycle (insert, active query, release, ordering)
- Report and review storage
- Task number allocation (sequential, concurrent simulation)
- Foreign key enforcement

## Verification

- `pnpm verify` — all 5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- `pnpm exec vitest run test/lib/task-lifecycle-store.test.ts` — 27/27 tests pass ✅
- No markdown lifecycle authority introduced ✅
- Store is SELECT/INSERT/UPDATE only; no direct markdown writes ✅
