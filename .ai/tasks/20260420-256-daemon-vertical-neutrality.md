# Task 256: Daemon Vertical Neutrality

## Chapter

Product Surface Coherence

## Context

The kernel claims to support arbitrary verticals (timer, webhook, filesystem) as first-class peers, but the daemon's `createScopeService` hardcodes Graph/Exchange assumptions. A scope with only timer or webhook sources crashes on startup with `No graph source found`.

## Goal

Make the daemon's scope service factory source-type agnostic so non-mail verticals can run without Graph-specific infrastructure.

## Required Work

### 1. Conditional Source Initialization

In `packages/layers/daemon/src/service.ts` (`createScopeService`):
- Do not throw if `sources` lacks `type: "graph"`.
- Only build `GraphHttpClient` and `DefaultGraphAdapter` when a graph source is present.
- Only create `ExchangeSource` when a graph source is present.
- Only register `SendReplyWorker`, `NonSendWorker`, and `OutboundReconciler` when mail-bound infrastructure is needed.
- Extract a `createGraphAdapter()` helper that is called conditionally.

### 2. Generalize Dispatch Context

In `packages/layers/daemon/src/service.ts` (`createMailboxDispatchContext` or equivalent):
- Rename `createMailboxDispatchContext` to `createDispatchContext`.
- Make `MailboxContextStrategy` conditional; for non-mail scopes, use a no-op or vertical-specific strategy.
- Ensure `runDispatchPhase` can execute with only non-mail sources.

### 3. Rename Stats Key

In `packages/layers/daemon/src/service.ts`:
- Rename `SyncStats.perMailbox` → `perScope`.
- Update all references (`stats.perMailbox?.[scope.scope_id]` → `stats.perScope?.[scope.scope_id]`).

### 4. UI Neutrality

In `packages/layers/daemon/src/ui/index.html`:
- Remove or conditionally render the "Mail executions" card in `loadExecutions()`.
- The generic executions page should only show intent and process execution cards unless the scope has mail sources.
- Keep `loadMailbox()` as a vertical-specific page under the Verticals nav.

### 5. Config Example

In `packages/layers/control-plane/config.example.json`:
- Add commented examples of timer, webhook, and filesystem scope configurations.
- Keep the mailbox example as the primary (most common) case.

## Non-Goals

- Do not implement new vertical sources (timer/webhook/fs already exist in kernel).
- Do not remove mailbox support.
- Do not change the Graph adapter internals.
- Do not add new projector logic for non-mail verticals.

## Execution Notes

### Changes Verified (Already Implemented in Codebase)

**1. Conditional Source Initialization (`service.ts`)**
- `createScopeService` no longer throws when `sources` lacks `type: "graph"`.
- `GraphHttpClient` and `DefaultGraphAdapter` are built only when `hasGraph` is true (lines 1032–1062).
- `ExchangeSource` is created only when an adapter exists; otherwise `TimerSource` or a no-op source is used (lines 1099–1114).
- `SendReplyWorker`, `NonSendWorker`, and `OutboundReconciler` are registered inside `createDispatchContext` only when `graphHttpClient && userId` (line 435).

**2. Generalized Dispatch Context (`service.ts`)**
- `createMailboxDispatchContext` was already renamed to `createDispatchContext` (line 323).
- `resolveContextStrategy(scope.context_strategy ?? 'mail')` is used, making strategy conditional on config.
- `VerticalMaterializerRegistry` registers `timer`, `webhook`, `filesystem`, and `mail` materializers (lines 342–346).

**3. Stats Key Rename (`service.ts`)**
- `SyncStats.perMailbox` was already renamed to `perScope` (line 204).
- All references updated: lines 1220, 1253, 1391, 1419, 1425, 1432.

**4. UI Neutrality (`ui/index.html`)**
- `loadExecutions()` fetches `/mail-executions` with `.catch(() => null)` and sets `hasMail = mailResult !== null`.
- The "Mail executions" card and metric are only rendered when `hasMail` is true (lines 869–876, 882).
- `loadMailbox()` remains as a vertical-specific page under the Verticals nav.

**5. Config Example (`config.example.json`)**
- Commented timer scope example (lines 51–83), webhook scope example (lines 84–116), and filesystem scope example (lines 117–149) are present.

**6. Integration Test**
- `packages/layers/daemon/test/integration/timer-vertical-startup.test.ts` (2 tests):
  - `starts successfully with a timer-only scope (no graph source)` — creates `createScopeService` with timer source, runs `syncOnce()`, asserts status is not fatal.
  - `SyncStats uses perScope instead of perMailbox` — same startup path.
- Both tests pass.

### Validation

- `pnpm verify` passes (typecheck + build + fast tests).
- Focused integration test passes: `timer-vertical-startup.test.ts` (2/2).
- `grep` confirms zero remaining `perMailbox` in daemon/CLI source.
- `grep` confirms `MailboxContextStrategy` is not hardcoded in `service.ts`.

## Acceptance Criteria

- [x] Daemon starts successfully with a scope that has no `type: "graph"` source.
- [x] A timer-only scope completes a sync cycle without crashing.
- [x] `SyncStats` uses `perScope` instead of `perMailbox`.
- [x] UI executions page does not show mail-specific cards for non-mail scopes.
- [x] `config.example.json` includes non-mail scope examples.
- [x] `pnpm verify` passes.
- [x] Integration test proving non-mail scope startup.

## Dependencies

- Task 255 (Init & Setup Path Hardening) — setup path should be able to scaffold non-mail operations.
- Task 252 (Agent Verification Speed & Telemetry) — verification commands must be stable for daemon tests.
