# narada-proper.task-0051 - Create-site preset catalog live coherence

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper coherence task continuing the greenfield Site creation CLI objective

## Goal

Keep the read-only `narada sites create-presets` catalog coherent with the implemented live paths.

## Scope

- Update `create-presets` live command reporting for:
  - `agent-memory`
  - `task-lifecycle`
  - `site-machinery`
- Keep `minimal` with no live command.
- Add test assertions for the live command reports.

## Non-Goals

- No new carrier behavior.
- No Site creation.
- No source Site import/migration/lift.
- No private MCP client config, Windows profile, PC, or operator-surface mutation.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 22 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create-presets --format json`.

## Closeout

Preset discovery now reports all implemented live create-site paths accurately.
