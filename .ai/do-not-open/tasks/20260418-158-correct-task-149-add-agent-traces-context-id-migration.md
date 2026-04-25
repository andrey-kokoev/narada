# Task 158: Correct Task 149 Add Agent Traces Context-Id Migration

## Why

Task 149 renamed generic agent trace storage from `conversation_id` to `context_id`, but review found the migration path is missing.

Fresh databases are correct, but existing databases with an old `agent_traces.conversation_id` column will not be upgraded because `initSchema()` uses `create table if not exists`.

That means a previously initialized database can keep the old schema, then new writes fail because `writeTrace()` inserts into `context_id`.

## Finding Being Corrected

`packages/layers/control-plane/src/agent/traces/store.ts` now creates:

- `context_id text not null`

but does not migrate an existing table that has:

- `conversation_id text not null`

There is also no test proving old trace stores survive the rename.

## Goal

Make Task 149 safe for existing databases, not only fresh ones.

## Required Outcomes

### 1. Add schema migration for old `agent_traces`

During `SqliteAgentTraceStore.initSchema()`, detect an existing `agent_traces` table with `conversation_id` and no `context_id`.

Migrate it to the new schema while preserving existing rows.

Use a simple, deterministic SQLite migration pattern that is safe for local stores.

### 2. Preserve trace data

Existing values from `conversation_id` must become `context_id`.

Other trace fields must be preserved.

### 3. Update indexes

After migration:

- `idx_agent_traces_context` should exist
- stale `idx_agent_traces_conversation` should not remain authoritative

### 4. Add regression tests

Add a unit test that:

- creates an old-shape `agent_traces` table with `conversation_id`
- inserts a row
- calls `initSchema()`
- proves the row is readable through `readByContextId()`
- proves new `writeTrace()` calls work

## Deliverables

- trace-store schema migration
- regression test for old-schema upgrade
- no return of generic trace `conversation_id` API

## Definition Of Done

- [ ] existing `agent_traces.conversation_id` stores migrate to `context_id`
- [ ] existing trace rows are preserved
- [ ] new trace writes work after migration
- [ ] regression test covers the migration path
- [ ] no derivative task-status files are created

## Notes

This is a narrow corrective task for Task 149.

Do not reintroduce `conversation_id` into the public trace API. It should appear only inside migration code/tests for backward compatibility.
