---
status: closed
closed: 2026-04-22
depends_on: [438, 440]
---

# Task 441 — Service Hardening and Recovery Fixture

## Assignment

Add stuck-cycle recovery, service hardening options, and cron fallback to the Linux Site materialization.

## Context

The unattended operation layer requires stuck-cycle detection and recovery. Linux Sites also benefit from systemd service hardening. This task adds these safety mechanisms.

## Required Work

1. Read `docs/deployment/linux-site-boundary-contract.md` (Task 437) and `docs/product/unattended-operation-layer.md`.
2. Create `packages/sites/linux/src/recovery.ts`:
   - `recoverStuckLock(siteId, mode)` — detect and recover stale locks using `FileLock` TTL
   - `checkLockHealth(siteId, mode)` — report lock status without stealing
3. Update `packages/sites/linux/src/supervisor.ts`:
   - Add hardening options to generated systemd units:
     - v0 minimal: `NoNewPrivileges=yes`, `PrivateTmp=yes`
     - v1 full: `ProtectSystem=strict`, `ProtectHome=yes`, `MemoryMax=`, etc.
   - Generate units with correct `After=network-online.target` ordering
   - Generate units with `TimeoutStartSec=` and `TimeoutStopSec=`
4. Implement cron fallback:
   - `generateCronEntry(siteId, mode, intervalMinutes)` — generate crontab line
   - Detect systemd availability and auto-fallback to cron
5. Add boot/network ordering validation:
   - Verify `After=network-online.target` or `After=network.target` in generated units
6. Add tests for recovery logic and unit file hardening without live systemd.

## Acceptance Criteria

- [x] Stuck-lock recovery is implemented and tested using `FileLock` TTL.
- [x] Generated systemd units include correct ordering and timeout directives.
- [x] v0 hardening (`NoNewPrivileges`, `PrivateTmp`) is included in generated units.
- [x] Cron fallback is implemented and auto-selected when systemd is unavailable.
- [x] Boot/network ordering is validated in generated units.
- [x] Tests do not require live systemd.

## Execution Notes

### Implementation Summary

**1. `packages/sites/linux/src/recovery.ts`** (new)
- `checkLockHealth(siteId, mode, lockTtlMs?)` — inspects lock directory mtime vs TTL; returns `{ status: "healthy" | "stuck" | "missing", lockDir, ageMs?, lockTtlMs }` without modifying anything
- `recoverStuckLock(siteId, mode, lockTtlMs?)` — delegates to `checkLockHealth`; removes lock only when status is `"stuck"`
- `runner.ts` `recoverStuckLock()` method now delegates to the standalone recovery module, keeping the interface contract intact

**2. `packages/sites/linux/src/supervisor.ts`** (enhanced)
- Added `TimeoutStopSec=30` to generated service units
- Added optional `ServiceGenerationOptions.hardeningLevel` (`"v0" | "v1"`):
  - v0 (default): `NoNewPrivileges=yes`, `PrivateTmp=yes`
  - v1: adds `ProtectSystem=strict`, `ProtectHome=yes`, `ReadWritePaths={siteRoot}`
- Added `validateSystemdService(content)` — checks for `[Unit]`, `[Service]`, `Type=oneshot`, `After=network-online.target` (or `network.target`), `TimeoutStartSec=`, `TimeoutStopSec=`
- Added `generateCronEntry(siteId, mode, intervalMinutes)` convenience overload alongside existing config-based overload

**3. Cron fallback**
Already implemented in prior task (438). `DefaultLinuxSiteSupervisor.register()` auto-detects systemd via `isSystemdAvailable()` and falls back to cron when absent. No changes needed.

**4. Tests**
- `test/recovery.test.ts` — 6 tests covering `checkLockHealth` (missing/healthy/stuck) and `recoverStuckLock` (false for fresh/missing, true for stale)
- `test/supervisor.test.ts` — added 8 tests: `TimeoutStopSec` presence, v1 hardening inclusion/omission, `validateSystemdService` pass/fail cases, discrete-parameter `generateCronEntry`

### Verification
- `pnpm test` (linux-site): 82/82 passed ✅
- `pnpm build` (linux-site): clean ✅
- `pnpm typecheck` (linux-site): clean ✅
- `pnpm build` (cli): clean ✅
