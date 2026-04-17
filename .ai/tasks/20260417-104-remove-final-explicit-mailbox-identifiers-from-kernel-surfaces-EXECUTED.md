# Task 104 — Remove Final Explicit Mailbox Identifiers from Kernel Surfaces

**Date**: 2026-04-17
**Status**: EXECUTED
**Depends on**: 103 (final closure audit)

---

## Goal
Eliminate the last remaining `mailbox_id` and `"mailbox"` string references from generic (non-mail-vertical) kernel surfaces, replacing them with `scope_id` and `"mail"` respectively.

## Motivation
Tasks 099-103 neutralized the vast majority of mailbox leakage. Two categories remained:
1. `ids/event-id.ts` — the event identity derivation utility still accepted `mailbox_id` in its public input interface.
2. Config/observability enums — generic `ContextStrategy` and vertical detection still defaulted to/returned `"mailbox"` instead of `"mail"`.

These were the final barriers to a fully domain-neutral kernel.

---

## Changes

### 1. Event Identity (`src/ids/event-id.ts`)

| Before | After |
|--------|-------|
| `BuildEventIdInput.mailbox_id` | `BuildEventIdInput.scope_id` |
| `base = { mailbox_id: input.mailbox_id, ... }` | `base = { scope_id: input.scope_id, ... }` |
| `computeEventId` overloads with `mailbox_id` | Updated to `scope_id` |

Callers in `normalize/delta-entry.ts` and `normalize/message.ts` already passed `mailbox_id` (from `NormalizedMessage`) but the generic utility now speaks `scope_id`.

### 2. Configuration Surfaces

**`src/config/types.ts`**
- `ContextStrategy` default literal: `'mailbox'` → `'mail'`

**`src/config/schema.ts`**
- `context_strategy` Zod default: `'mailbox'` → `'mail'`

**`src/config/load.ts`**
- Two fallback normalizations: `"mailbox"` → `"mail"`

### 3. Observability Queries (`src/observability/queries.ts`)

| Function | Before | After |
|----------|--------|-------|
| `detectVerticalFromContext` | returns `"mailbox"` as default | returns `"mail"` |
| `detectVerticalFromFactType` | returns `"mailbox"` for `mail.` prefix | returns `"mail"` |

Removed redundant `scopeId` ternary in vertical-specific query path.

---

## Verification

- `pnpm build` — clean
- `pnpm typecheck` — clean
- `pnpm kernel-lint` — zero leakage detected
- `pnpm test` (core) — 846 passed
- `pnpm test` (daemon) — 111 passed
- `pnpm test` (cli) — 15 passed

No test changes were required. Existing test suites already used `scope_id` and the `"mail"` vertical string via the updated registry/config surfaces, so everything converged cleanly.

---

## Result

The kernel is now fully free of explicit mailbox identifiers in generic surfaces. All remaining `mailbox_id` / `mailbox` references are confined to:
- Mail-vertical-specific modules (`charter/mailbox/`, `foreman/mailbox/`, `coordinator/mailbox-*`, `observability/mailbox.ts`)
- The SQLite compatibility view for `outbound_commands` (DB backward compatibility)
- The `health-multi.ts` dedicated mail-vertical module
