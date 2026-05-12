# narada-proper.task-0052 - Create-site terminal capability assessment

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper evidence task continuing the greenfield Site creation CLI objective
- source Site state imported: false

## Goal

Record the current terminal capability state for greenfield create-site after the implemented and trialed CLI increments through task-0051.

## Assessment

The first greenfield create-site path is terminal and claimable for target-local Site creation from Narada proper templates/catalog:

- read-only preset discovery;
- descriptor-only dry-run from config or shorthand;
- shorthand filesystem skeleton creation;
- admitted target-local live carriers for `task-lifecycle`, `agent-memory`, and `site-machinery` presets.

The implementation is not a Site-to-Site lift or migration path. It does not import source runtime state.

## Operational Commands

- `narada sites create-presets --format json`
- `narada sites create --dry-run --config <path> --format json`
- `narada sites create --preset <preset> --site-id <id> --root <path> --dry-run --format json`
- `narada sites create --preset <preset> --site-id <id> --root <path> --format json`
- `narada sites create --preset task-lifecycle --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`
- `narada sites create --preset agent-memory --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`
- `narada sites create --preset site-machinery --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`

## Non-Claims

- No source Site import, migration, or lift.
- No runtime DB, task, inbox, roster, checkpoint, operator-surface, PC, secret, credential, or identity-specific state import.
- No capability or secret grants.
- No private MCP client config mutation.
- No real Windows profile mutation outside target-root artifacts.
- No PC or operator-surface mutation.
- No site-inbox publication or task promotion.
- No site-config external probe, trust admission, or external target Site mutation.
- No site-lift file copy, package install, bootstrap execution, or catalog publication.
- No agent-context runtime hydration execution.

## Verification Evidence

Inherited from tasks 0046 through 0051:

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `node --test tools/site-init/site-live-carriers.test.mjs` passed.
- Built CLI smokes passed for preset discovery, descriptor dry-run, skeleton creation, task-lifecycle live, agent-memory live, and site-machinery live creation.

## Closeout

The next smallest implementation slice is not required to claim the current first create-site objective. Future slices should be separately admitted for external/private MCP client mutation, real Windows profile mutation, capability/secret grants, operator-surface or PC authority, source Site migration/lift, and richer post-creation runtime workflows.
