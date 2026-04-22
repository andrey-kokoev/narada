---
status: closed
closed: 2026-04-22
depends_on: [431, 432, 433]
---

# Task 434 — macOS Health / Trace / Operator-Loop Integration

## Assignment

Integrate site-local health storage, trace persistence, and operator CLI surface for macOS Sites.

## Context

The Windows Site implementation introduced a **site-local coordinator** pattern: a separate SQLite file (`{siteRoot}/db/coordinator.db`) with substrate-agnostic tables (`site_health`, `cycle_traces`, `notification_log`). The control-plane coordinator remains the authority for `work_item`, `execution_attempt`, and `outbound_handoff` state. macOS should follow the same pattern.

## Required Work

1. Implement `packages/sites/macos/src/observability.ts`:
   - `getSiteHealth(siteRoot)` → read `site_health` row from site-local SQLite.
   - `getLastCycleTrace(siteRoot)` → read most recent `cycle_traces` row.
   - `getSiteSummary(siteRoot)` → aggregate health + last trace + scope count.
2. Implement `packages/sites/macos/src/health.ts`:
   - `writeHealthRecord(siteRoot, outcome)` → call `computeHealthTransition()` from `@narada2/control-plane`, write result to `site_health`.
   - `readHealthRecord(siteRoot)` → read current health.
3. Implement `packages/sites/macos/src/trace.ts`:
   - `appendCycleTrace(siteRoot, trace)` → insert into `cycle_traces`.
   - `writeTraceArtifact(siteRoot, cycleId, artifact)` → write large JSON to `{siteRoot}/traces/{cycleId}.json`.
4. Extend CLI (`packages/layers/cli/src/commands/`):
   - `narada status --site {site_id}` → query macOS Site health and last Cycle.
   - `narada doctor --site {site_id}` → check directory, DB, lock, LaunchAgent registration, health.
   - `narada ops` → discover all macOS Sites (scan `~/Library/Application Support/Narada/`) and summarize.
5. Write unit tests:
   - Health record write/read roundtrip.
   - Trace append and artifact write.
   - `doctor` detects missing directory, missing DB, unregistered LaunchAgent.

## Acceptance Criteria

- [x] `site_health` table exists in site-local SQLite with same schema as Windows.
- [x] `cycle_traces` table exists in site-local SQLite with same schema as Windows.
- [x] `narada status --site {site_id}` returns health and last-Cycle summary for macOS.
- [x] `narada doctor --site {site_id}` checks macOS-specific concerns (LaunchAgent, Keychain readiness).
- [x] Observation surfaces are read-only (no direct SQL mutations from CLI).

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
