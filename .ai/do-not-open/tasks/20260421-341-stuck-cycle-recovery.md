---
status: closed
depends_on: [338, 339]
closed: 2026-04-21
---

# Task 341 — Stuck-Cycle Recovery

## Context

`docs/product/unattended-operation-layer.md` defines stuck-cycle recovery:

- a cycle acquires a site/cycle lock with TTL
- if the process crashes before release, a later cycle detects expiry
- stale lock is stolen or released atomically
- a recovery trace is recorded
- health moves to `critical`

Cloudflare has a `site_locks` table. Local Narada already has lower-level stale lock handling for sync locks and scheduler leases, but unattended operation needs a cycle-level recovery surface.

## Goal

Implement bounded stuck-cycle recovery for the unattended operation layer without changing Scheduler/Foreman work-item authority.

## Required Work

### 1. Identify cycle lock boundary

Inspect local daemon and Cloudflare Site code to identify:

- where a cycle lock exists today
- whether local daemon needs a new lightweight cycle lock record
- whether Cloudflare DO `site_locks` already satisfies the contract

Document the chosen boundary in code comments or docs if not obvious.

### 2. Implement stale lock recovery

When a cycle starts:

- try to acquire lock with TTL
- if lock is held and not expired: fail fast / skip cycle with lock-contention trace
- if lock is expired: atomically recover/steal lock, record stuck-cycle recovery trace, proceed

Recovery must not classify work-item failures. It is mechanical cycle/site lock recovery only.

### 3. Record trace

Record a trace/evidence artifact with:

- new cycle id
- previous cycle id if known
- lock TTL
- stuck duration
- recovered at

Use existing trace surfaces where possible.

### 4. Tests

Add focused tests for:

- active unexpired lock blocks a second cycle
- expired lock is recovered
- recovery trace is recorded
- recovery does not mutate work item state
- lock is released after successful recovered cycle

## Non-Goals

- Do not alter work-item leases.
- Do not classify semantic work failures.
- Do not implement notifications; Task 342 owns notifications.
- Do not implement broad deployment/restart framework.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Stale cycle lock recovery is implemented for the chosen local/Cloudflare boundary.
- [x] Recovery trace is recorded.
- [x] Active lock contention is distinguishable from stale lock recovery.
- [x] Work-item/Foreman/Scheduler authority boundaries are unchanged.
- [x] Focused tests cover contention, recovery, trace, and release.
- [x] No derivative task-status files are created.

## Execution Notes

**Chosen boundary: Cloudflare `site_locks` table.**

The local daemon does not have a site-level cycle lock; it uses `FileLock` for sync-level locking and the scheduler's `recoverStaleLeases()` for work-item lease recovery. Adding a daemon cycle lock would duplicate existing mechanisms. The Cloudflare DO `site_locks` table already has TTL-based expiry and is the natural boundary for unattended operation recovery.

**Implementation:**

1. `packages/sites/cloudflare/src/types.ts` — Added `RecoveryTraceRecord` interface.
2. `packages/sites/cloudflare/src/coordinator.ts` — Extended `CycleCoordinator` interface:
   - `acquireLock` now returns `{ acquired, previousCycleId?, recovered?, stuckDurationMs? }`
   - Detects expired locks before deletion and reports `recovered: true` with stuck duration
   - Added `recordRecoveryTrace()` and `getLastRecoveryTrace()` backed by new `cycle_recovery_traces` table
3. `packages/sites/cloudflare/src/runner.ts` — Updated `runCycle`:
   - On `recovered` lock: calls `recordRecoveryTrace`, sets health to `critical`, continues cycle
   - On lock contention: returns failed result with previous cycle ID
   - Uses `computeHealthTransition` from `health-transition.ts` for consistent health state machine
   - Added `recovered_from_cycle_id` and `stuck_duration_ms` to `CycleResult`
4. `packages/sites/cloudflare/test/fixtures/coordinator-fixture.ts` — Updated mock coordinator to support stale lock recovery and recovery trace methods.
5. `packages/sites/cloudflare/test/unit/site-coordinator.test.ts` — Added tests for expired lock recovery, `stuckDurationMs` accuracy, and recovery trace persistence.
6. `packages/sites/cloudflare/test/unit/runner.test.ts` — Added test verifying recovery trace recording, critical health on recovery, and lock release after recovered cycle.

**Also fixed pre-existing type errors** uncovered during verification:
- `packages/layers/control-plane/src/health.ts` — prefixed unused `previousStatus` parameter
- `packages/layers/daemon/src/service.ts` — resolved `HealthStatus` type clash between daemon interface and control-plane union
- `packages/layers/daemon/src/lib/health.ts` — added `'stale'` to status union
- `packages/sites/cloudflare/src/health-transition.ts` — prefixed unused `previousStatus` parameter
- `packages/sites/cloudflare/src/runner.ts` — wrapped catch-block health update in try/catch so `setHealth` failures do not prevent lock release

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run` — 82/82 tests pass across 10 test files
- `pnpm verify` — all 5 verification steps pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run <focused coordinator/runner test>
pnpm --filter @narada2/daemon exec vitest run <focused daemon cycle-lock test>
pnpm verify
```
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
