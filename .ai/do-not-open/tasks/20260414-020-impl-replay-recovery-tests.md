# Implementation — Replay and Recovery Tests

## Mission

Implement the 26 replay, recovery, and crash-semantics test scenarios defined in the v2 test matrix.

## Scope

Primary targets:
- `packages/exchange-fs-sync/test/integration/control-plane/replay-recovery.test.ts` (new)
- `packages/exchange-fs-sync/test/integration/control-plane/` helpers

## Consumes

- `20260414-009-assignment-agent-e-replay-and-recovery-tests.md`
- All implementation tasks (012–019)

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-014-impl-foreman-core`
- `20260414-015-impl-scheduler-and-leases`
- `20260414-016-impl-outbound-handoff-integration`
- `20260414-019-impl-daemon-dispatch`

## Tasks

1. **Test harness**
   - SQLite temp-file database per test.
   - Injected clock for deterministic lease expiry and backoff.
   - Mock foreman and mock charter runner for deterministic evaluation.
   - Helper to simulate crash via transaction rollback or in-memory state truncation.

2. **Work item replay tests (W1–W4)**
   - Implement tests for resolved replay, partial execution, process restart, and stale lease expiry.
   - Assert lease uniqueness, work item status determinism, no duplicate commands.

3. **Revision supersession tests (R1–R4)**
   - New revision before lease, during execution, after evaluation, and no-op supersession.
   - Assert exactly one non-superseded runnable work item per conversation.

4. **Outbound idempotency tests (O1–O4)**
   - Duplicate command creation, repeated evaluation, missing scheduler state, unresolved work with existing command.
   - Assert exactly one command per decision, no orphans.

5. **Tool/runtime failure tests (T1–T5)**
   - Charter timeout, tool denial, tool timeout, missing binding, runtime crash.
   - Assert correct `tool_call_record` statuses and work item retry behavior.

6. **Commentary separation tests (C1–C4)**
   - Delete traces before resolution, dedupe, mailbox reconstruction, and no-trace-store operation.
   - Assert system correctness without trace dependency.

7. **Daemon/wake duplication tests (D1–D4)**
   - Duplicate wake, wake during execution, wake after crash recovery, quiescent loop.
   - Assert idempotency and no busy-wait.

## Definition of Done

- [x] All 26 test scenarios from 009 are implemented and passing
- [x] Critical assertions 1–10 from 009 are present
- [x] Tests use injected clocks (no real-time sleeps)
- [x] Tests run in under 30 seconds total
- [x] `pnpm test` passes in `exchange-fs-sync`
