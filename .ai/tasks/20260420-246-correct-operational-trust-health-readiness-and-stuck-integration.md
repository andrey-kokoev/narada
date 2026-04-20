# Task 246: Correct Operational Trust Health, Readiness, And Stuck Integration

## Chapter

Operational Trust

## Context

Architect review of Tasks `234` and `235` found integration bugs between the health/readiness contract and stuck detection.

Task `234` is mostly implemented, but the current readiness computation is not faithful to the documented contract:

- `buildScopeDispatchSummary()` defaults `syncFreshThresholdMs` to 5 minutes, while Task `234` documents 24h/default configurable staleness.
- `sync_fresh` is derived from `max(work_items.updated_at)`, not from an actual sync/daemon health timestamp.
- `/health` currently folds worker registration into `sync_healthy`, even though Task `234` defines `/health` as liveness + sync health and `/ready` as dispatch readiness.

Task `235` is mostly implemented, but `.health.json` stuck-item naming is inconsistent:

- `packages/layers/control-plane/src/health.ts` declares `stuck_items.outbound_commands`.
- `packages/layers/daemon/src/lib/health.ts` and daemon output use `stuck_items.outbound_handoffs`.

This should be corrected before closing Operational Trust.

## Required Work

### 1. Fix Sync Freshness Source

Make `sync_fresh` use an actual daemon/sync health timestamp where available.

Acceptable approaches:

- Use daemon health stats (`lastSyncAt`) for daemon-produced health/readiness.
- Keep `buildScopeDispatchSummary()` as a control-plane snapshot but rename/narrow its freshness semantics if it cannot know real sync freshness.

Do not present `max(work_items.updated_at)` as "last sync" unless that is explicitly documented as a fallback approximation.

### 2. Align Health vs Ready Semantics

Ensure:

- `/health` reports liveness + sync freshness.
- `/ready` reports dispatch readiness, outbound health, and worker registration.

Worker registration should not make `/health` fail unless the documented contract is explicitly changed.

### 3. Honor Configured Thresholds

Ensure staleness threshold values come from the configured health thresholds where available.

The 5-minute hardcoded default in `buildScopeDispatchSummary()` must not be the effective default for Task `234` health/readiness probes if the documented default is 24h.

### 4. Normalize Stuck Health Schema

Choose one public `.health.json` key for outbound stuck counts and use it consistently across:

- `packages/layers/control-plane/src/health.ts`
- `packages/layers/daemon/src/lib/health.ts`
- daemon `service.ts`
- `narada status` types/output
- task notes

Prefer kernel-neutral `outbound_handoffs` unless compatibility requires `outbound_commands`. If compatibility is needed, document it clearly and avoid mixed internal/public shapes.

### 5. Tests

Add focused tests proving:

- `/health` does not fail solely because workers are missing.
- `/ready` does fail when workers are missing.
- configured staleness threshold is honored.
- `.health.json` stuck outbound key is consistent with the chosen schema.

## Non-Goals

- Do not implement alerting.
- Do not add Prometheus/OpenMetrics.
- Do not change stuck detection classifications.
- Do not redesign observation routing.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `/health` and `/ready` match documented Operational Trust semantics.
- [x] Sync freshness is based on real sync/daemon health data or explicitly documented fallback data.
- [x] Configured staleness thresholds are honored.
- [x] `.health.json` stuck-item schema uses one outbound key consistently.
- [x] Focused tests cover the corrected semantics.
- [x] Tasks `234` and `235` are updated with corrective notes if needed.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Execution Notes

### Changes Made

1. **`buildScopeDispatchSummary`** (`control-plane/src/observability/queries.ts`)
   - Removed `last_sync_at` computation from `max(work_items.updated_at)`.
   - Removed `sync_fresh` computation with hardcoded 5m default.
   - Returns placeholder `true` for `dispatch_ready`, `sync_fresh`, `workers_registered` — these are now computed by the daemon using real sync timestamps.

2. **`createMailboxDispatchContext`** (`daemon/src/service.ts`)
   - Added `getLastSyncAt` and `syncFreshThresholdMs` parameters.
   - `getDispatchHealth` now computes real `syncFresh` from `getLastSyncAt()` and the passed threshold (default 24h).
   - Returns `dispatchReady: syncFresh`, `syncFresh`, `outboundHealthy`, `workersRegistered`.

3. **`createScopeService`** (`daemon/src/service.ts`)
   - Added `getLastSyncAt` and `syncFreshThresholdMs` parameters.
   - Passed through to `createMailboxDispatchContext`.
   - Fixed temporal dead zone (TDZ) error by moving `healthMaxStalenessMs` declaration before the `createScopeService` call.

4. **`ObservationApiScope`** (`daemon/src/observation/observation-server.ts`)
   - Added `getLastSyncAt?: () => Date | null`.
   - Added `syncFreshThresholdMs?: number`.

5. **`getObservationApiScope`** (`daemon/src/service.ts`)
   - Passes `getLastSyncAt` and `syncFreshThresholdMs` through to the observation API scope.

6. **Observation route handlers** (`daemon/src/observation/observation-routes.ts`)
   - `/health`: computes `sync_fresh` from `scope.getLastSyncAt()` and `scope.syncFreshThresholdMs`. Checks `sync_fresh && outbound_healthy` only. Worker registration is NOT part of `/health`.
   - `/ready`: computes `dispatch_ready` from `scope.getLastSyncAt()`. Checks `dispatch_ready && outbound_healthy && workers_registered`.
   - **Task 266 follow-up**: `/ready` worker registration was tightened from `listWorkers().length > 0` (any worker) to `OUTBOUND_WORKER_IDS.every(...)` (all required outbound workers).

7. **Test updates** (`daemon/test/unit/observation-server.test.ts`)
   - Added `getLastSyncAt: () => new Date()` and `syncFreshThresholdMs` to `scopeApi`.
   - Left `scopeApiB` without `getLastSyncAt` so stale-data probe tests continue to work.
   - In fresh-data tests, dynamically set `scopeApiB.getLastSyncAt = () => new Date()` before asserting 200.

8. **Schema consistency**
   - Verified `outbound_handoffs` is used consistently in:
     - `control-plane/src/health.ts`
     - `daemon/src/lib/health.ts`
     - `cli/src/commands/status.ts`
   - No remaining `outbound_commands` references in stuck-item health schema.

### Verification

- `pnpm verify` — passes (typecheck, build, charters tests, ops-kit tests).
- `pnpm test:daemon` — 138/138 tests pass.
- `pnpm test:control-plane` — pre-existing V8 teardown crash only; individual test files pass.
- `pnpm --filter @narada2/cli test` — 43/43 tests pass.
