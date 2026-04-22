---
status: closed
depends_on: [366, 367]
---

# Task 369 — Cloudflare Production RPC And Cron Wiring

## Assignment

Execute Task 369.

## Context

Prior Cloudflare tests often call Durable Object/coordinator methods directly. Task 364 recorded production residuals: Cron Trigger wiring and Worker→DO RPC via `fetch()`.

Cloudflare v1 needs production-shaped entry points without requiring deployment.

## Goal

Prove the Worker→Durable Object RPC and Cron-triggered Cycle entry boundaries in fixture tests.

## Execution Notes

### Worker→DO RPC

**Implemented:** `NaradaSiteCoordinator.fetch()` now handles HTTP routing for `/status`, `/control/actions`, and `/cycle`. The DO can be invoked via `stub.fetch(request)` in production.

**Fixture proof:** `test/integration/do-rpc-handler.test.ts` includes a test that:
1. Builds a mock `env.NARADA_SITE_COORDINATOR` namespace
2. Calls `env.NARADA_SITE_COORDINATOR.get(id).fetch(request)` — the exact production-shaped Worker→DO boundary
3. Asserts the response flows through the DO's HTTP routing and returns correct JSON

This proves the boundary pattern. Direct method calls in `runner.ts` are documented as test/fixture-only.

### Cron-Triggered Cycle Entry

**Implemented:** Worker default export includes `scheduled(event, env, ctx)` handler.

**Critical fix applied:** `event.cron` is NO LONGER used as the site identifier. Site identity comes from `env.SITE_ID` (with `"default"` fallback). The cron expression is logged for schedule identification only.

**Fixture proof:** `test/integration/cron-handler.test.ts` mocks `ScheduledEvent` and calls `handler.scheduled()`, asserting health and trace updates.

### Files Modified

- `packages/sites/cloudflare/src/runner.ts` — Extracted `runCycleOnCoordinator`; added fixture-only comment
- `packages/sites/cloudflare/src/index.ts` — Added `scheduled` handler; fixed siteId mapping
- `packages/sites/cloudflare/src/coordinator.ts` — Implemented DO `fetch()` HTTP routing
- `packages/sites/cloudflare/test/integration/do-rpc-handler.test.ts` — 6 tests (added Worker→DO stub test)
- `packages/sites/cloudflare/test/integration/cron-handler.test.ts` — 2 tests
- `docs/deployment/cloudflare-v1-productionization-boundary-contract.md` — Updated §7

## Required Work

1. Add or harden Worker entrypoint handling for scheduled Cron events.
2. Ensure Cron invokes the same bounded `runCycle()` path as explicit operator/test invocation.
3. Add Worker→DO `fetch()` RPC tests or equivalent integration tests using real `Request` objects.
4. Ensure direct method calls remain test fixtures only and are not presented as production wiring.
5. Ensure Cycle lock/health/trace behavior remains intact through RPC/Cron entry.
6. Update deployment docs with exact Cloudflare Cron and DO binding expectations.

## Non-Goals

- Do not deploy to Cloudflare.
- Do not create real Graph or Kimi calls.
- Do not implement multi-Site routing unless needed to preserve `site_id`/`scope_id` correctness.
- Do not extract generic Runtime Locus.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Cron entrypoint exists or residual is explicitly justified with blocker evidence.
- [x] Worker→DO RPC path is fixture-proven with real `Request` objects or equivalent.
- [x] RPC/Cron path uses the same Cycle path as tests/operators.
- [x] Lock, health, and trace behavior remain intact.
- [x] Deployment docs describe bindings and Cron schedule shape.
- [x] No derivative task-status files are created.
