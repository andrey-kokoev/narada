# Task 101 — Introduce Explicit Vertical Materializer Registry

**Status:** EXECUTED  
**Date:** 2026-04-17  
**Scope:** `packages/exchange-fs-sync/src/charter/envelope.ts`, daemon wiring, tests

## Summary

Removed the implicit mailbox fallback in `charter/envelope.ts` and replaced it with an explicit `VerticalMaterializerRegistry`. All verticals (timer, webhook, filesystem, mail) must be registered explicitly. Missing verticals fail deterministically.

## Changes

### Core registry (`src/charter/envelope.ts`)
- Introduced `VerticalMaterializerRegistry` class:
  - `register(vertical, factory)` — fluent API
  - `resolve(vertical, deps)` — fails fast with clear error if unregistered
- Introduced `MaterializerFactory` type: `(deps) => ContextMaterializer`
- Updated `BuildInvocationEnvelopeDeps` — replaced optional `messageStore` with required `materializerRegistry`
- `selectMaterializer` now delegates entirely to the registry; no hardcoded `MailboxContextMaterializer` fallback
- `resolveVertical` uses prefix-based detection, but materializer selection is now fully explicit

### Exports
- `src/charter/index.ts` — exports `VerticalMaterializerRegistry`, `MaterializerFactory`, materializer classes
- `src/index.ts` — re-exports `VerticalMaterializerRegistry`, `TimerContextMaterializer`, `WebhookContextMaterializer`, `FilesystemContextMaterializer`

### Daemon wiring (`exchange-fs-sync-daemon/src/service.ts`)
- Explicitly registers all four verticals before dispatch:
  ```ts
  const materializerRegistry = new VerticalMaterializerRegistry()
    .register('timer', () => new TimerContextMaterializer())
    .register('webhook', () => new WebhookContextMaterializer())
    .register('filesystem', () => new FilesystemContextMaterializer())
    .register('mail', () => new MailboxContextMaterializer(rootDir, messageStore));
  ```
- Passes `materializerRegistry` to `buildInvocationEnvelope`

### Tests
- `test/unit/charter/envelope.test.ts` — updated to construct and pass an explicit registry

## Verification

- `pnpm typecheck` — clean across workspace
- `pnpm test` (exchange-fs-sync) — 846 passed, 4 skipped
- `pnpm test` (exchange-fs-sync-cli) — 15 passed
- `pnpm test` (exchange-fs-sync-daemon) — 111 passed
- `pnpm kernel-lint` — zero violations
