# narada-proper.task-0041 - Create-site site-machinery preset

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation objective

## Goal

Expose the reusable Site machinery descriptor package set through a named greenfield create-site preset and fixture.

## Scope

- Add `site-machinery` to descriptor-only create-site supported presets.
- Add `docs/product/fixtures/create-site-options/create-site-site-machinery.json`.
- Update create-site options documentation with the preset, fixture, and Windows PowerShell example.
- Exercise the preset through the existing `sitesCreateCommand` test surface.

## Non-Goals

- No source Site input to normal create-site.
- No Site-lift/migration/import execution.
- No live inbox DB mutation, site-config probe execution, Site-lift materialization, MCP registration, storage adapter admission, runtime hydration, capability grants, Windows profile mutation, PC-locus mutation, or operator-surface runtime mutation.

## Verification

- `Get-Content -Raw docs\product\fixtures\create-site-options\create-site-site-machinery.json | ConvertFrom-Json | Out-Null` passed.
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 14 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.

## Closeout

The `site-machinery` preset is now a greenfield Narada proper template/catalog option for descriptor-only Canonical Inbox, Site config awareness, and Site-lift/adoption contracts.
