# narada-proper.task-0044 - Create-site shorthand live-carrier orchestration proof

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Prove shorthand create-site invocation can create a task-lifecycle Site skeleton and run the admitted local live carriers in sequence.

## Scope

- Add test coverage for `preset: task-lifecycle` shorthand with `executeLive: true`.
- Verify carrier sequence:
  - `site_local_db_init`
  - `site_local_storage_hydration`
  - `site_mcp_registration_transport`
  - `windows_profile_site_binding`
- Smoke built CLI with `--preset task-lifecycle --execute-live --live-authority-basis`.
- Keep all smoke execution inside a temporary target root.

## Non-Goals

- No persistent operator Site creation in this task.
- No private MCP client config mutation.
- No real Windows profile mutation outside the target Site artifact.
- No package-owned SQLite dependency.
- No source Site import, migration, lift, DB/history/state import, secrets, PC-locus mutation, or operator-surface runtime mutation.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 19 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create --preset task-lifecycle --site-id smoke-live-task-site --root <temp-root> --execute-live --live-authority-basis smoke_receiving_site_live_authority --format json`.

## Closeout

The shorthand create-site CLI now has test and smoke evidence for task-lifecycle skeleton creation plus admitted local live-carrier orchestration. The smoke target was a temporary root and was removed after the run.
