# Task 266: Correct Task 246 Readiness Worker And Task Note Drift

## Chapter

Operational Trust

## Context

Task 246 corrected most health/readiness behavior, but review found two remaining issues.

First, `/ready` in `packages/layers/daemon/src/observation/observation-routes.ts` computes:

```ts
const workersRegistered = scope.workerRegistry.listWorkers().length > 0;
```

That is too weak. It can report ready when only an unrelated worker such as `process_executor` is registered. The daemon dispatch path correctly uses `OUTBOUND_WORKER_IDS.every(...)`; the `/ready` probe should use the same required-worker semantics or an equivalent scope-provided readiness helper.

Second, Task 234 still contains stale execution notes saying:

```text
GET /health ... sync_fresh && outbound_healthy && workers_registered
```

Task 246 changed the contract so `/health` checks sync freshness + outbound health only, while `/ready` checks dispatch readiness + outbound health + required worker registration. The task notes must not preserve the old contract.

## Goal

Finish the Task 246 correction so readiness worker semantics and task documentation are aligned.

## Required Work

### 1. Fix `/ready` Worker Registration Semantics

Update the observation `/ready` route so `workers_registered` means all required outbound workers are registered, not merely "some worker exists."

Acceptable approaches:

- Import and use `OUTBOUND_WORKER_IDS` in `observation-routes.ts`.
- Or expose a scope-level `requiredWorkerIds` / `areRequiredWorkersRegistered` function through `ObservationApiScope`.

The implementation must stay vertical-neutral where practical, but it must not weaken readiness to "any worker registered."

### 2. Add Focused Tests

Add or update focused daemon observation tests proving:

- `/health` can return 200 when sync is fresh and outbound is healthy even if required workers are missing.
- `/ready` returns 503 when required outbound workers are missing, even if another worker is registered.
- `/ready` returns 200 only when required outbound workers are registered.

The test fixture currently registers `process_executor`; that should not satisfy outbound readiness by itself.

### 3. Correct Task Notes

Update `.ai/do-not-open/tasks/20260419-234-health-readiness-contract-for-live-operations.md` so its execution notes match the corrected Task 246 contract:

- `/health`: sync freshness + outbound health
- `/ready`: dispatch readiness + outbound health + required worker registration

If Task 235 needs a short cross-reference to Task 246's `outbound_handoffs` schema consistency, add it there too.

### 4. Update Task 246 Notes

Add a short corrective note to `.ai/do-not-open/tasks/20260420-246-correct-operational-trust-health-readiness-and-stuck-integration.md` referencing this task and the worker-registration fix.

## Non-Goals

- Do not redesign worker registry.
- Do not change outbound worker IDs.
- Do not add a new health endpoint.
- Do not run broad/full test suites unless explicitly requested.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `/ready` requires the actual required outbound workers, not any worker.
- [x] Focused tests cover missing required workers separately from unrelated registered workers.
- [x] Task 234 no longer documents worker registration as part of `/health`.
- [x] Task 246 notes reference this corrective follow-up.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Execution Notes

### Changes Made

1. **`observation-routes.ts` (`/ready` handler)**
   - Changed `workersRegistered` from `scope.workerRegistry.listWorkers().length > 0` (any worker) to `OUTBOUND_WORKER_IDS.every((id) => scope.workerRegistry.getWorker(id) !== undefined)` (all required outbound workers).
   - Imported `OUTBOUND_WORKER_IDS` from `../lib/workers.js`.

2. **Tests (`daemon/test/unit/observation-server.test.ts`)**
   - Renamed "returns health 200 when sync is fresh" → "returns health 200 when sync is fresh (ignores worker registration)" to make the contract explicit.
   - Added "returns ready 503 when required outbound workers are missing": creates a separate observation server with a fresh registry containing only `process_executor`, asserts 503 and `workers_registered: false`.
   - Updated "returns ready 200 when dispatch is ready" → "returns ready 200 when dispatch is ready and required workers are registered": registers `send_reply`, `non_send_actions`, `outbound_reconciler` before asserting 200.

3. **Task note corrections**
   - **Task 234**: Fixed execution notes so `/health` contract no longer includes `workers_registered`. Added corrective notes referencing Tasks 246 and 266.
   - **Task 235**: Added cross-reference to Task 246 in the `outbound_handoffs` vs `outbound_commands` deviation note.
   - **Task 246**: Added Task 266 follow-up note under observation route handlers; updated test count to 138.

### Verification

- `pnpm verify` — passes.
- Focused `/health` and `/ready` observation-server probe tests pass, including the new required-outbound-workers case.
- Reviewer note: a later full daemon-suite run reported unrelated pre-existing failures outside the Task 266 probe cases. Do not treat `pnpm test:daemon` as Task 266 acceptance evidence.
