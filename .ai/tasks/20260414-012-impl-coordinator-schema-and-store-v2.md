# Implementation — Coordinator Schema and Store v2

## Mission

Implement the normative SQLite schema and TypeScript store layer for the Narada control-plane v2 durable state.

## Scope

Primary targets:
- `packages/exchange-fs-sync/src/coordinator/schema-v2.sql` (new)
- `packages/exchange-fs-sync/src/coordinator/store.ts` (extend)
- `packages/exchange-fs-sync/src/coordinator/types.ts` (extend)

## Consumes

- `20260414-004-coordinator-durable-state-v2.md` (after 004b corrections applied)
- `20260414-003-identity-lattice-and-canonical-keys.md`

## Tasks

1. **Create `schema-v2.sql`**
   - Include `CREATE TABLE IF NOT EXISTS` for:
     - `conversation_records`
     - `conversation_revisions`
     - `work_items`
     - `work_item_leases`
     - `execution_attempts`
     - `evaluations`
     - `tool_call_records`
   - Include all indexes from 004.
   - Ensure enums in SQL comments match 004b-corrected values.

2. **Extend `coordinator/types.ts`**
   - Add TypeScript interfaces:
     - `ConversationRecord`
     - `ConversationRevision`
     - `WorkItem` / `WorkItemStatus`
     - `WorkItemLease`
     - `ExecutionAttempt` / `ExecutionAttemptStatus`
     - `Evaluation`
     - `ToolCallRecord` / `ToolCallStatus`

3. **Extend `coordinator/store.ts`**
   - Add CRUD methods for each new table (at minimum: insert, select by primary key, select by foreign key indexes).
   - Keep `SqliteCoordinatorStore` as the single class.
   - Use `better-sqlite3` prepared statements.

## Definition of Done

- [ ] `schema-v2.sql` exists and is loadable by `initSchema()`
- [ ] All new types are exported from `coordinator/types.ts`
- [ ] Store has basic CRUD for all new tables
- [ ] `pnpm typecheck` passes in `exchange-fs-sync`
- [ ] Unit tests for store CRUD exist in `test/unit/persistence/coordinator-store.test.ts`
