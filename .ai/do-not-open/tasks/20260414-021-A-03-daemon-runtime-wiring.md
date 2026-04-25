# Phase A Task — Daemon Runtime Wiring

## Objective

Wire the chosen real charter runtime (`CodexCharterRunner`) into the daemon dispatch path.

## Changes

1. `packages/exchange-fs-sync-daemon/package.json`
   - Add `"@narada/charters": "workspace:*"` to `dependencies`

2. `packages/exchange-fs-sync-daemon/src/service.ts`
   - Import `CodexCharterRunner` from `@narada/charters`
   - In `initDispatchDeps`, instantiate `CodexCharterRunner` when `config.charter?.runtime === 'codex-api'` and an API key is available
   - Fall back to `MockCharterRunner` when `runtime === 'mock'` or no API key is configured
   - Pass config-driven `apiKey`, `model`, `baseUrl`, `timeoutMs` to `CodexCharterRunner`
   - Wire `persistEvaluation` and `persistTrace` hooks to write into `coordinatorStore`

3. Run `pnpm install` to update lockfile.

## Acceptance Criteria

- `pnpm typecheck` passes in `exchange-fs-sync-daemon`
- Daemon can be instantiated with `charterRunner` override or with config-driven `CodexCharterRunner`
- Existing daemon tests still pass
