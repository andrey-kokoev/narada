# narada-proper.task-0040 - Create-site reusable package catalog integration

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- task source: Operator duty-loop continuation after reusable Site machinery extraction map coverage
- posture: Narada proper implementation task

## Goal

Make newly extracted reusable Site machinery descriptor packages selectable by greenfield `narada sites create` plans as Narada proper template/catalog components.

## Scope

- Add descriptor-only create-site catalog support for:
  - `@narada2/site-inbox`
  - `@narada2/site-config`
  - `@narada2/site-lift`
- Emit package-slice planned files for descriptor package selections.
- Emit separate local admission requirements for inbox substrate/publication, site-config probe execution, and Site-lift adoption materialization.
- Add CLI tests proving descriptor expansion and no live capability grant.

## Non-Goals

- No filesystem Site creation expansion beyond existing generic descriptor-slice materialization.
- No DB init, MCP registration, runtime hydration, capability grants, Windows profile mutation, or PC/operator-surface mutation.
- No source Site migration/lift/import path.
- No narada-andrey runtime DB/history/state import.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 14 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.

## Closeout

The greenfield create-site package catalog now recognizes the reusable Site machinery descriptor packages. Future Sites can select these packages in create-site configs and receive dry-run descriptor plans plus explicit separate-admission requirements, without treating package selection as live authority.
