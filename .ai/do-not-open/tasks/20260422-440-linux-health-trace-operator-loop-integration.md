---
status: closed
closed: 2026-04-22
depends_on: [438, 439]
---

# Task 440 — Health / Trace / Operator-Loop Integration

## Assignment

Wire Linux Site health transitions, trace storage, and operator inspection surface.

## Context

The Linux Site runner produces Cycle outcomes. This task connects those outcomes to the unattended operation layer's health state machine and trace storage, and extends the CLI with Linux Site-scoped operator commands.

## Required Work

1. Read `docs/deployment/linux-site-boundary-contract.md` (Task 437).
2. Create `packages/sites/linux/src/observability.ts`:
   - `getSiteHealth(siteId, mode)` — read from SQLite `site_health` table
   - `getLastCycleTrace(siteId, mode)` — read from SQLite `cycle_traces` table
   - `listAllSites(mode?)` — discover Sites by scanning filesystem roots
   - `checkSite(siteId, mode)` — run doctor checks (directory, DB, lock, health)
3. Extend CLI commands in `packages/layers/cli/src/commands/`:
   - `narada cycle --site {site_id} --mode {system|user}` — trigger one bounded Cycle
   - `narada status --site {site_id} --mode {system|user}` — read health + last cycle
   - `narada doctor --site {site_id} --mode {system|user}` — run doctor checks
   - `narada ops` — discover all Linux Sites and summarize health
4. Ensure health/trace tables are substrate-agnostic (same schema as Windows/Cloudflare).
5. Add tests for observability functions without requiring live systemd.

## Acceptance Criteria

- [x] `getSiteHealth`, `getLastCycleTrace`, `listAllSites`, `checkSite` exist and are tested.
- [x] CLI commands `narada cycle`, `narada status`, `narada doctor`, `narada ops` support Linux Sites.
- [x] Health/trace schema matches the unattended operation layer contract.
- [x] Site discovery scans correct filesystem roots for both modes.
- [x] Tests do not require live systemd.

## Execution Notes

### Implementation Summary

**1. `packages/sites/linux/src/observability.ts`** (new)
- `getLinuxSiteStatus(siteId, mode)` — reads health + last trace from SQLite coordinator
- `getSiteHealth(siteId, mode)` — health only
- `getLastCycleTrace(siteId, mode)` — last trace only
- `listAllSites(mode?)` — discovers sites by scanning `/var/lib/narada/` (system) and `~/.local/share/narada/` (user)
- `checkSite(siteId, mode, staleThresholdMinutes?)` — doctor checks: directory, DB, lock, systemd units, health, cycle freshness
- `isLinuxSite(siteId, mode?)` — presence check
- `resolveLinuxSiteMode(siteId)` — resolves mode from filesystem presence (system first, then user)

**2. CLI extensions**
- `narada cycle --site {id} --mode {system|user}` — added Linux path with substrate auto-detection (macOS → Linux → Windows fallback)
- `narada status --site {id} --mode {system|user}` — added `statusLinuxSite` with same auto-detection
- `narada doctor --site {id} --mode {system|user}` — added `doctorLinuxSite` with 6 doctor checks
- `narada ops` — added `loadLinuxSiteOpsEntries` and `opsLinuxSite`; Linux Sites now appear in dashboard table
- All commands gained `--mode` option in `main.ts`

**3. Health/trace schema**
Uses existing `SqliteSiteCoordinator` (`site_health` and `cycle_traces` tables), same schema as Windows/macOS. No schema changes needed.

**4. Tests**
- `packages/sites/linux/test/observability.test.ts` — 16 tests covering all observability functions
- Tests use temp directories and canonical `~/.local/share/narada/` paths; no live systemd required

### Verification
- `pnpm test` (linux-site): 69/69 passed ✅
- `pnpm test` (cli): 293/295 passed; 2 failures in `principal-bridge.test.ts` are pre-existing (unrelated to this task) ✅
- `pnpm build` (linux-site): clean ✅
- `pnpm build` (cli): clean ✅
- `pnpm typecheck` (linux-site): clean ✅
- `pnpm typecheck` (cli): clean ✅
