---
status: closed
closed: 2026-04-21
depends_on: [309, 322]
---

# Task 327 — Operator Status Endpoint

## Context

Task 308 specified that the Cloudflare Site must expose a private operator status endpoint. This task implements that endpoint.

## Goal

Create a private HTTP endpoint that returns Site health and the last Cycle Trace summary.

## Required Work

### 1. Implement the status handler

Route: `GET /status`

Authentication: Bearer token via `Authorization: Bearer {NARADA_ADMIN_TOKEN}` (Worker Secret).

Response shape:

```json
{
  "site_id": "help",
  "substrate": "cloudflare-workers-do-sandbox",
  "health": {
    "status": "healthy" | "degraded" | "unhealthy",
    "last_cycle_at": "2026-04-20T12:00:00Z",
    "last_cycle_status": "complete",
    "pending_work_items": 3,
    "locked": true,
    "locked_by_cycle_id": "cycle-123"
  },
  "last_cycle": {
    "cycle_id": "cycle-123",
    "started_at": "2026-04-20T12:00:00Z",
    "finished_at": "2026-04-20T12:00:15Z",
    "status": "complete",
    "steps_completed": [1, 2, 3, 4, 5, 6, 7, 8]
  }
}
```

### 2. Read from Durable Object

The handler must:
- Parse the site from the request path or header.
- Fetch the DO instance for that site.
- Read health and last Cycle Trace from DO SQLite.
- Return the JSON response.

### 3. Enforce privacy

- Reject unauthenticated requests with `401`.
- Reject requests for unknown sites with `404`.
- Do not expose secret values, raw message bodies, or evaluation payloads.

## Non-Goals

- Do not implement operator mutations (approve draft, retry work item, etc.).
- Do not implement a public dashboard.
- Do not implement real-time WebSocket updates.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `GET /status` returns valid JSON.
- [x] Authentication rejects invalid tokens.
- [x] Response contains health and last-Cycle summary.
- [x] No secrets or raw payloads are exposed.

## Execution Notes

- `packages/sites/cloudflare/src/coordinator.ts` created:
  - `SiteCoordinator` interface with `getHealth()` and `getLastCycleTrace()`
  - `CloudflareEnv` interface with `NARADA_SITE_COORDINATOR` binding
  - `resolveSiteCoordinator(env, siteId)` factory that resolves a DO stub
- `packages/sites/cloudflare/src/types.ts` extended:
  - `SiteHealthRecord` gains `pendingWorkItems`, `locked`, `lockedByCycleId`
- `packages/sites/cloudflare/src/index.ts` updated:
  - `Env` expanded with `NARADA_ADMIN_TOKEN` and `NARADA_SITE_COORDINATOR`
  - `handleStatus` implemented with Bearer token auth, site_id query param, DO coordinator resolution, health+trace fetching, and canonical JSON response
  - `buildStatusResponse` maps `critical`/`unknown` → `unhealthy`, never exposes `traceKey` or `error` fields
- `packages/sites/cloudflare/test/unit/operator-status.test.ts` — 15 tests:
  - Auth: missing header, wrong format, wrong token, correct token
  - Response shape: site_id/substrate, health fields, status mapping
  - Privacy: no traceKey exposure, no error detail exposure
  - Coordinator integration: fetch health/trace, null trace, degraded health
- `vitest run test/unit/operator-status.test.ts` — **15/15 pass**
- `pnpm --filter @narada2/cloudflare-site typecheck` — fails on `src/runner.ts` (Task 325 DO stub casting), not on Task 327 code. Task 327 files (`src/index.ts`, `src/coordinator.ts`, `src/types.ts`) compile cleanly.

## Suggested Verification

```bash
pnpm --filter <worker-package> typecheck
pnpm test:focused "pnpm --filter <worker-package> exec vitest run test/unit/operator-status.test.ts"
```

Mock DO and Worker Secrets for unit tests.
