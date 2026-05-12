# narada-proper.task-0049 - Create-site site-config live carrier

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Add and prove a target-local Site config registry/probe-policy carrier for the `site-machinery` create-site preset.

## Scope

- Add `site_config_local_registry` live carrier.
- Write target-local empty known-Site registry and probe policy artifacts.
- Refuse source runtime state import and arbitrary external root scans.
- Wire `narada sites create --preset site-machinery --execute-live` through the new carrier.
- Add carrier and create-site tests.
- Update live carrier docs and create-site capability docs.

## Non-Goals

- No external root scan.
- No registered Site probe execution.
- No trust record admission.
- No target Site config write.
- No target task/inbox DB import.
- No private MCP client config mutation.
- No real Windows profile mutation outside target Site artifacts.
- No PC/operator-surface mutation.

## Verification

- `node --test tools/site-init/site-live-carriers.test.mjs` passed, 9 tests.
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 22 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create --preset site-machinery --site-id smoke-site-config-live --root <temp-root> --execute-live --live-authority-basis smoke_site_config_live_authority --format json`.

## Closeout

The site-machinery preset now has tested target-local inbox and site-config live-carrier paths. The smoke target was a temporary root and was removed after the run.
