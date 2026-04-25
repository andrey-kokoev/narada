# Implementation — Daemon Dispatch Phase

## Mission

Extend the daemon to enter the control-plane dispatch phase after every successful sync cycle, calling the foreman and scheduler until quiescence.

## Scope

Primary targets:
- `packages/exchange-fs-sync-daemon/src/service.ts`
- `packages/exchange-fs-sync-daemon/src/wake-loop.ts` (or equivalent)
- `packages/exchange-fs-sync-daemon/src/health.ts`

## Consumes

- `20260414-010-assignment-agent-f-daemon-foreman-dispatch.md`
- `20260414-014-impl-foreman-core`
- `20260414-015-impl-scheduler-and-leases`
- `20260414-016-impl-outbound-handoff-integration`

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-014-impl-foreman-core`
- `20260414-015-impl-scheduler-and-leases`
- `20260414-016-impl-outbound-handoff-integration`
- `20260414-017-impl-charter-runtime-envelope` (mock runner acceptable for early integration)
- `20260414-018-impl-tool-binding-runtime` (mock acceptable for early integration)

Blocks:
- `20260414-020-impl-replay-recovery-tests`
- `20260414-021-impl-docs-realignment`

## Tasks

1. **Wake source model**
   - Implement pending wake coalescing with priority levels:
     - `manual` > `webhook` > `retry` > `poll`
   - Higher-priority wake replaces lower-priority pending wake.

2. **Sync-to-dispatch sequence**
   - After successful sync:
     - Build `SyncCompletionSignal` from changed conversations.
     - Call `foreman.onSyncCompleted(signal)`.
     - Enter dispatch loop:
       - `scheduler.scanForRunnableWork()`
       - `scheduler.acquireLease()`
       - Start execution attempt (charter runtime)
       - Wait for completion
       - Loop until quiescent

3. **Quiescence detection**
   - Mailbox is quiescent when:
     - no `opened` work items
     - no `leased`/`executing` work items with valid leases
     - no expired retry timers

4. **Retry timer integration**
   - During idle sleep, compute wake time as `min(polling_interval_ms, next_retry_at - now)`.
   - Fire `"retry"` wake when a `failed_retryable` item becomes runnable.

5. **Error boundaries**
   - Sync succeeds, dispatch fails → retry dispatch with short backoff; do not roll back compiled state.
   - Evaluation failure → scheduler/foreman handles retry; daemon logs only.
   - Daemon restart → resume from SQLite state; run stale lease scanner.

6. **Health file extensions**
   - Add control-plane fields to `HealthStatus`:
     - `openWorkItems`
     - `leasedWorkItems`
     - `failedRetryableWorkItems`
     - `lastDispatchAt`
   - Update health serialization.

## Definition of Done

- [ ] Daemon calls foreman after successful sync
- [ ] Dispatch loop runs until quiescence
- [ ] Wake coalescing and priority replacement works
- [ ] Retry timer wakes the daemon correctly
- [ ] Health file includes control-plane fields
- [ ] Daemon restart safely resumes from SQLite state
- [ ] Integration test for full sync → dispatch → quiescence cycle
- [ ] `pnpm typecheck` passes in `exchange-fs-sync-daemon`
