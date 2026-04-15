# Implementation — Scheduler and Leases

## Mission

Implement the runnable work scanner, lease acquisition, heartbeat, stale-lease recovery, and retry/backoff logic.

## Scope

Primary targets:
- `packages/exchange-fs-sync/src/scheduler/` (new directory)
- `packages/exchange-fs-sync/src/scheduler/scheduler.ts`
- `packages/exchange-fs-sync/src/scheduler/lease-scanner.ts`

## Consumes

- `20260414-005-assignment-agent-a-scheduler-and-leases.md`
- `20260414-004-coordinator-durable-state-v2.md`

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-014-impl-foreman-core` (needs work items to exist)

Blocks:
- `20260414-018-impl-daemon-dispatch`
- `20260414-019-impl-replay-recovery-tests`

## Tasks

1. **Runnable selection**
   - `scanForRunnableWork(mailbox_id, limit): WorkItem[]`
   - Enforce preconditions: `opened`, no active lease, not superseded, conversation not blocked, no active `blocked_policy` command.
   - Order by priority → `created_at`.

2. **Lease acquisition**
   - `acquireLease(work_item_id, runner_id): LeaseAcquisitionResult`
   - Atomic transaction: validate status, insert `work_item_leases`, update `work_items.status = 'leased'`.

3. **Heartbeat**
   - `renewLease(lease_id): void` — updates `expires_at`.
   - Runner must call every `lease_duration_ms / 3`.

4. **Execution lifecycle**
   - `startExecution(work_item_id): execution_id` — inserts `execution_attempts`, updates `work_items.status = 'executing'`.
   - `completeExecution(execution_id, outcome): void` — updates attempt, releases lease, updates work item.
   - `failExecution(execution_id, error): void` — marks attempt `crashed`, releases lease, increments `retry_count`, sets `next_retry_at`.

5. **Stale lease scanner**
   - `recoverStaleLeases(): void` — finds expired unreleased leases, marks them `abandoned`, marks attempts `abandoned`, transitions work items to `failed_retryable`.
   - Must run before or atomically with `scanForRunnableWork`.

6. **Retry/backoff**
   - `calculateBackoff(retry_count): delay_ms`
   - `failed_retryable` items are only runnable when `next_retry_at <= now()`.

## Definition of Done

- [ ] Runnable selection returns correct items under contention
- [ ] Lease acquisition is atomic (concurrent lease test passes)
- [ ] Heartbeat extends expiry correctly
- [ ] Stale lease scanner recovers abandoned work items
- [ ] Retry backoff is enforced (scheduler skips future retries)
- [ ] Unit/integration tests cover U1–U12 and I1–I8 from 005
- [ ] `pnpm typecheck` passes
