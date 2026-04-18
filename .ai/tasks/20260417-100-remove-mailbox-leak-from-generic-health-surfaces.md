# Task 100 — Remove Mailbox Leak from Generic Health Surfaces

**Status:** EXECUTED  
**Date:** 2026-04-17  
**Scope:** `packages/exchange-fs-sync/src/health.ts`, callers, tests

## Summary

Removed `mailboxId` and `mailbox_id` from generic health/operability utilities. Generic health surfaces now use only neutral `scopeId`/`scope_id` identifiers. Mailbox-specific health remains confined to `health-multi.ts`.

## Changes

### `src/health.ts`
- `HealthFileData.mailboxId` → `scopeId`
- `HealthWriterOptions.mailboxId` → `scopeId`
- `LegacyHealthRecord.mailbox_id` → `scope_id`
- Updated `createHealthWriter`, `FileHealthStore`, and all internal references
- Updated JSDoc comments

### Callers updated
- `src/runner/multi-sync.ts` — `createHealthWriter({ scopeId: mailbox.mailbox_id })`
- `test/integration/sync-lifecycle.test.ts` — `new FileHealthStore({ rootDir, scopeId: mailboxId })`
- `test/unit/health.test.ts` — all fixtures/assertions updated to `scopeId`

### CLI status command
- `exchange-fs-sync-cli/src/commands/status.ts` — renamed `buildStatusReport` parameter `mailboxId` → `scopeId`

### Daemon service
- `exchange-fs-sync-daemon/src/service.ts` — renamed local callback parameters `_mailboxId` → `_scopeId`

## Intentionally Preserved

`health-multi.ts` remains fully mailbox-branded (`mailboxId`, `totalMailboxes`, etc.) because it is the dedicated mail-vertical health aggregation module, not a generic operability surface.

## Verification

- `pnpm typecheck` — clean across workspace
- `pnpm test` (exchange-fs-sync) — 846 passed, 4 skipped
- `pnpm test` (exchange-fs-sync-cli) — 15 passed
- `pnpm test` (exchange-fs-sync-daemon) — 111 passed
- `pnpm kernel-lint` — zero violations
