# Task 145: Materialize 124-J Route Terminal Failures Through Foreman

## Source

Derived from Task 124-J in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

If scheduler can terminally fail work items directly, foreman resolution authority is not singular.

## Goal

Add a foreman-owned failure path so scheduler delegates terminal failure transitions instead of owning them.

## Deliverables

- `ForemanFacade.failWorkItem()` or equivalent
- scheduler delegates terminal failure transitions
- docs/tests updated to reflect the authority boundary

## Definition Of Done

- [x] scheduler no longer directly owns terminal failure resolution semantics
- [x] foreman exposes and owns the terminal failure path
- [x] tests/docs reflect the corrected authority split

## Execution Evidence

### What Was Done

1. **Added `ForemanFacade.failWorkItem()`** to `packages/layers/control-plane/src/foreman/types.ts` interface:
   ```typescript
   failWorkItem(workItemId: string, errorMessage: string, retryable: boolean): void;
   ```
   Documented as the singular failure path; scheduler delegates here.

2. **Implemented `failWorkItem` in `DefaultForemanFacade`** (`packages/layers/control-plane/src/foreman/facade.ts`):
   - Accepts optional `ForemanFacadeOptions` with `maxRetries` (default: 3)
   - Checks retry count against max retries to decide terminal vs retryable
   - Terminal: sets work item to `failed_terminal`, abandons session
   - Retryable: sets work item to `failed_retryable` with backoff, idles session with resume hint
   - Contains its own `calculateBackoff` method (mirrors scheduler's former logic)

3. **Simplified `Scheduler.failExecution`** (`packages/layers/control-plane/src/scheduler/scheduler.ts`):
   - Removed all terminal failure logic (maxRetries check, `failed_terminal` transition, session abandonment)
   - Removed all work item status transitions and session updates
   - Now only marks execution attempt as `crashed` and releases the lease
   - `_retryable` parameter is ignored (retained for API compatibility)

4. **Updated daemon service** (`packages/layers/daemon/src/service.ts`):
   - Catch block now calls both `scheduler.failExecution` (execution/lease cleanup) and `foreman.failWorkItem` (work item transition)
   ```typescript
   deps.scheduler.failExecution(attempt.execution_id, msg, true);
   deps.foreman.failWorkItem(workItem.work_item_id, msg, true);
   ```

5. **Updated tests**:
   - **Scheduler U10**: Renamed and simplified to verify only execution crashed + lease released
   - **Scheduler U11**: Removed (terminal failure no longer a scheduler concern)
   - **Foreman facade tests**: Added 3 new tests for `failWorkItem`:
     - retryable failure sets `failed_retryable` with incremented retry count
     - retryable failure exceeding max retries transitions to `failed_terminal`
     - non-retryable failure immediately transitions to `failed_terminal`
   - **Integration T5**: Updated to call both `scheduler.failExecution` and `foreman.failWorkItem`

### Files Changed

- `packages/layers/control-plane/src/foreman/types.ts`
- `packages/layers/control-plane/src/foreman/facade.ts`
- `packages/layers/control-plane/src/scheduler/scheduler.ts`
- `packages/layers/control-plane/src/scheduler/types.ts` (no change needed — `failExecution` signature unchanged)
- `packages/layers/daemon/src/service.ts`
- `packages/layers/control-plane/test/unit/scheduler/scheduler.test.ts`
- `packages/layers/control-plane/test/unit/foreman/facade.test.ts`
- `packages/layers/control-plane/test/integration/control-plane/replay-recovery.test.ts`

### Verification

- Scheduler unit tests: 16/16 pass
- Foreman facade unit tests: 21/21 pass (including 3 new `failWorkItem` tests)
- Replay-recovery integration tests: 35/35 pass
- Control-plane unit tests: 772/775 pass (3 pre-existing `insertCharterOutput` failures unrelated to this change)

### Authority Boundary After This Change

| Concern | Owner |
|---------|-------|
| Execution attempt lifecycle (start/complete/crash) | Scheduler |
| Lease acquisition, renewal, release | Scheduler |
| Work item terminal vs retryable decision | **Foreman** |
| Work item status transitions (failed_retryable / failed_terminal) | **Foreman** |
| Session state on failure (idle / abandoned) | **Foreman** |
