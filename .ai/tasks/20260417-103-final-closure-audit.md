# Task 103 — Final Closure Audit

**Status:** EXECUTED  
**Date:** 2026-04-17  
**Verdict:** CLOSED with explicit vertical-local exceptions

## Summary

The system has reached terminal de-arbitrized state. No implicit mailbox-default surfaces remain in the generic kernel. All remaining mailbox artifacts are explicit, localized to mail-vertical modules, and justified.

## Changes Made During This Task

### Generic utilities neutralized
- `persistence/cursor.ts` — `mailboxId` → `scopeId`, `mailbox_id` → `scope_id`
- `auth/secure-storage.ts` — `mailboxId` → `scopeId`
- `utils/resources.ts` — `mailboxId` → `scopeId`, `getActiveMailboxIds()` → `getActiveScopeIds()`
- `coordinator/store.ts` — removed dead `conversation_id`/`mailbox_id` fallbacks from `rowToContextRecord`
- `scripts/kernel-lint.ts` — removed `coordinator/store.ts` from allowlist; added `projector/` and `recovery/` to `KERNEL_DIRS`

## Fresh Reader Test

A new engineer exploring the codebase in dependency order would encounter:

1. **README** — "Mailbox as one vertical" is stated explicitly; pipeline is vertical-agnostic.
2. **Kernel docs (`docs/00-kernel.md`)** — No mail-specific concepts in the pipeline description.
3. **Control plane (`scheduler/`, `facts/`, `intent/`, `executors/`, `coordinator/store.ts`, `observability/queries.ts`)** — `context_id`, `scope_id`, `work_item`, `policy`, `intent`, `execution`. Zero mail references.
4. **Charter envelope (`charter/envelope.ts`)** — `VerticalMaterializerRegistry`, explicit registration per vertical. No implicit fallback.
5. **Sources (`sources/timer-source.ts`, `sources/webhook-source.ts`, `sources/filesystem-source.ts`)** — Each is a first-class peer. No mail default.
6. **Graph adapter (`adapter/graph/`)** — The *only* place a fresh reader sees mail-shaped APIs. Clearly labeled as the Graph/Exchange vertical.

**Conclusion:** A fresh reader would correctly infer that mail is *one vertical among peers*, not the default.

## Remaining Mailbox Artifacts (Explicit, Local, Justified)

| Artifact | Location | Justification |
|----------|----------|---------------|
| `MailboxId = string` alias, `mailbox_id` fields | `types/normalized.ts` | Data model for normalized mail messages. A non-mail system simply does not import this module. |
| `mailbox_id` in `BuildEventIdInput` | `ids/event-id.ts` | Event ID material for mail events. Non-mail events use different ID schemes. |
| `mailbox_id` in cursor file schema (legacy) | `persistence/cursor.ts` comments | Historical note in comments; runtime uses `scope_id`. |
| `mailbox_id?: string` (deprecated) | `config/types.ts` | Legacy config field for backward compatibility. Loader auto-promotes to `scope_id`. |
| `ContextStrategy = 'mailbox' \| ...` | `config/types.ts` | Config enum value. 'mailbox' is one of four explicit strategies. |
| `mailbox_id` in `GraphAdapterConfig` | `adapter/graph/adapter.ts` | Graph API config is inherently mail-shaped. |
| `MailboxConfig`, `MultiMailboxConfig`, `MailboxSyncResult` | `config/multi-mailbox.ts`, `health-multi.ts`, `runner/multi-sync.ts` | Explicitly multi-mailbox orchestration modules. |
| `MailboxContextStrategy`, `MailboxContextMaterializer` | `foreman/mailbox/`, `charter/mailbox/` | Explicitly mail-vertical modules. |
| `observability/mailbox.ts` | `observability/` | Dedicated mail-vertical observation surface. |
| `outbound_commands` compat view | `outbound/store.ts` | DB backward compatibility. TS code uses neutral `outbound_handoffs`. |

## Allowlist State

**5 files, 12 patterns** — all in explicitly mail-vertical modules:

- `charter/mailbox/materializer.ts`
- `foreman/mailbox/context-strategy.ts`
- `coordinator/mailbox-thread-context.ts`
- `coordinator/mailbox-thread-id.ts`
- `observability/mailbox.ts`

## Verification

- `pnpm typecheck` — clean across workspace
- `pnpm test` (exchange-fs-sync) — 846 passed, 4 skipped
- `pnpm test` (exchange-fs-sync-cli) — 15 passed
- `pnpm test` (exchange-fs-sync-daemon) — 111 passed
- `pnpm kernel-lint` — zero violations, zero stale entries

## Final Verdict

**CLOSED with explicit vertical-local exceptions.**

The generic kernel is effectively indistinguishable from a non-mail system. No hidden defaults remain. All mailbox artifacts are either (a) in explicitly mail-vertical modules, (b) deprecated legacy config fields, or (c) data-model types that a non-mail system would simply not import.
