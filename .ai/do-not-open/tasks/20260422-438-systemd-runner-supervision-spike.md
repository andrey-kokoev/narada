---
status: closed
closed: 2026-04-22
depends_on: [437]
---

# Task 438 — systemd Runner / Supervision Spike

## Assignment

Implement the Linux Site Cycle runner and systemd supervision machinery.

## Context

Task 437 produces the boundary contract. This task implements the core Cycle runner and systemd unit generation for both system-mode and user-mode Linux Sites.

## Required Work

1. Read `docs/deployment/linux-site-boundary-contract.md` (Task 437).
2. Create `packages/sites/linux/src/runner.ts` implementing `LinuxSiteRunner`:
   - Execute one bounded 8-step Cycle
   - Acquire/release `FileLock`
   - Call `DefaultSyncRunner`, `DefaultForemanFacade`, `computeHealthTransition`
   - Return `LinuxCycleResult`
3. Create `packages/sites/linux/src/supervisor.ts` implementing `LinuxSiteSupervisor`:
   - Generate systemd service and timer unit files
   - Support both system-mode and user-mode
   - `register(siteId, mode, intervalMinutes)` — write unit files, run `systemctl daemon-reload`, enable timer
   - `unregister(siteId, mode)` — disable and remove unit files
   - `listRegistered(mode)` — list all registered Sites
4. Handle cron fallback when systemd is unavailable:
   - Generate crontab entry as fallback
   - Detect systemd availability at runtime
5. Create `packages/sites/linux/src/types.ts` with `LinuxSiteMode`, `LinuxSiteConfig`, `LinuxCycleResult`, and related types.
6. Add tests that validate unit file generation and runner orchestration without requiring live systemd.

## Acceptance Criteria

- [x] `LinuxSiteRunner` exists and can execute a bounded Cycle (fixture-backed in v0).
- [x] `LinuxSiteSupervisor` generates valid systemd unit files for both system and user modes.
- [x] Cron fallback is implemented and tested.
- [x] Unit file generation is tested without live systemd.
- [x] Runner uses existing `FileLock`, `computeHealthTransition`, and kernel stores.
- [x] No live Linux root access is required for tests.

## Execution Notes

Implementation exists under `packages/sites/linux/`:

- `src/runner.ts` defines `DefaultLinuxSiteRunner`, executes one bounded 8-step Cycle, uses `FileLock`, updates health with `computeHealthTransition`, writes cycle traces, and releases locks.
- `src/supervisor.ts` defines `DefaultLinuxSiteSupervisor`, systemd service/timer generation, system/user unit paths, cron fallback, shell script generation, registration/unregistration file writes, and listing.
- `src/types.ts` defines Linux Site config/result types.
- Tests exist in `packages/sites/linux/test/runner.test.ts` and `packages/sites/linux/test/supervisor.test.ts`.

Bounded residual: v0 registration writes supervisor artifacts and chooses systemd vs cron, but does not execute live `systemctl` in tests. That matches the acceptance criterion that no live Linux root/systemd access is required.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
