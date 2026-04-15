# Implementation — Daemon Dispatch Phase (Follow-up)

## Mission

Wire the `DefaultForemanFacade` and `SqliteScheduler` into the daemon's sync loop so that after every successful mailbox sync cycle, the daemon enters the control-plane dispatch phase: opens work items for changed conversations, acquires leases, executes charters, and drives to quiescence before sleeping.

## Background

Tasks 012–018 and 020 are complete. The core control-plane v2 durable state, foreman logic, scheduler, charter runtime, tool bindings, and replay/recovery tests are all implemented and passing. However, **task 019 was not actually implemented in code**: `packages/exchange-fs-sync-daemon/src/service.ts` still runs only the legacy mailbox sync loop with no dispatch phase. The daemon never calls `foreman.onSyncCompleted()` or `scheduler.scanForRunnableWork()`.

## Scope

### Primary targets
- `packages/exchange-fs-sync-daemon/src/service.ts` — add dispatch phase after successful sync
- `packages/exchange-fs-sync-daemon/src/sync-scheduler.ts` (if needed) — expose dispatch hook or integrate there
- `packages/exchange-fs-sync-daemon/src/index.ts` — export any new types required

### Consumes
- `20260414-014-impl-foreman-core.md`
- `20260414-015-impl-scheduler-and-leases.md`
- `20260414-016-impl-outbound-handoff-integration.md`
- `20260414-017-impl-charter-runtime-envelope.md`
- `20260414-018-impl-tool-binding-runtime.md`
- `20260414-020-impl-replay-recovery-tests.md`

## Dependencies

- **Blocked by**: 012, 013, 014, 015, 016, 017, 018, 020
- **Blocks**: None (closes critical path)

## Design

### Single-mailbox mode (`createSingleMailboxService`)

After `runSingleSync()` returns `'success'`:

1. **Initialize control-plane deps** (once per service lifecycle):
   - Open or reuse the SQLite DB at `${rootDir}/.narada/coordinator.db` (or existing outbound DB path if shared).
   - Instantiate `SqliteCoordinatorStore` and call `initSchema()`.
   - Instantiate `SqliteOutboundStore` (reuse if already opened for outbound worker).
   - Instantiate `DefaultForemanFacade({ coordinatorStore, outboundStore, db, foremanId: config.mailbox_id })`.
   - Instantiate `SqliteScheduler(coordinatorStore, { runnerId: config.mailbox_id })`.
   - Instantiate `CodexCharterRunner` (or `MockCharterRunner` for test environments) with a `persistEvaluation` hook that writes to `coordinatorStore`.

2. **Foreman signal**:
   - Build `SyncCompletionSignal` from the sync result: mailbox_id, synced_at, and the set of changed conversation IDs with revision ordinals.
   - Call `await foreman.onSyncCompleted(signal)`.

3. **Scheduler quiescence loop**:
   ```ts
   while (!scheduler.isQuiescent(config.mailbox_id)) {
     const runnable = scheduler.scanForRunnableWork(config.mailbox_id, 1);
     if (runnable.length === 0) break;

     const workItem = runnable[0]!;
     const leaseResult = scheduler.acquireLease(workItem.work_item_id, config.mailbox_id);
     if (!leaseResult.success) continue;

     // Build invocation envelope
     const envelope = buildInvocationEnvelope(workItem, coordinatorStore, messageStore);
     const attempt = scheduler.startExecution(workItem.work_item_id, workItem.opened_for_revision_id, JSON.stringify(envelope));

     try {
       const output = await charterRunner.run(envelope);
       scheduler.completeExecution(attempt.execution_id, JSON.stringify(output));
       const evaluation = buildEvaluationRecord(output, attempt);
       const resolveResult = await foreman.resolveWorkItem({
         work_item_id: workItem.work_item_id,
         execution_id: attempt.execution_id,
         evaluation,
       });
       if (!resolveResult.success && resolveResult.error) {
         logger.warn('Work item resolution failed', { work_item_id: workItem.work_item_id, error: resolveResult.error });
       }
     } catch (error) {
       const msg = error instanceof Error ? error.message : String(error);
       scheduler.failExecution(attempt.execution_id, msg, true);
       logger.error('Execution failed', { work_item_id: workItem.work_item_id, error: msg });
     }
   }
   ```

4. **Heartbeat / lease renewal**:
   - During long charter executions, renew the lease every `leaseDurationMs / 2`.

5. **Error handling**:
   - If the dispatch phase throws, log the error but do **not** treat it as fatal to the daemon loop (to preserve mailbox sync availability). Back off before the next full cycle.
   - If `foreman.onSyncCompleted` or `resolveWorkItem` returns a retryable state, let the scheduler retry on the next wake.

### Multi-mailbox mode (`createMultiMailboxService`)

- After each mailbox finishes its sync in `syncMultiple`, run the same dispatch phase per mailbox.
- The coordinator DB may be per-mailbox or shared; use the same path convention as the outbound store.

### Test requirements

- Add at least one integration test in `packages/exchange-fs-sync-daemon/test/` (or extend existing daemon tests) that:
  1. Starts the daemon with a mock charter runner.
  2. Simulates a sync completion with one changed conversation.
  3. Verifies that a work item is opened, leased, executed, and resolved (or escalated).
  4. Verifies that the daemon reaches quiescence before the next polling interval.

## Acceptance Criteria

- [ ] `service.ts` calls `foreman.onSyncCompleted()` after every successful single-mailbox sync.
- [ ] `service.ts` runs the scheduler quiescence loop before returning from the sync cycle.
- [ ] Leases are acquired, executions started, and outcomes resolved via `foreman.resolveWorkItem()`.
- [ ] Outbound commands are created when the charter proposes an allowed action.
- [ ] Multi-mailbox service runs dispatch per mailbox or documents why it is deferred.
- [ ] Tests pass (`pnpm test`) without regressions.
- [ ] The 35 replay/recovery integration tests in `exchange-fs-sync` continue to pass.
