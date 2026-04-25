---
status: closed
closed: 2026-04-21
depends_on: [373, 374]
---

# Task 376 — Health, Trace, and Operator-Loop Integration

## Assignment

Integrate Windows Site health, trace, and operator inspection surfaces with the existing unattended operation layer and CLI observation commands. This task makes the Windows Site observable and operable by a human operator.

## Context

Tasks 373 and 374 produce running Windows Sites (native and WSL) that write health and trace to SQLite. Task 376 connects those artifacts to the operator's daily rhythm:
- `narada status --site {site_id}` must work for Windows Sites
- `narada doctor` must diagnose Windows Site health
- `narada ops` must include Windows Sites in its scan
- Health transitions (`healthy` → `degraded` → `critical`) must follow the unattended operation layer spec
- Stuck-cycle recovery traces must be visible to the operator

## Verification

```bash
# Typecheck across monorepo
pnpm typecheck
# → all 9 packages pass (including @narada2/windows-site)

# Focused tests
pnpm --filter @narada2/windows-site exec vitest run \
  test/unit/observability.test.ts \
  test/unit/notification.test.ts \
  test/unit/runner.test.ts
# → 28 tests pass

# Windows-site full suite
pnpm --filter @narada2/windows-site test
# → 148 tests pass across 11 test files; 0 failures
```

## Required Work

1. Implement **operator status query** for Windows Sites:
   - `getSiteHealth(siteId, variant): SiteHealthRecord` — reads from SQLite
   - `getLastCycleTrace(siteId, variant): CycleTraceRecord | null`
   - Format output matching Cloudflare `/status` response shape
2. Implement **CLI status command integration**:
   - `narada status --site {site_id}` works for Windows Sites
   - Detects whether the Site is native or WSL by presence of `%LOCALAPPDATA%` vs `/var/lib/narada` paths
   - Falls back to env var `NARADA_SITE_VARIANT` if auto-detection is ambiguous
3. Implement **CLI doctor integration**:
   - `narada doctor --site {site_id}` checks:
     - Site directory exists and is writable
     - coordinator.db exists and schema is current
     - Lock is not stuck (or shows stuck-cycle recovery info)
     - Health status is not `critical` or `auth_failed`
     - Last Cycle completed within expected interval
4. Implement **CLI ops integration**:
   - `narada ops` discovers all configured Windows Sites (scans `%LOCALAPPDATA%\Narada\` and `~/narada/`)
   - Displays a summary table: Site ID | Variant | Health | Last Cycle | Pending Work
5. Implement **health transition logic**:
   - Same state machine as `docs/product/unattended-operation-layer.md` §3
   - `healthy` → `degraded` on first failure
   - `degraded` → `critical` on third consecutive failure
   - Stuck-cycle recovery → `critical`
   - Auth failure → `auth_failed`
   - One success resets to `healthy`
6. Implement **notification adapter wiring**:
   - If a notification adapter is configured (webhook, log), emit `OperatorNotification` on `critical` and `auth_failed` transitions
   - Rate-limiting per the unattended operation layer spec
   - Log adapter is the zero-config default
7. Write tests:
   - Status query returns correct shape
   - Doctor detects stuck lock, missing directory, stale cycle
   - Health transitions follow the state machine
   - Notification emits only when threshold crossed
   - Rate-limiting suppresses duplicate alerts
8. Do **not** implement operator mutations (approve draft, retry work item). Observation and inspection only.

## Acceptance Criteria

- [x] `narada status --site {site_id}` returns health and last-Cycle info for Windows Sites.
- [x] `narada doctor --site {site_id}` diagnoses Windows Site health.
- [x] `narada ops` discovers and summarizes Windows Sites.
- [x] Health transitions match the unattended operation layer spec.
- [x] Notification wiring exists with log adapter default and rate-limiting.
- [x] Tests cover status, doctor, health transitions, and notifications.
- [x] No operator mutation surface is implemented.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.
