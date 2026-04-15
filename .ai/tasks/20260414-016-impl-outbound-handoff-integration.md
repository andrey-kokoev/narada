# Implementation — Outbound Handoff Integration

## Mission

Wire the foreman's outbound handoff into the existing outbound worker infrastructure so that `foreman_decisions` safely materialize into `outbound_commands`.

## Scope

Primary targets:
- `packages/exchange-fs-sync/src/outbound/store.ts` (minor extension for foreman reads)
- `packages/exchange-fs-sync/src/foreman/handoff.ts` (new)
- `packages/exchange-fs-sync/src/outbound/schema.sql` (verify compatibility)

## Consumes

- `20260414-008-assignment-agent-d-outbound-handoff-v2.md`
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-014-impl-foreman-core`

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-014-impl-foreman-core`
- Existing outbound worker (`send-reply-worker.ts`, `non-send-worker.ts`, `reconciler.ts`, `store.ts`)

Blocks:
- `20260414-018-impl-daemon-dispatch`
- `20260414-019-impl-replay-recovery-tests`

## Tasks

1. **Foreman → outbound command creation**
   - Implement `OutboundHandoff.createCommandFromDecision(decision, tx): outbound_id` inside the foreman package.
   - Validate preconditions from 008 Task 2.
   - Use the atomic transaction pattern from 008.

2. **Idempotency enforcement**
   - Query `foreman_decisions.outbound_id` before creating a command.
   - Optional: deterministic `outbound_id = ob_${hash(decision_id)}`.
   - Handle SQLite unique-constraint violations gracefully.

3. **Crash recovery paths**
   - **Path A**: evaluation exists, decision missing → recreate decision + command.
   - **Path B**: decision + command committed, work item not resolved → detect command, mark work item `resolved`.
   - **Path C**: superseding revision arrives → old command may be cancelled if unsent; sent/submitted commands left for reconciler.

4. **Read surfaces**
   - Add `SqliteOutboundStore` methods for foreman to read:
     - `getActiveCommandsForThread(thread_id)`
     - `getCommandStatus(outbound_id)`
   - Ensure foreman never reads `managed_drafts` or trace store for state.

5. **Supersession handling**
   - When a work item is superseded and it had a corresponding `pending` command, transition that command to `cancelled` or `superseded` via the outbound store.

## Definition of Done

- [x] Foreman can create outbound commands atomically with decisions
- [x] Duplicate command creation is idempotent (unit + integration test)
- [x] Crash recovery paths A, B, C are covered by tests
- [x] Superseded work items cancel unsent commands correctly
- [x] `pnpm typecheck` and existing outbound tests pass
