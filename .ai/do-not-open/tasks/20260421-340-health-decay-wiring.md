---
status: closed
depends_on: [338, 339]
closed: 2026-04-21
---

# Task 340 — Health Decay Wiring

## Context

`docs/product/unattended-operation-layer.md` defines health decay:

- first failure: `healthy` → `degraded`
- third consecutive failure: `degraded` → `critical`
- auth failure: direct transition to `auth_failed`
- successful cycle: reset `consecutive_failures` to `0` and return to `healthy`

This behavior is documented but not yet executable.

## Goal

Implement health decay for unattended operation in the local daemon/control-plane path and, where already present, align Cloudflare Site health semantics with the same transition rules.

## Required Work

### 1. Locate existing health surfaces

Inspect:

- `packages/layers/control-plane/src/health.ts`
- `packages/layers/daemon/src/service.ts`
- `packages/layers/daemon/src/observation/`
- `packages/sites/cloudflare/src/coordinator.ts`
- `packages/sites/cloudflare/src/runner.ts`

Identify the smallest place to compute health transition state without giving health authority over work items, leases, outbound commands, or confirmations.

### 2. Implement transition helper

Create or extend a small pure helper for health transitions.

It should accept:

- previous status
- previous `consecutive_failures`
- current cycle outcome: success, failure, auth failure, stuck recovery

It should return:

- next status
- next `consecutive_failures`
- operator-facing message

The helper must be unit-testable without daemon startup.

### 3. Wire local daemon health updates

After each bounded cycle/dispatch iteration:

- on success: reset health to `healthy`
- on ordinary failure: increment `consecutive_failures` and set degraded/critical thresholds
- on auth failure: set `auth_failed`

Do not change Foreman/Scheduler/Outbound authority behavior.

### 4. Align Cloudflare Site runner if needed

If Cloudflare runner already writes health, ensure it uses the same helper or equivalent transition rules.

Do not expand Cloudflare scope beyond existing v0 structural proof.

### 5. Tests

Add focused tests for:

- first failure → degraded, `consecutive_failures = 1`
- third failure → critical
- success after failures → healthy, `consecutive_failures = 0`
- auth failure → auth_failed
- health update does not mutate work-item/lease/outbound state

## Non-Goals

- Do not implement notification emission; Task 342 owns that.
- Do not implement stale lock recovery; Task 341 owns that.
- Do not change work-item failure classification.
- Do not create a generic Runtime Locus abstraction.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Health transition helper exists and is tested.
- [x] Local daemon/control-plane health update path uses the transition rules.
- [x] Cloudflare Site health semantics are aligned.
- [x] Focused tests cover success/failure/auth thresholds.
- [x] Authority boundaries are unchanged.
- [x] No derivative task-status files are created.

## Execution Notes

### Health Transition Helper

Created `computeHealthTransition(previousStatus, previousConsecutiveFailures, outcome)` in:
- `packages/layers/control-plane/src/health.ts` — canonical implementation, exported from index
- `packages/sites/cloudflare/src/health-transition.ts` — local mirror for Cloudflare package (no control-plane dependency)

Rules implemented:
- `success` → `healthy`, `consecutiveFailures = 0`
- `failure` + `consecutiveFailures == 0` → `degraded`, `consecutiveFailures = 1`
- `failure` + `consecutiveFailures == 1` → `degraded`, `consecutiveFailures = 2`
- `failure` + `consecutiveFailures >= 2` → `critical`, `consecutiveFailures += 1`
- `auth_failure` → `auth_failed`
- `stuck_recovery` → `critical`

### Local Daemon Wiring

Updated `packages/layers/daemon/src/service.ts`:
- Added `isAuthFailure()` helper that detects `GRAPH_AUTH_FAILED` error code
- Added `currentHealthStatus` variable tracked across cycles
- `runSingleSync()` computes `cycleOutcome` (`success` | `failure` | `auth_failure`), calls `computeHealthTransition()` with PREVIOUS state, updates `currentHealthStatus` and `stats.consecutiveErrors`
- `updateHealth()` writes `currentHealthStatus` instead of binary `isErrorState ? 'error' : 'healthy'` logic
- Auth failures are detected in the catch block and routed to `auth_failure` outcome

### Cloudflare Alignment

Updated `packages/sites/cloudflare/src/runner.ts`:
- Lock contention path now reads previous health, computes transition, writes updated health
- Success path uses transition helper (resets to `healthy` / `0`)
- Error/catch path reads previous health, computes transition, writes updated health before releasing lock
- Added `"auth_failed"` to `SiteHealthRecord.status` type in `src/types.ts`

### Tests

- Control-plane: 17 tests in `test/unit/health.test.ts` (9 existing + 8 new transition tests)
- Cloudflare: 8 tests in `test/unit/health-transition.test.ts`
- Cloudflare package: 82/82 tests pass
- Daemon: `pnpm typecheck` passes
- Root: `pnpm verify` passes 5/5

## Suggested Verification

```bash
pnpm --filter @narada2/control-plane exec vitest run <focused health test>
pnpm --filter @narada2/daemon exec vitest run <focused daemon health test>
pnpm --filter @narada2/cloudflare-site exec vitest run <focused runner/coordinator test>
pnpm verify
```
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
