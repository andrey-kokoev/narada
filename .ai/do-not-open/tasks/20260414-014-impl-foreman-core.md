# Implementation — Foreman Core

## Mission

Implement the foreman's work opening, supersession, and outbound handoff logic, including the `ForemanFacade` interface consumed by the daemon.

## Scope

Primary targets:
- `packages/exchange-fs-sync/src/foreman/` (new directory)
- `packages/exchange-fs-sync/src/foreman/index.ts`
- `packages/exchange-fs-sync/src/foreman/facade.ts`

## Consumes

- `20260414-006-assignment-agent-b-charter-invocation-v2.md`
- `20260414-008-assignment-agent-d-outbound-handoff-v2.md`
- `20260414-010-assignment-agent-f-daemon-foreman-dispatch.md`
- `20260414-004-coordinator-durable-state-v2.md`

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-013-impl-conversation-records-and-revisions`

Blocks:
- `20260414-015-impl-scheduler-and-leases`
- `20260414-016-impl-outbound-handoff-integration`
- `20260414-018-impl-daemon-dispatch`

## Tasks

1. **ForemanFacade interface**
   - `onSyncCompleted(signal: SyncCompletionSignal): Promise<WorkOpeningResult>`
   - `resolveWorkItem(resolveReq: ResolveWorkItemRequest): Promise<ResolutionResult>`

2. **Work opening / supersession**
   - For each `ChangedConversation` in the signal:
     - Determine if a new `work_item` should be opened.
     - Determine if an existing `opened`/`leased` work item should be `superseded`.
     - Insert/update `conversation_records`, `conversation_revisions`, `work_items` atomically.

3. **Evaluation validation & arbitration**
   - Implement the 10 validation rules from 006.
   - Primary/secondary charter arbitration logic.
   - Build `foreman_decisions` row from validated `Evaluation`.

4. **Outbound handoff transaction**
   - Atomic SQLite transaction wrapping:
     - `work_items` status → `resolved`
     - `foreman_decisions` insert
     - Optional `outbound_commands` + `outbound_versions` insert
     - `foreman_decisions.outbound_id` update
   - Idempotency: check existing decision/command before insert.
   - Deterministic `outbound_id` generation optional but recommended.

## Definition of Done

- [x] `ForemanFacade` interface is exported and typed
- [x] Work opening/supersession logic is unit tested
- [x] Validation rules 1–10 from 006 are covered by unit tests
- [x] Outbound handoff transaction is atomic and idempotent (integration test)
- [x] `pnpm typecheck` passes
