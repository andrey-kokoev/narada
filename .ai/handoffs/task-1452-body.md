# Add optional local live dashboard server

## Chapter

Common Site Operational Dashboard Generator

## Goal

Provide a local read-only server that refreshes dashboard snapshots for operator inspection.

## Context

The common dashboard core can serve live local projections without owning Site row collection. The server must remain read-only and accept caller-owned snapshot providers so task 1450 provider work remains separate.

## Required Work

1. Add a local server script or package export that serves the dashboard page and a JSON snapshot endpoint.
2. Make refresh interval, port, and site root configurable.
3. Keep server read-only with no mutation endpoints.
4. Add no-store cache headers for live JSON.
5. Add tests for HTML, JSON, attention filtering payload, no mutation routes, and no secret leakage.

## Execution Notes

- Added `createDashboardServer` to `packages/site-operational-dashboard/src/index.ts`.
- The server accepts a caller-provided `loadSnapshot` function and passes `siteRoot`, `refreshMs`, and generated time through a typed context.
- The server serves `GET`/`HEAD /` and `/index.html` as rendered HTML, and `GET`/`HEAD /snapshot.json` plus `/api/snapshot` as bounded JSON.
- JSON responses include derived section summaries, attention rows, refresh interval, optional site root, and explicit read-only/projection authority limits.
- Non-GET/HEAD methods return `405 dashboard_server_read_only`; unknown routes return 404.
- Live HTML and JSON responses use `cache-control: no-store`.
- Added README documentation for `createDashboardServer`, caller-owned port selection, `siteRoot`, `refreshMs`, and provider separation.
- Added tests for HTML serving, JSON snapshot payload, attention rows, no-store header, read-only method refusal, no raw secret leakage, and server context propagation.

## Verification

- `pnpm --filter @narada2/site-operational-dashboard test` passed: 8 tests.
- `pnpm --filter @narada2/site-operational-dashboard typecheck` passed.
- `pnpm --filter @narada2/site-operational-dashboard build` passed.
- `git diff --check -- packages/site-operational-dashboard/src/index.ts packages/site-operational-dashboard/test/site-operational-dashboard.test.ts packages/site-operational-dashboard/README.md` passed.

## Acceptance Criteria

- [x] Local server serves read-only HTML and JSON snapshot.
- [x] Server has no mutation routes.
- [x] Tests prove no-secret/no-mutation posture.
- [x] Port/site-root configuration is documented.
