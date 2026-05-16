---
status: confirmed
depends_on: [1432]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:37:34.528Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by non-secret relation lifecycle fixture payloads, local fake KV/D1 smoke coverage for active-to-withdrawn filtering, suppression and invalid/unauthorized refusal tests, README live mutation gate documentation, smoke fixture pass, full package test pass, and build pass.
closed_at: 2026-05-16T23:37:40.813Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add lifecycle fixture and smoke proof for relation withdrawal

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Provide a deterministic local and live-safe smoke fixture that proves relation withdrawal behavior end to end.

## Context

The relation lifecycle should be provable without destructive live behavior or raw secrets. A fixture should show active Site counted, withdrawal accepted, and Site removed from public projection.

## Required Work

1. Add fixture payloads for active relation, Site-originated withdrawal, registry-owner suppression, and invalid transition refusal.
2. Extend the smoke fixture or test harness to run relation transition flow against fake D1/KV.
3. Ensure live smoke can verify route shape and refusal posture without mutating production unless explicitly gated.
4. Record expected before/after public summary results.
5. Document residual live verification requirements.

## Non-Goals

- Do not run destructive production withdrawal by default.
- Do not require raw secrets in fixture files.
- Do not create real external Site relations.

## Execution Notes

- Added `packages/site-registry-cloudflare/fixtures/relation-lifecycle-smoke.v0.json` with non-secret payloads for active relation activation, Site-originated withdrawal, registry-owner suppression, invalid purge refusal, and expected public summaries.
- Extended `packages/site-registry-cloudflare/test/smoke-fixture.test.ts` with fake D1 relation tables/events so the smoke fixture exercises the Worker transition API locally.
- Proved the local flow: health event published, active relation counted, withdrawal accepted, public Site list becomes empty, and protected projection evidence remains readable.
- Added fixture coverage for suppression, invalid transition refusal, and unauthorized transition refusal without echoing token values.
- Documented in `packages/site-registry-cloudflare/README.md` that live relation mutation is gated by `NARADA_SITE_REGISTRY_LIVE_RELATION_MUTATION=1`; default live smoke remains route-shape/refusal-only.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare smoke:fixture` passed: 1 file, 3 tests.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 47 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Relation lifecycle fixtures exist.
- [x] Local smoke proves active-to-withdrawn filtering behavior.
- [x] Invalid and unauthorized transition fixtures are covered.
- [x] Live mutation remains explicitly gated.
