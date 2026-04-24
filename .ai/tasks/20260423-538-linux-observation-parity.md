---
status: closed
created: 2026-04-23
depends_on: [536]
closed_at: 2026-04-24T00:27:00Z
closed_by: codex
governed_by: task_close:codex
---

# Task 538 - Linux Observation Parity

## Goal

Implement the missing Linux observation surfaces required for meaningful Operator Console parity.

## Required Work

1. Identify which Linux console-observation surfaces are currently empty because the substrate does not yet expose them.
2. Implement the missing local observation path(s) needed for the parity target defined in Task 536.
3. Ensure the browser/CLI console consumes those observations without Linux-specific UI branching.
4. Add focused tests.

## Acceptance Criteria

- [x] Linux observation gaps identified in Task 536 are implemented or explicitly blocked.
- [x] Console surfaces return real Linux-backed observation data for the implemented paths.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Linux Observation Parity Implemented

Updated `packages/sites/linux/src/console-adapter.ts` so Linux Sites no longer return empty placeholders for the main console observation surfaces when the underlying tables exist.

Implemented:

1. `getStuckWorkItems()`
   - reads from `work_items`
   - returns `failed_retryable`, stale `leased`, and stale `executing` work items
   - preserves honest empty result when the table is absent

2. `getPendingOutboundCommands()`
   - reads from `outbound_handoffs`
   - returns stale pending / draft-creating / sending commands
   - preserves honest empty result when the table is absent

3. `getPendingDrafts()`
   - reads from `outbound_handoffs`
   - returns `draft_ready` / `pending_approval` rows as real pending drafts
   - preserves honest empty result when the table is absent

This brings Linux observation parity materially closer to Windows and Cloudflare without inventing Linux-specific UI branching. The console continues to consume the generic `SiteObservationApi` interface.

### Test Surface

Expanded `packages/sites/linux/test/console-adapter.test.ts` to cover:

- empty fallback when `work_items` / `outbound_handoffs` are absent
- real `getStuckWorkItems()` results when `work_items` exists
- real `getPendingOutboundCommands()` results for stale commands
- real `getPendingDrafts()` results for draft rows

No new authority surfaces were introduced. This task is read-only observation parity only.

## Verification

- `pnpm --filter @narada2/linux-site exec vitest run test/console-adapter.test.ts`
- `pnpm --filter @narada2/linux-site typecheck`

Focused verification records that Linux observation parity now returns real Linux-backed data for the implemented paths and retains honest empty results when the substrate tables are absent.

