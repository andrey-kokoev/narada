# Implementation — Conversation Records and Revisions

## Mission

Implement conversation record management, revision ordinal tracking, and migration from the legacy `thread_records` table.

## Scope

Primary targets:
- `packages/exchange-fs-sync/src/coordinator/store.ts`
- `packages/exchange-fs-sync/src/coordinator/migrations/` (new or extend existing)

## Consumes

- `20260414-004-coordinator-durable-state-v2.md` (Section 8 migration)
- `20260414-002-foreman-core-ontology-and-control-algebra.md`

## Dependencies

Blocks:
- `20260414-014-impl-foreman-core` (needs conversation records to exist)
- `20260414-015-impl-scheduler-and-leases` (needs work items to reference conversation records)

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`

## Tasks

1. **Migration from `thread_records` to `conversation_records`**
   - Detect `thread_records` existence at startup.
   - Auto-create `conversation_records` with `thread_id GENERATED ALWAYS AS (conversation_id) STORED`.
   - Copy data via the SQL from 004 Section 8.
   - Retain `thread_records` but mark deprecated in code comments.

2. **Revision ordinal service**
   - `nextRevisionOrdinal(conversation_id): number` — atomically increments and returns the next ordinal for a conversation.
   - `recordRevision(conversation_id, ordinal, trigger_event_id?): void` — inserts into `conversation_revisions`.
   - `getLatestRevisionOrdinal(conversation_id): number | null`

3. **Thread context hydration helper**
   - Given a `conversation_id` and revision ordinal, read the compiler's filesystem views (`views/by-thread/{conversation_id}/`) and return a `NormalizedThreadContext` object for the foreman.

## Definition of Done

- [x] Migration runs automatically and is idempotent
- [x] `nextRevisionOrdinal` is atomic (uses transaction with SELECT-then-INSERT)
- [x] Revision tracking survives process restart
- [x] Thread context hydration reads from compiler output, not Graph API
- [x] Unit tests for ordinal monotonicity, migration, and thread context hydration
