# narada-proper.task-0047 - Create-site agent-memory live carrier

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper implementation task continuing the greenfield Site creation CLI objective

## Goal

Add and prove a target-local agent-context-memory live carrier so `agent-memory` Sites can be created through the same easy CLI path as task-lifecycle Sites.

## Scope

- Add `agent_context_memory_local_storage` live carrier.
- Write target-local empty memory store and hydration policy artifacts.
- Refuse source runtime state import, checkpoint-truth handoff posture, and secret capture.
- Wire `narada sites create --preset agent-memory --execute-live` through the new carrier.
- Add carrier and create-site tests.
- Update live carrier docs and create-site capability docs.

## Non-Goals

- No package-owned SQLite dependency.
- No runtime hydration execution.
- No checkpoint history import.
- No source Site DB/history/state import.
- No secret persistence.
- No private MCP client config mutation.
- No real Windows profile mutation outside target Site artifacts.
- No PC/operator-surface mutation.

## Verification

- `node --test tools/site-init/site-live-carriers.test.mjs` passed, 7 tests.
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed, 21 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Built CLI smoke passed:
  `node packages/layers/cli/dist/main.js sites create --preset agent-memory --site-id smoke-agent-memory-site --root <temp-root> --execute-live --live-authority-basis smoke_agent_memory_live_authority --format json`.

## Closeout

The agent-memory preset now has a tested shorthand live-carrier path for target-local storage/policy artifacts. The smoke target was a temporary root and was removed after the run.
