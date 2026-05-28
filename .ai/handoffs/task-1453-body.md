# Integrate Site Telemetry and Site Registry projection rows

## Chapter

Common Site Operational Dashboard Generator

## Goal

Add optional row providers for hosted Site Registry and Site Telemetry Publication projection posture.

## Context

The dashboard package should be able to render hosted Site Registry and telemetry posture from fixtures or caller-supplied read models without fetching live network by default or turning registry projections into Site authority.

## Required Work

1. Add optional providers that consume existing Site telemetry/Site Registry read models or fixture JSON instead of fetching live network by default.
2. Represent hosted registry freshness, relation lifecycle posture, publication edge posture, pending remote message posture, and capability/secret readiness as observation rows.
3. Include live-fetch mode only behind explicit flags and with bounded output.
4. Add tests using existing fixture data under docs/product or package fixtures.
5. Ensure projection rows do not become Site authority or capability grants.

## Execution Notes

- Added `buildSiteRegistryProjectionSection` and `buildSiteRegistryProjectionRows` to `packages/site-operational-dashboard/src/index.ts`.
- The provider consumes caller-supplied projection JSON/fixtures only; it does not fetch the network by default.
- Rows cover hosted registry freshness, relation lifecycle projection, publication edge posture, pending remote message posture, capability readiness projection, and live-fetch posture.
- Live-fetch posture appears only when `liveFetch.enabled` is supplied, and rows carry explicit bounded/projection authority limits.
- Rows include freshness/observed_at when available and mark missing projection data as `unknown` rather than ready.
- Added tests using `packages/site-registry-cloudflare/fixtures/relation-lifecycle-smoke.v0.json`.
- Tests cover fresh fixture posture, missing projection posture, stale projection posture, explicit live-fetch posture, projection-only authority limits, and raw secret marker exclusion.
- Updated README API notes for the optional Site Registry projection provider.

## Verification

- `pnpm --filter @narada2/site-operational-dashboard test` passed: 15 tests.
- `pnpm --filter @narada2/site-operational-dashboard typecheck` passed.
- `pnpm --filter @narada2/site-operational-dashboard build` passed.
- `git diff --check -- packages/site-operational-dashboard/src/index.ts packages/site-operational-dashboard/test/site-operational-dashboard.test.ts packages/site-operational-dashboard/README.md` passed.

## Acceptance Criteria

- [x] Projection providers can render registry/telemetry posture from fixtures.
- [x] Rows preserve projection-only authority limits.
- [x] Live fetch is explicit and bounded.
- [x] Tests cover missing/stale/fresh projection states.
