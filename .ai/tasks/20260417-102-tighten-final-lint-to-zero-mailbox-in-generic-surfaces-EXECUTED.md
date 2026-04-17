# Task 102 — Tighten Final Lint to Zero Mailbox Leakage in Generic Surfaces

**Status:** EXECUTED  
**Date:** 2026-04-17  
**Scope:** `scripts/kernel-lint.ts`, `packages/exchange-fs-sync/src/coordinator/store.ts`

## Summary

Removed the last unnecessary allowlist exception and expanded kernel coverage to two additional generic directories. The allowlist is now minimal, stable, and contains only clearly justified mail-module exceptions.

## Changes

### 1. Removed dead fallback from `coordinator/store.ts`

`rowToContextRecord` contained runtime fallbacks for legacy column names:

```typescript
// BEFORE
context_id: String(row.context_id ?? row.conversation_id),
scope_id: String(row.scope_id ?? row.mailbox_id),

// AFTER
context_id: String(row.context_id),
scope_id: String(row.scope_id),
```

These fallbacks were dead code. `getContextRecord` (the only caller) queries `context_records` using actual column names (`context_id`, `scope_id`), not aliased legacy names. No other code path supplies aliased rows to this function.

### 2. Removed `coordinator/store.ts` from kernel-lint allowlist

This allowlist entry was the only exception for a generic module (as opposed to a clearly mail-vertical module). Its removal means the `conversation_id` and `mailbox_id` patterns are now **hard errors** in `coordinator/store.ts`.

### 3. Expanded `KERNEL_DIRS` coverage

Added two clean generic directories to the lint scope:
- `packages/exchange-fs-sync/src/projector`
- `packages/exchange-fs-sync/src/recovery`

Both directories contain zero mailbox leakage, so no new allowlist entries were required.

## Allowlist State

**Before:** 6 files, 14 patterns  
**After:** 5 files, 12 patterns

Remaining exceptions are all in explicitly mail-vertical modules:

| File | Patterns | Rationale |
|------|----------|-----------|
| `charter/mailbox/materializer.ts` | `persistence_messages_import`, `normalized_types_import` | Dedicated mail-vertical materializer |
| `foreman/mailbox/context-strategy.ts` | `conversation_id`, `thread_id` | Forms PolicyContext from mail facts |
| `coordinator/mailbox-thread-context.ts` | `conversation_id`, `mailbox_id`, `normalized_types_import` | Hydrates mail thread context from filesystem views |
| `coordinator/mailbox-thread-id.ts` | `conversation_id`, `thread_id`, `normalized_types_import` | Maps normalized messages to Exchange thread IDs |
| `observability/mailbox.ts` | `conversation_id`, `mailbox_id` | Dedicated mail-vertical observation surface |

## Verification

- `pnpm typecheck` — clean across workspace
- `pnpm test` (exchange-fs-sync) — 846 passed, 4 skipped
- `pnpm test` (exchange-fs-sync-cli) — 15 passed
- `pnpm test` (exchange-fs-sync-daemon) — 111 passed
- `pnpm kernel-lint` — zero violations, zero stale entries

## Future Work (out of scope)

- `outbound/` is a generic effect boundary but contains a DB compatibility view (`outbound_commands`) with `conversation_id`/`mailbox_id` aliases. Adding it to `KERNEL_DIRS` would require either (a) removing the compat view and updating ~20 test files, or (b) adding an allowlist entry. This should be evaluated in a dedicated migration task.
- `ids/event-id.ts` still uses `mailbox_id` in the `EventIdInput` interface. Renaming this to `scope_id` would ripple through the entire codebase and should be handled as a separate refactoring.
