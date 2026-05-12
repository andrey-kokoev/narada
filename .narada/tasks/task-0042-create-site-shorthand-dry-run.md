# narada-proper.task-0042 - Create-site shorthand dry-run flags

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Allow agents to produce descriptor-only create-site dry-run plans without hand-writing a config file for common presets.

## Scope

- Add `narada sites create --preset <preset> --site-id <id> --root <path> --dry-run --format json` support.
- Preserve existing `--config <path>` behavior.
- Support shorthand expansion for `minimal`, `agent-memory`, `task-lifecycle`, and `site-machinery`.
- Keep package selection descriptor-only and preserve separate local admission boundaries.
- Add tests for shorthand success and missing-coordinate refusal.

## Non-Goals

- No source Site import/migration/lift path.
- No implicit live filesystem creation, DB init, MCP registration, runtime hydration, capability grants, Windows profile mutation, PC-locus mutation, or operator-surface runtime mutation.
- No arbitrary package selection outside the Narada proper template catalog.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 16 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.

## Closeout

Agents can now request an inline descriptor plan from the CLI for common greenfield presets. The plan still records `source_state_imported: false` and `package_selection_grants_live_capability: false`.
