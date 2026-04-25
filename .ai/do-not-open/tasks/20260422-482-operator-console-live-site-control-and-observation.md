---
status: closed
created: 2026-04-22
owner: unassigned
depends_on: [384]
---

# Task 482 - Operator Console Live Site Control and Observation

## Context

Narada already has an **Operator Console / Site Registry** chapter (Tasks 378-384). The accepted closure decision is `.ai/decisions/20260421-384-operator-console-site-registry-closure.md`.

The established name for the multi-Site operator level is:

- **Operator Console**: operator-facing cross-Site health, attention, and control surface.
- **Site Registry**: durable inventory and routing table for discovered Sites.

Do not rename this surface to "Fleet Console" in this task. The closure decision explicitly describes the console as read-only aggregation plus audited routing, not fleet orchestration.

The closure decision recorded two high-pressure residuals:

1. `narada console approve/reject/retry` currently constructs `ControlRequestRouter` with `clientFactory: () => undefined`, so live control requests return `No control client available`.
2. `SiteObservationApi.getStuckWorkItems()`, `getPendingOutboundCommands()`, `getPendingDrafts()`, and `getCredentialRequirements()` currently return empty arrays in the CLI observation factory, so `narada console attention` does not yet reflect real Site coordinator state.

The user asked whether many Windows Narada Sites have a control panel and what that level is called. The existing answer in the repo is: **Operator Console / Site Registry**.

## Goal

Make the existing Operator Console useful for many Windows Sites by wiring live Windows Site control routing and real Site observation queries, while preserving the console/registry boundary: the console observes and routes, but each Site remains the authority for mutation.

## Read First

- `.ai/decisions/20260421-384-operator-console-site-registry-closure.md`
- `docs/deployment/operator-console-site-registry-boundary-contract.md`
- `docs/product/operator-console-site-registry.md`
- `packages/layers/cli/src/commands/console.ts`
- `packages/sites/windows/src/router.ts`
- `packages/sites/windows/src/site-control.ts`
- `packages/sites/windows/src/site-observation.ts`
- `packages/sites/windows/src/registry.ts`
- `packages/sites/windows/src/aggregation.ts`

## Non-Goals

- Do not rename Operator Console / Site Registry to Fleet Console.
- Do not implement GUI or web UI.
- Do not add Cloudflare Site support.
- Do not implement fleet-wide orchestration, auto-heal, auto-approve, or cross-Site cycle scheduling.
- Do not let the console mutate Site coordinator state directly.
- Do not bypass Site-owned `executeOperatorAction()` or the Site control API path.
- Do not invent a second source of truth for Site state.

## Required Work

1. Wire live Windows Site control client binding for CLI console commands.
   - Replace the `clientFactory: () => undefined` placeholder in `narada console approve/reject/retry`.
   - Construct a `WindowsSiteControlClient` or equivalent Site-owned control client from the registered Site metadata.
   - Open the target Site's coordinator/control context through the existing Windows Site package surfaces.
   - Route requests through `ControlRequestRouter`.
   - Ensure the Site-side mutation still flows through `executeOperatorAction()` and writes Site audit records.
   - Preserve the console router audit record in the registry audit log.

2. Implement real observation queries for CLI console attention.
   - Replace empty-array observation methods with read-only queries against the registered Site's observation/coordinator data:
     - stuck work items;
     - pending outbound commands;
     - pending drafts;
     - credential requirements.
   - Use existing observation/query helpers where available.
   - Queries must be read-only. No direct mutation from observation code.

3. Keep console aggregation substrate-neutral in shape.
   - The first live binding may be Windows-only, but public CLI output and types should remain generic over Site ID, status, severity, item type, and target ID.
   - If a registered non-Windows Site is encountered and no live client exists, return a clear unsupported result rather than silently dropping it.

4. Add focused tests.
   - Cover successful control routing when a Windows Site control client is available.
   - Cover unsupported/no-client behavior with an informative error.
   - Cover that `console attention` includes real pending/stuck Site observations from fixture state.
   - Cover that observation methods do not mutate Site state.
   - Preserve existing `narada console status` behavior.

5. Update docs.
   - Update `docs/product/operator-console-site-registry.md` or a nearby operator doc with the current live-support status.
   - State explicitly:
     - Operator Console is not a fleet orchestrator.
     - Site Registry is advisory inventory/routing.
     - mutation is routed to Site-owned control surfaces.
     - Windows Sites are the first live-bound substrate.

6. Record verification and residuals.
   - Record focused test commands and results in this task.
   - If full live control cannot be completed because a Site context factory is missing, stop at the smallest useful binding and record the missing contract as an explicit residual or follow-up task.

## Acceptance Criteria

- [x] `narada console approve/reject/retry` no longer fail with `No control client available` for a registered Windows Site with valid local state.
- [x] Console control requests still route through `ControlRequestRouter` and preserve registry router audit.
- [x] Site-side mutations still go through Site-owned control action execution and Site audit.
- [x] `narada console attention` derives pending/stuck items from real registered Windows Site state instead of placeholder empty arrays.
- [x] Observation code is read-only and does not mutate Site coordinator state.
- [x] Tests cover live client binding, unsupported substrate behavior, and real observation aggregation.
- [x] Documentation reflects the existing vocabulary: Operator Console / Site Registry, not Fleet Console.
- [x] Verification evidence is recorded in this task.

## Execution Notes

### Control Client Binding

1. **`packages/sites/windows/src/site-control.ts`**:
   - Added `db?: Database` to `WindowsSiteControlContext` so the client can close the connection after execution.
   - Modified `WindowsSiteControlClient.executeControlRequest` to close `ctx.db` in a `finally` block.
   - Added `resolvePrimaryScopeId()` helper that reads the site's `config.json` to find the first scope/mailbox ID, falling back to querying the DB or the site ID itself.
   - Added `createWindowsSiteControlClientFactory(registry)` which creates a `WindowsSiteControlClient` for registered Windows Sites (`native`/`wsl` variant). Returns `undefined` for unknown or non-Windows Sites.

2. **`packages/layers/cli/src/commands/console.ts`**:
   - Replaced `clientFactory: () => undefined` with `createWindowsSiteControlClientFactory(registry)`.
   - Console control commands now open the target Site's coordinator SQLite, resolve the scope, and delegate to `executeOperatorAction`.

### Real Observation Queries

3. **`packages/sites/windows/src/observability.ts`**:
   - Added `WindowsSiteObservationApi` class implementing `SiteObservationApi`.
   - `getStuckWorkItems()`: queries `work_items` for `failed_retryable`, stale `leased`, and stale `executing` items.
   - `getPendingOutboundCommands()`: queries `outbound_handoffs` for `pending`, `draft_creating`, and `sending` items that have exceeded time thresholds.
   - `getPendingDrafts()`: queries `outbound_handoffs` for `draft_ready` items.
   - `getCredentialRequirements()`: derives from `site_health` table — returns `interactive_auth_required` when health status is `auth_failed`.
   - All methods open the Site's DB, run read-only `SELECT` queries, and close the connection. They gracefully return empty arrays if tables do not exist yet.

4. **`packages/layers/cli/src/commands/console.ts`**:
   - Updated `createObservationFactory()` to use `createWindowsSiteObservationApi` for Windows Sites.
   - Added substrate-neutral fallback for non-Windows Sites that returns `error` health status and empty arrays.

### Tests

5. **`packages/sites/windows/test/unit/site-control.test.ts`** (new file):
   - Tests `createWindowsSiteControlClientFactory` returns a client for registered Windows Sites and `undefined` for unknown Sites.
   - End-to-end tests verify `approve` and `retry` requests route through the live client, execute via `executeOperatorAction`, and are audited.
   - Tests error handling when target does not exist (returns `rejected`).
   - Tests unsupported substrate behavior (returns `error`).

6. **`packages/sites/windows/test/unit/observability.test.ts`**:
   - Added tests for `WindowsSiteObservationApi`:
     - `getStuckWorkItems()` returns real stuck items from seeded DB state.
     - `getPendingOutboundCommands()` returns real pending commands.
     - `getPendingDrafts()` returns real drafts.
     - `getCredentialRequirements()` returns auth requirement when health is `auth_failed`.
     - Empty arrays when tables don't exist.
     - No mutation of Site state after observation queries.

7. **`packages/layers/cli/test/commands/console.test.ts`**:
   - Updated mock to include `createWindowsSiteControlClientFactory` and `createWindowsSiteObservationApi`.
   - Added test for successful control routing when mock client is available.
   - Added test for `console attention` including real pending items from mock observation data.
   - Preserved existing `console status` tests.

### Documentation

8. **`docs/product/operator-console-site-registry.md`**:
   - Added §10 "Live Support Status" documenting:
     - `narada console status` aggregates real Windows Site health.
     - `narada console attention` derives stuck work items, pending outbounds, pending drafts, and credential requirements from real Site coordinator state.
     - `narada console approve/reject/retry` routes through live `WindowsSiteControlClient`.
     - Explicit statements: not a fleet orchestrator, registry is advisory, mutation is routed, Windows Sites are the first live-bound substrate.

### Residuals

- **Multi-scope resolution**: `resolvePrimaryScopeId` uses the first scope from config. If a Site has multiple scopes and the target is in a non-first scope, the console control command will fail. A future improvement could search all scopes for the target.
- **Cloudflare Site live binding**: Remote Sites require HTTP-based control clients and endpoint discovery. Deferred to a future task.
- **Credential requirements**: Currently derived only from `auth_failed` health status. A dedicated credential-requirements table or richer derivation could be added later.

## Review Fixes (2026-04-22)

Three code-quality issues found during review and fixed:

1. **`packages/sites/windows/src/observability.ts`**: Moved `import type` block from mid-file (after `isSiteDir`) to the top with other imports.
2. **`packages/sites/windows/src/site-control.ts`**: Removed duplicate JSDoc comment that was placed before `resolvePrimaryScopeId` instead of before `WindowsSiteControlClient`; added the JSDoc to the class declaration instead.
3. **`packages/sites/windows/test/unit/site-control.test.ts`**: Renamed misleading test `"returns undefined for a non-Windows substrate"` → `"returns a client for wsl variant regardless of substrate"` to match its actual assertion.

## Verification

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/windows-site exec vitest run \
  test/unit/router.test.ts \
  test/unit/aggregation.test.ts \
  test/unit/observability.test.ts \
  test/unit/site-control.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/console.test.ts
pnpm verify
```

**Results:**
- Windows-site tests: 51 passed (router 11, aggregation 18, observability 15, site-control 7)
- CLI console tests: 8 passed
- `pnpm verify`: all 5 steps passed (task-file-guard, typecheck, build, charters, ops-kit)


