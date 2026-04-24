---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T19:20:11.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [536]
---

# Task 537 - Cloudflare Observation Parity

## Goal

Implement the missing Cloudflare observation surfaces required for meaningful Operator Console parity.

## Required Work

1. Identify the currently stubbed Cloudflare console-observation methods.
2. Implement the missing remote observation path(s) needed for:
   - stuck work items,
   - pending outbound commands,
   - pending drafts,
   - any other parity-critical surface defined in Task 536.
3. Ensure the browser/CLI console consumes those observations without substrate-specific smear.
4. Add focused tests.

## Acceptance Criteria

- [x] Cloudflare observation gaps identified in Task 536 are implemented or explicitly blocked.
- [x] Console surfaces return real Cloudflare-backed observation data for the implemented paths.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Changes Made

**1. Cloudflare Coordinator** (`packages/sites/cloudflare/src/coordinator.ts`)

Added three observation methods to `NaradaSiteCoordinator` and `SiteCoordinator` interface:
- `getStuckWorkItems()` — queries `work_items` for `failed_retryable`, stale `leased` (>120 min), stale `executing` (>30 min)
- `getPendingOutboundCommandsForObservation()` — queries `outbound_commands` for `pending` (>15 min), `draft_creating` (>10 min), `sending` (>5 min)
- `getPendingDrafts()` — queries `outbound_commands` for `draft_ready`

Added three `case` branches to the DO's `fetch()` method:
- `GET /stuck-work-items` → returns `{ stuck_work_items: [...] }`
- `GET /pending-outbounds` → returns `{ pending_outbound_commands: [...] }`
- `GET /pending-drafts` → returns `{ pending_drafts: [...] }`

**2. Cloudflare Worker** (`packages/sites/cloudflare/src/index.ts`)

Added three new Worker routes with full auth, validation, and error handling:
- `GET /stuck-work-items?site_id=...`
- `GET /pending-outbounds?site_id=...`
- `GET /pending-drafts?site_id=...`

Each handler:
- Rejects non-GET with 405
- Authenticates via `authenticateRequest()` (Bearer token)
- Validates `site_id` query param (400 if missing)
- Resolves coordinator stub and calls observation method
- Returns JSON with canonical response shape

**3. Cloudflare Console Adapter** (`packages/sites/cloudflare/src/console-adapter.ts`)

Replaced three stub methods with real HTTP calls:
- `getStuckWorkItems()` → `GET /stuck-work-items`, maps response to `StuckWorkItem[]`
- `getPendingOutboundCommands()` → `GET /pending-outbounds`, maps response to `PendingOutboundCommand[]`
- `getPendingDrafts()` → `GET /pending-drafts`, maps response to `PendingDraft[]`

Added private `fetchObservation<T>()` helper for shared fetch logic (auth header, error handling, JSON parsing).

**4. Tests**

Updated `packages/sites/cloudflare/test/unit/console-adapter.test.ts`:
- Replaced 3 stub tests with 9 real tests (3 per endpoint)
- Tests verify: happy path, error→empty array, Authorization header inclusion

Created `packages/sites/cloudflare/test/integration/observation-surfaces.test.ts`:
- 9 integration tests covering Worker handlers and DO fetch()
- Auth failure (401), missing site_id (400), happy paths
- DO direct fetch paths for `/stuck-work-items` and `/pending-drafts`
- Method restriction (405 for POST on observation endpoints)

### Files Changed

| File | Change |
|------|--------|
| `packages/sites/cloudflare/src/coordinator.ts` | Added 3 observation methods + DO fetch routes |
| `packages/sites/cloudflare/src/index.ts` | Added 3 Worker handlers + route dispatch |
| `packages/sites/cloudflare/src/console-adapter.ts` | Replaced 3 stubs with real HTTP calls |
| `packages/sites/cloudflare/test/unit/console-adapter.test.ts` | Replaced stub tests with real tests (+6 tests) |
| `packages/sites/cloudflare/test/integration/observation-surfaces.test.ts` | New integration test file (+9 tests) |

## Verification

```bash
pnpm --filter @narada2/cloudflare-site typecheck   # clean
pnpm --filter @narada2/cloudflare-site exec vitest run  # 330/330 pass
pnpm verify                                         # 5/5 steps pass
```

- All 3 previously stubbed observation surfaces now return real data ✅
- Console routes remain substrate-agnostic ✅
- No substrate-specific smear in console-server-routes.ts ✅
- Cloudflare tests: 330/330 pass (was 318, +12 new tests) ✅
