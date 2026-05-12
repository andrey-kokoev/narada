# narada-proper.task-0048 - Create-site site-inbox live carrier

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Add and prove a target-local Canonical Inbox substrate carrier for the `site-machinery` create-site preset.

## Scope

- Add `site_inbox_local_substrate` live carrier.
- Write target-local empty inbox index and publication policy artifacts.
- Refuse source runtime/inbox state import and checkpoint-truth handoff posture.
- Wire `narada sites create --preset site-machinery --execute-live` through the new carrier.
- Add carrier and create-site tests.
- Update live carrier docs and create-site capability docs.

## Non-Goals

- No source inbox history import.
- No portable envelope file write.
- No task promotion.
- No Git publication.
- No live MCP registration for site-inbox.
- No private MCP client config mutation.
- No real Windows profile mutation outside target Site artifacts.
- No PC/operator-surface mutation.

## Verification

- `node --test tools/site-init/site-live-carriers.test.mjs` passed, 8 tests.
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 22 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create --preset site-machinery --site-id smoke-site-machinery-live --root <temp-root> --execute-live --live-authority-basis smoke_site_machinery_live_authority --format json`.

## Closeout

The site-machinery preset now has a tested target-local inbox substrate live-carrier path. The smoke target was a temporary root and was removed after the run.
