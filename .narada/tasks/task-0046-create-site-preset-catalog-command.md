# narada-proper.task-0046 - Create-site preset catalog command

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Expose supported greenfield create-site presets through a read-only CLI catalog command so agents do not need to infer preset support from docs or source.

## Scope

- Add `sitesCreatePresetsCommand`.
- Register `narada sites create-presets --format json`.
- Include preset ids, template ids, package components, descriptor components, operational command examples, and admission boundaries.
- Add tests and documentation.

## Non-Goals

- No Site creation.
- No source Site import/migration/lift.
- No capability grants, private MCP client mutation, real Windows profile mutation, PC-locus mutation, or operator-surface runtime mutation.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 20 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create-presets --format json`.

## Closeout

`narada sites create-presets --format json` now reports the create-site preset catalog as a read-only surface.
