# narada-proper.task-0043 - Create-site shorthand skeleton execution proof

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Prove shorthand `narada sites create` can execute the existing minimal Site skeleton and descriptor package-slice materialization path without a config file.

## Scope

- Add tests for shorthand minimal Site skeleton creation.
- Add tests for shorthand `site-machinery` descriptor package-slice materialization.
- Smoke the built CLI against a temporary target root.
- Preserve no-import and descriptor-only boundaries for package selections.

## Non-Goals

- No persistent Site created under a real operator target.
- No DB init, DB mutation, MCP registration, runtime hydration, capability grant, Windows profile mutation, PC-locus mutation, operator-surface mutation, source Site import, migration, or lift execution.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 18 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create --preset site-machinery --site-id smoke-created-site --root <temp-root> --format json`.

## Closeout

The shorthand create-site CLI now has test and smoke evidence for descriptor-only filesystem skeleton/materialization execution. The smoke target was a temporary root and was removed after the run.
