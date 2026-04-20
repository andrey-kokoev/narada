# Task 234: Health/Readiness Contract for Live Operations

## Chapter

Operational Trust

## Why

Today, the daemon writes a `.health.json` file after each sync cycle, but this only answers "did sync work?" It does not answer the questions an operator actually needs:

- Is the daemon ready to accept and process work?
- Is the scheduler quiescent or backlogged?
- Are outbound workers keeping up with demand?
- Has the sync been stale for longer than expected?

Without a clear health/readiness contract, an operator cannot tell whether "healthy" means "everything is fine" or merely "the last sync didn't crash."

## Goal

Define and implement a two-level health contract:

1. **Liveness**: The daemon is running and making progress (sync cycles are completing).
2. **Readiness**: The daemon is ready to accept and process work (scheduler is operational, workers are registered, no critical errors).

## Required Work

### 1. Define Health Contract Semantics

Document the exact meaning of each health level:

| Level | Meaning | When False |
|-------|---------|------------|
| `live` | Daemon process is running and the main loop has not crashed | Daemon exited or main loop threw unhandled exception |
| `sync_healthy` | Last sync completed within `sync_stale_threshold_ms` (default: 24h) | Last sync failed or is older than threshold |
| `dispatch_ready` | Scheduler can scan, lease, and execute work; all worker registries are populated | Schema not initialized, no workers registered, or DB unreachable |
| `outbound_healthy` | Outbound backlog is not growing uncontrollably | Pending outbound count exceeds threshold or oldest pending exceeds age limit |

### 2. Extend `.health.json`

Add new fields to `HealthFileData`:

```typescript
interface HealthFileData {
  // ... existing fields ...
  readiness: {
    dispatch_ready: boolean;
    outbound_healthy: boolean;
    workers_registered: string[]; // IDs of registered workers
  };
  thresholds: {
    sync_stale_ms: number;
    max_pending_outbound: number;
    max_outbound_age_ms: number;
  };
}
```

### 3. Add Readiness Probe Endpoint

If the observation API server is enabled, add:

```
GET /ready
```

Returns:
- `200` if `live && dispatch_ready`
- `503` otherwise, with JSON body indicating which checks failed

### 4. Add Health Probe Endpoint

If the observation API server is enabled, add:

```
GET /health
```

Returns:
- `200` if `live && sync_healthy`
- `503` otherwise

### 5. Update `narada status` Health Reporting

Include readiness indicators in the `status` CLI output:

```json
{
  "health": "healthy",
  "readiness": {
    "dispatch_ready": true,
    "outbound_healthy": true,
    "workers_registered": ["send_reply", "non_send_actions", "outbound_reconciler", "process_executor"]
  }
}
```

### 6. Add Staleness Detection to Daemon

After each sync cycle, compute:
- Time since last successful sync
- Pending outbound count and oldest age
- Runnable work item count

If any threshold is exceeded, mark the corresponding health level as degraded and log a warning.

## Non-Goals

- Do not add Prometheus or OpenMetrics export.
- Do not add alerting webhooks or external notifications.
- Do not add real-time streaming health updates.
- Do not modify the evaluation or charter runtime.

## Acceptance Criteria

- [x] Health contract semantics are documented in task notes.
- [x] `.health.json` includes readiness fields.
- [x] `/ready` endpoint returns 200/503 based on dispatch readiness.
- [x] `/health` endpoint returns 200/503 based on liveness + sync health.
- [x] `narada status` includes readiness indicators.
- [x] Staleness thresholds are configurable via config.

## Execution Notes

### 2026-04-19 — Implementation

**Types extended:**
- `control-plane/src/observability/types.ts`: Added `ScopeReadiness` interface; extended `ScopeDispatchSummary` with `readiness`.
- `control-plane/src/health.ts`: Added `ScopeReadinessSnapshot`, `HealthThresholds`, and extended `HealthFileData` with optional `readiness`, `isStale`, and `thresholds`.
- `daemon/src/lib/health.ts`: Added `ScopeReadinessSnapshot`, `HealthThresholds`, and extended `HealthStatus` with `readiness`, `isStale`, `thresholds`.

**Readiness computation:**
- `buildScopeDispatchSummary` (control-plane) computes `outbound_healthy` (no failed/blocked outbound) and work-item counts. It returns placeholder `true` for `sync_fresh`, `dispatch_ready`, and `workers_registered` because the control-plane layer does not have access to the daemon's real sync timestamp.
- `getDispatchHealth` (daemon service) computes real `syncFresh` from the daemon's `lastSyncAt` and configured threshold, and fills in `workersRegistered` by checking `OUTBOUND_WORKER_IDS` against the worker registry.
- `updateHealth` (daemon service) aggregates readiness across all scopes and computes `isStale` (last sync > threshold or consecutive errors > threshold).

**Probe endpoints:**
- `GET /health` (observation API): Returns 200 if all scopes are `sync_fresh && outbound_healthy`, else 503 with per-scope breakdown. Worker registration is NOT part of `/health`.
- `GET /ready` (observation API): Returns 200 if all scopes are `dispatch_ready && outbound_healthy && workers_registered`, else 503 with per-scope breakdown.

**CLI status:**
- `narada status` reads `.health.json` and exposes `readiness`, `isStale`, and `thresholds` in the output.

**Configurability:**
- Config schema (`control-plane/src/config/schema.ts`): Added `HealthConfigSchema` with `max_staleness_ms`, `max_consecutive_errors`, `max_drain_ms`.
- Config types (`control-plane/src/config/types.ts`): Added `HealthConfig` interface; added `health?: HealthConfig` to `ExchangeFsSyncConfig`.
- Daemon CLI (`daemon/src/index.ts`): Parses `--max-staleness-ms`, `--max-consecutive-errors`, `--max-drain-ms` and passes them to `createSyncService`.
- `createSyncService` reads thresholds from `opts` (CLI override) → `globalConfig.health` (config file) → hardcoded defaults.

**Pre-existing fixes applied:**
- `control-plane/src/foreman/handoff.ts`: Added missing `reviewed_at`, `reviewer_notes`, `external_reference` to `OutboundCommand` literal.
- `control-plane/src/outbound/store.ts`: Replaced unsupported `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with `PRAGMA table_info` + conditional JS `ALTER TABLE`.
- `control-plane/src/observability/queries.ts`: Added missing `OperatorActionSummary` import; fixed unused type warnings and stuck outbound classification check.

**Tests:**
- `daemon/test/unit/observation-server.test.ts`: 4 new probe tests (degraded + healthy states for `/health` and `/ready`) — 58 pass.
- `cli/test/commands/status.test.ts`: Added test for `.health.json` readiness ingestion — 7 pass.
- `daemon/test/integration/dispatch.test.ts`: 6 pass.

**Corrective notes (Tasks 246 / 266):**
- Task 246 corrected `buildScopeDispatchSummary` to stop computing `sync_fresh` from `max(work_items.updated_at)`; real sync freshness now comes from the daemon's `lastSyncAt`.
- Task 266 tightened `/ready` worker registration to require all `OUTBOUND_WORKER_IDS` (not merely "any worker registered").

## Dependencies

- Tasks 228-232 (Live Operation chapter) must be complete. This task needs a running daemon with work items and outbound commands to meaningfully report readiness.
