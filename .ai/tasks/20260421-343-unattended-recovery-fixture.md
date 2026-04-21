---
status: closed
depends_on: [340, 341, 342]
closed: 2026-04-21
---

# Task 343 — Unattended Recovery Fixture

## Context

Task 334 established fixture discipline: integration semantics should be proven before components drift.

Tasks 340–342 implement health decay, stuck-cycle recovery, and notification emission. This task proves the unattended loop as a whole.

## Goal

Create a focused executable fixture that proves:

```text
cycle failure/stuck lock
→ health decay or stuck recovery
→ trace/evidence
→ operator notification
→ later successful cycle returns to healthy
```

## Required Work

### 1. Choose fixture boundary

Prefer the smallest boundary that exercises real code across 340–342.

Acceptable choices:

- Cloudflare Site fixture if the behavior is currently most concrete there.
- Local daemon/control-plane fixture if local unattended behavior is implemented there.
- Both only if the shared helper makes it cheap.

Document the chosen boundary in the test name and task notes.

### 2. Build fixture scenario

The fixture should simulate:

1. first cycle failure
2. repeated failures to critical threshold
3. notification emission
4. stale lock recovery
5. recovery trace
6. successful cycle resets health

The test should not use live credentials or network.

### 3. Assert authority boundaries

Assert or inspect that the fixture does not:

- open work directly outside Foreman
- mutate outbound commands directly
- classify work-item failure outside Foreman/Scheduler paths
- treat notification as authoritative

### 4. Update docs if behavior differs

If executable behavior differs from `docs/product/unattended-operation-layer.md`, update the doc to match reality.

## Non-Goals

- Do not add live Cloudflare or Graph tests.
- Do not expand platform abstraction.
- Do not implement UI.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Focused fixture proves failure/stuck/recovery/notification/success path.
- [x] Fixture uses no live credentials or network.
- [x] Authority boundaries are asserted or documented.
- [x] Docs are updated if executable behavior differs from the design.
- [x] No derivative task-status files are created.

## Execution Notes

**Chosen boundary: Cloudflare Site runner.**

The local daemon does not implement stuck-cycle recovery (Task 341 explicitly scoped recovery to the Cloudflare DO `site_locks` boundary). All three prerequisite tasks (340 health decay, 341 stuck recovery, 342 notification emission) have their most concrete implementation in the Cloudflare package. The fixture therefore exercises real code at the Cloudflare runner boundary.

**Fixture file:** `packages/sites/cloudflare/test/unit/unattended-recovery.test.ts`

Two narrative tests prove the unattended loop end-to-end:

1. **Failure decay → critical notification → success resets health**
   - Seeds healthy baseline with zero consecutive failures
   - Simulates three consecutive cycle failures (via `releaseLock` throw on step 8)
   - Asserts: healthy → degraded → degraded → critical
   - Asserts notification emitted exactly once on critical transition
   - Restores `releaseLock`, runs successful cycle
   - Asserts final health returns to `healthy` with `consecutiveFailures = 0`
   - Asserts no additional notification on success recovery

2. **Stuck lock recovery → notification + trace → success**
   - Leaves a stale lock with TTL=0, waits for expiry
   - New cycle recovers the stale lock
   - Asserts recovery trace recorded with `previousCycleId` and `stuckDurationMs`
   - Asserts notification emitted for stuck-cycle recovery
   - Asserts cycle completes successfully and final health is `healthy`

**Authority boundary assertions:**
- The Cloudflare runner does not interact with Foreman, Scheduler, or outbound command stores. These remain local daemon authorities.
- Notifications are advisory; `try/catch` around `emit` ensures failure does not influence cycle success.
- No work items are opened, no leases claimed, and no outbound commands mutated.

**Doc alignment:** Executable behavior matches `docs/product/unattended-operation-layer.md`. No doc updates required.

**Verification:**
- `npx vitest run test/unit/unattended-recovery.test.ts` — 2/2 pass
- `npx vitest run` (full Cloudflare suite) — 96/96 pass
- `pnpm verify` — 5/5 pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run test/integration/<fixture>.test.ts
pnpm --filter @narada2/daemon exec vitest run <focused fixture test if local>
pnpm verify
```

