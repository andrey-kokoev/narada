---
status: closed
closed: 2026-04-22
depends_on: [432, 433, 434]
---

# Task 435 — macOS Sleep/Wake and Missed-Cycle Recovery Fixture

## Assignment

Prove that the macOS Cycle behaves correctly when the machine sleeps during a scheduled interval and wakes later.

## Context

macOS laptops skip `launchd` invocations that occur during sleep. Unlike server substrates (Cloudflare, Windows desktop), macOS Sites must explicitly handle:
- Missed Cycle triggers due to sleep.
- Partial Cycle state if sleep occurs mid-Cycle.
- Cursor-driven idempotency ensuring no lost work after wake.

This task does not require a live sleeping Mac. It uses fixture-based simulation.

## Required Work

1. Design the fixture scenarios:
   - **Scenario A**: Machine sleeps before Cycle start. Cycle is skipped. On wake, next interval fires. Cursor is behind; Cycle catches up.
   - **Scenario B**: Machine sleeps mid-Cycle (after lock acquire, before release). Lock TTL expires during sleep. Next Cycle steals lock and recovers.
   - **Scenario C**: Machine sleeps mid-Cycle but wakes before TTL expires. Cycle resumes (if process survived) or is killed by sleep and lock goes stale.
   - **Scenario D**: Long sleep (> multiple intervals). Multiple triggers missed. Only one catch-up Cycle runs (lock prevents duplicate).
2. Implement fixture tests in `packages/sites/macos/test/sleep-wake-recovery.test.ts`:
   - Simulate lock TTL expiry by manipulating lock metadata timestamps.
   - Simulate skipped Cycle by asserting no trace record exists for the skipped interval.
   - Simulate catch-up by asserting the post-wake Cycle processes facts with cursors from before sleep.
   - Assert health transitions correctly (sleep itself is not a failure; missed work is caught up).
3. Document sleep/wake behavior in `docs/deployment/macos-site-materialization.md` §10.2 with findings from the fixture.
4. Verify `FileLock` TTL recovery works on macOS (it already handles Unix via PID check; confirm this covers macOS).

## Acceptance Criteria

- [x] Fixture file exists with at least 4 sleep/wake scenarios.
- [x] Tests prove cursor-driven catch-up works after missed triggers.
- [x] Tests prove lock TTL recovery works after a sleep-killed Cycle.
- [x] Tests prove only one Cycle runs even if multiple intervals were missed.
- [x] No test requires a real sleeping Mac (fixture-based only).

## Execution Notes

### What was delivered

1. **Fixture file** — `packages/sites/macos/test/sleep-wake-recovery.test.ts` (356 lines, 6 tests):
   - **Scenario A**: Sleep before Cycle start → skipped interval has no phantom trace; post-wake Cycle catches up using cursor; health stays healthy.
   - **Scenario B**: Sleep mid-Cycle with TTL expiry → stale lock detected and stolen; catch-up Cycle completes; lock removed; health stays healthy.
   - **Scenario C**: Sleep mid-Cycle, wake before TTL expires → fresh lock prevents new Cycle acquisition; fail-fast with "Failed to acquire lock"; health transitions to degraded (1 failure), not critical.
   - **Scenario D**: Long sleep with multiple missed intervals → single catch-up Cycle processes all pending deltas; subsequent no-op Cycle succeeds; lock prevents duplicate work.
   - **FileLock macOS coverage**: Confirms `FileLock` mtime-based stale detection works on macOS (pure time-based, no PID check on Unix); fresh lock is respected.

2. **Documentation update** — `docs/deployment/macos-site-materialization.md` §10.2 updated with fixture-proven behavior table:
   - Scenario A: ✅ Proven — cursor-driven catch-up, no phantom trace
   - Scenario B: ✅ Proven — TTL recovery via `FileLock` stale detection
   - Scenario C: ✅ Proven — fail-fast on held lock, health degrades not critical
   - Scenario D: ✅ Proven — single catch-up Cycle, lock deduplication

### Verification results

```bash
pnpm --filter @narada2/macos-site exec vitest run test/sleep-wake-recovery.test.ts
# ✅ 6/6 tests passed (20.98s)
```

All scenarios validated without requiring a real sleeping Mac.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
