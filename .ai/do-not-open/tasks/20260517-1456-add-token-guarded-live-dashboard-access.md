---
status: closed
depends_on: [1452]
amended_by: narada.architect
amended_at: 2026-05-17T00:14:48.023Z
closed_at: 2026-05-17T00:50:42.797Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Add token-guarded live dashboard access

## Chapter

common-site-operational-dashboard-generator

## Goal

Require the optional live dashboard server to use a Staccato-style operator-entered bearer token flow for sensitive dashboard reads.

## Context

Task 1452 established a read-only local live dashboard server. The live server still needs an explicit access posture: browser-loaded UI may be public enough to render a shell, but dashboard data must not be exposed without an operator-provided token. This is an ergonomic local access guard, not a mutation capability or Site authority transfer.

## Required Work

1. Add bearer-token enforcement for sensitive live dashboard routes, including JSON snapshot endpoints and any route that returns Site operational data.
2. Keep the initial browser shell loadable without embedding the token or live Site data.
3. Add Staccato-style browser token entry: the operator enters a token, the browser stores it in localStorage, and dashboard API requests attach it as an Authorization: Bearer token.
4. Add a clear-token control that removes the stored browser token and returns the UI to the unauthenticated state.
5. Source the expected server token from an explicit caller option, environment variable, or credential reference; never hardcode, print, serialize, or fixture a real token.
6. Keep the server bound to 127.0.0.1 by default and retain read-only/no-mutation route posture.
7. Add tests for missing-token and wrong-token refusals, successful bearer-token reads, localStorage client behavior without token leakage, clear-token behavior, no token embedded in HTML/JSON, and no mutation routes.

## Non-Goals

- Do not make the token a task, Site, registry, or capability-consent authority.
- Do not add remote hosted dashboard authentication in this task.
- Do not store the token in server-side durable state.
- Do not expose mutation/action endpoints from the dashboard server.

## Execution Notes

- Amended by narada.architect at 2026-05-17T00:14:48.023Z: non-goals
- Added optional token-guarded mode to `createDashboardServer` through explicit
  caller options `accessToken` and `tokenStorageKey`.
- When `accessToken` is configured, `/` and `/index.html` serve only a
  token-entry browser shell with no embedded live dashboard snapshot and no
  embedded token value.
- Guarded live data routes `/snapshot.json` and `/api/snapshot` require
  `Authorization: Bearer <token>` and return bounded 401 refusals with
  `www-authenticate` and no raw token echo.
- Added browser shell logic for operator token entry, `localStorage`
  persistence, bearer API requests, and clear-token behavior.
- Preserved read-only posture: non-GET/HEAD methods still return
  `dashboard_server_read_only`; token guard is local read access, not Site
  authority or capability-consent evidence.
- Documented explicit server token sourcing and localStorage limits in
  `packages/site-operational-dashboard/README.md`.
- Added tests for missing/wrong token refusals, successful bearer reads,
  shell localStorage/clear-token behavior, no embedded live data/token values,
  and mutation route refusal.

## Verification

- `pnpm --filter @narada2/site-operational-dashboard test` passed: 3 files, 20
  tests.
- `pnpm --filter @narada2/site-operational-dashboard typecheck` passed.
- `pnpm --filter @narada2/site-operational-dashboard build` passed.
- `git diff --check -- packages/site-operational-dashboard/src/index.ts
  packages/site-operational-dashboard/test/site-operational-dashboard.test.ts
  packages/site-operational-dashboard/README.md
  .ai/do-not-open/tasks/20260517-1456-add-token-guarded-live-dashboard-access.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the baseline
  suggestion.
- `pnpm verify` still fails on the pre-existing unrelated CLI output admission
  guard in `sites-register.ts:69`, `sites-register.ts:85`, and
  `sites-register.ts:141`; the task file guard passes.

## Acceptance Criteria

- [x] Sensitive live dashboard data routes reject missing or wrong bearer tokens.
- [x] Browser UI supports operator token entry, localStorage persistence, bearer API requests, and token clearing without embedding token values in served assets.
- [x] Server token source is explicit and documented in package/API or CLI surface.
- [x] Live dashboard server remains read-only and binds locally by default.
- [x] Tests prove guarded reads, token non-leakage, and no mutation route posture.
