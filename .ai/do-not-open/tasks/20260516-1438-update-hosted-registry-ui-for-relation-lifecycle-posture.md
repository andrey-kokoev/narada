---
status: confirmed
depends_on: [1432]
closed_at: 2026-05-16T23:38:50.566Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Update hosted registry UI for relation lifecycle posture

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Extend Site tiles to show relation lifecycle and visibility posture when projected, while keeping inactive Sites out of the default public grid.

## Context

The tile UI now has starter information slots. Relation lifecycle should become part of the projection vocabulary without turning the page into an admin console.

## Required Work

1. Add tile slots or compact badges for relation state and visibility when supplied by `/api/sites`.
2. Keep inactive hidden Sites absent from the default public grid.
3. Add empty/summary posture for zero active Sites.
4. Keep mutation actions out of the public UI.
5. Add tests for relation posture display and projection-only/no-token guarantees.

## Non-Goals

- Do not add admin buttons or destructive controls.
- Do not expose suppressed Site details publicly.
- Do not infer lifecycle state from health alone.

## Execution Notes

- Updated the hosted registry human page in `packages/site-registry-cloudflare/src/index.ts` to render compact relation lifecycle badges for relation state and visibility.
- Kept the tile data read-only: relation source and update posture are displayed as projection facts, with no admin buttons or mutation forms.
- Added a bounded zero-active-Site empty state explaining that withdrawn, retired, suppressed, or private relations are withheld from the public grid.
- Extended the page test in `packages/site-registry-cloudflare/test/worker-boundary.test.ts` to assert lifecycle posture copy and no-token/no-payload/no-mutation-control guarantees.
- Inactive hidden Site absence remains covered by the relation lifecycle read-model tests added in task 1436.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 47 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Tile UI can display relation state and visibility posture.
- [x] Inactive hidden Sites do not render in public tiles.
- [x] Zero-active-Site state is clear and bounded.
- [x] Tests preserve no-token/no-payload leakage guarantees.
