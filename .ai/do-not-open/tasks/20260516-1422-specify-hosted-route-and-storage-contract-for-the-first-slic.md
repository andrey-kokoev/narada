---
status: closed
depends_on: [1420]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:12:51.529Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by docs/product/site-telemetry-hosted-route-storage-contract.v0.md plus package build/test verification.
closed_at: 2026-05-16T22:12:57.056Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Specify hosted route and storage contract for the first slice

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md

## Goal

Convert the live-slice boundary into concrete route, storage, migration, and response contracts without deploying them.

## Context

The package already exposes worker routes and D1/KV projection behavior. Before resource creation, the expected live contract needs one inspectable shape.

## Required Work

1. Inspect packages/site-registry-cloudflare source, tests, migrations, wrangler example, and README.
2. Document the expected live route set, storage bindings, D1 migration posture, KV use if any, response schemas, and auth/capability requirements.
3. Identify any naming drift where package paths use SiteRegistry for compatibility while docs should say Site Telemetry Surface realization.
4. Record any code/doc/config repairs required before live deploy as follow-on residuals or implement only small non-live documentation fixes if clearly in scope.
5. Verify package build/tests or record why verification is deferred.

## Non-Goals

- Do not replace Cloudflare placeholder ids without actual operator-provided coordinates.
- Do not deploy, migrate live D1, create secrets, or publish routes.
- Do not rename public package APIs in a way that breaks current callers.

## Execution Notes

Created `docs/product/site-telemetry-hosted-route-storage-contract.v0.md`.

The artifact records the hosted route set, auth posture, response schemas, D1 tables, KV projection keys, migration posture, Cloudflare binding expectations, and compatibility naming drift for the first Narada proper Site Telemetry Publication live slice.

No Cloudflare placeholder ids were replaced. No live D1 migration, Cloudflare deploy, secret creation, route publication, commit, or push was performed.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed; 4 test files, 37 tests.
- `rg -n "NARADA_SITE_REGISTRY_KV|NARADA_SITE_REGISTRY_D1|/api/messages|site_registry_remote_messages|Naming Drift|projection_only" docs/product/site-telemetry-hosted-route-storage-contract.v0.md` passed; artifact names bindings, route family, D1 table, naming drift, and projection-only posture.

## Acceptance Criteria

- [x] A hosted route/storage contract artifact exists.
- [x] The artifact names D1/KV bindings, migrations, route families, and protected route posture.
- [x] Compatibility naming and desired product naming are distinguished.
- [x] Verification evidence or an explicit deferral is recorded.
