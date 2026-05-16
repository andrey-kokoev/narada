---
status: confirmed
depends_on: [1432]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:35:07.553Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by relation-aware public read derivation, implicit known-site active/public reconciliation, D1 active/public filtering, tile relation posture fields, withdrawal/suppression/retirement tests, retained projection evidence test, package tests, and build.
closed_at: 2026-05-16T23:35:21.749Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Filter public Site Registry read model by relation lifecycle

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Make `/api/sites`, `/api/freshness`, and the tile UI count only active visible relations by default.

## Context

Withdrawn, retired, or suppressed Sites should stop appearing as active expected tiles, while provenance remains available to authorized future surfaces.

## Required Work

1. Update read-model derivation so known configured Sites are converted or reconciled into active visible relation state.
2. Filter public `/api/sites` and `/api/freshness` to active visible relations by default.
3. Keep withdrawn/retired/suppressed Sites out of public counts unless an explicit non-public route is later added.
4. Update tile UI to reflect relation lifecycle fields when projected.
5. Add tests proving withdrawal removes a Site from public counts without deleting event/projection history.

## Non-Goals

- Do not add admin history UI.
- Do not delete KV/D1 event history.
- Do not infer relation authority from stale telemetry alone.

## Execution Notes

- Added relation-aware public read derivation in `packages/site-registry-cloudflare/src/index.ts`.
- Known configured Sites now project as implicit active/public relations when no D1 relation row exists, preserving the existing registry bootstrap behavior.
- Explicit D1 lifecycle rows for `publishes_to` relations now govern public visibility: only `state=active` and `visibility=public` appear in `/api/sites`, `/api/freshness`, and the tile UI.
- Added relation metadata (`state`, `visibility`, `source`) to public Site summaries so tiles have a starter lifecycle posture surface.
- Kept per-Site projection history readable through the protected projection route even after public withdrawal.
- Extended the Worker boundary fake D1 and tests for withdrawal, suppressed relations, retired relations, and retained projection evidence.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 45 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- A withdrawal fixture removes `site-a` from public `/api/sites` and `/api/freshness` while protected `/api/projections/site-a` still returns retained projection evidence.
- A suppressed/retired fixture proves those relation states are absent from public tiles and counts.

## Acceptance Criteria

- [x] Public read APIs count only active visible relations.
- [x] Withdrawn/retired/suppressed Sites are absent from public tiles.
- [x] Historical event/projection evidence remains retained.
- [x] Tests cover public filtering and provenance retention.
