---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T23:52:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [384, 431, 437]
---

# Task 536 - Operator Console Parity Contract

## Goal

Define the precise cross-substrate parity target for the existing Operator Console layer and state what "fully meaningful" means per substrate.

## Required Work

1. Define the canonical console capability set:
   - health,
   - attention queue,
   - pending outbound,
   - pending drafts,
   - credential requirements,
   - control actions,
   - browser console support.
2. Assess the current Windows, Cloudflare, and Linux substrate positions against that capability set.
3. State the minimum parity target for Cloudflare and Linux in v0.
4. Record any explicit bounded deviations that remain acceptable after the chapter.
5. Write the parity artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Parity artifact exists.
- [x] Capability matrix is explicit.
- [x] Cloudflare and Linux minimum targets are explicit.
- [x] Acceptable residual deviations are explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research

Examined the console layer across all three substrates:
- `packages/layers/cli/src/commands/console-server.ts` and `console-server-routes.ts`
- `packages/layers/cli/src/lib/console-core.ts`
- `packages/sites/windows/src/console-adapter.ts`
- `packages/sites/cloudflare/src/console-adapter.ts`
- `packages/sites/linux/src/console-adapter.ts`
- Relevant test files for each substrate

### Key Findings

**Windows** is the reference substrate with full implementation of all 7 capability families.

**Cloudflare** has health, credentials, and control actions, but 3 observation surfaces are stubbed:
- `getStuckWorkItems()` → `[]`
- `getPendingOutboundCommands()` → `[]`
- `getPendingDrafts()` → `[]`

The Worker needs to expose `GET` endpoints for these.

**Linux** has health and credentials, but 3 observation surfaces are stubbed and control actions are not implemented:
- `getStuckWorkItems()` → `[]`
- `getPendingOutboundCommands()` → `[]`
- `getPendingDrafts()` → `[]`
- `LinuxSiteControlClient` → returns "not yet implemented" error

Linux needs `executeOperatorAction` wiring (like Windows) and `outbound_handoffs`/`work_items` queries.

### Parity Artifact

Written `.ai/decisions/20260424-536-operator-console-parity-contract.md` (~10 KB) containing:
- Canonical 7-capability console capability set
- Per-substrate assessment table (Windows = reference, Cloudflare = 3 stubs, Linux = 3 stubs + no control)
- Minimum parity targets with P1/P2/P3 priorities for Cloudflare and Linux
- 6 acceptable residual deviations explicitly named
- Full capability matrix
- 5 invariants preserved
- Next executable lines for Tasks 537, 538, 539

## Verification

- Decision artifact exists and is ~10 KB ✅
- Capability matrix explicitly maps all 7 capabilities across 3 substrates ✅
- Cloudflare and Linux minimum targets have P1/P2/P3 priorities ✅
- 6 acceptable residual deviations documented ✅
- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
