# narada-proper.task-0050 - Create-site site-lift live carrier

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Add and prove a target-local Site-lift adoption/materialization-policy carrier for the `site-machinery` create-site preset.

## Scope

- Add `site_lift_local_adoption` live carrier.
- Write target-local empty adoption catalog and materialization policy artifacts.
- Refuse source runtime state import, file copy, and package install requests.
- Wire `narada sites create --preset site-machinery --execute-live` through the new carrier.
- Add carrier and create-site tests.
- Update live carrier docs and create-site capability docs.

## Non-Goals

- No file copy/install/bootstrap.
- No source runtime import.
- No MCP registration mutation for Site-lift.
- No catalog publication.
- No receiving Site mutation beyond target-local empty policy/catalog artifacts.
- No private MCP client config mutation.
- No real Windows profile mutation outside target Site artifacts.
- No PC/operator-surface mutation.

## Verification

- `node --test tools/site-init/site-live-carriers.test.mjs` passed, 10 tests.
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 22 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create --preset site-machinery --site-id smoke-site-lift-live --root <temp-root> --execute-live --live-authority-basis smoke_site_lift_live_authority --format json`.

## Closeout

The site-machinery preset now has tested target-local inbox, site-config, and Site-lift live-carrier paths. The smoke target was a temporary root and was removed after the run.
