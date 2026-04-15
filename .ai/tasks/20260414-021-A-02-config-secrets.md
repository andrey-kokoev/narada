# Phase A Task — Config and Secrets Surface

## Objective

Add charter runtime configuration to the `exchange-fs-sync` config schema, loader, and environment variable support.

## Changes

1. `packages/exchange-fs-sync/src/config/types.ts`
   - Add `charter?: { runtime: 'mock' | 'codex-api'; api_key?: string; model?: string; base_url?: string; timeout_ms?: number; }` to `ExchangeFsSyncConfig`

2. `packages/exchange-fs-sync/src/config/defaults.ts`
   - Add default `charter` block: `runtime: 'mock'`

3. `packages/exchange-fs-sync/src/config/load.ts`
   - Parse optional `charter` object from config JSON
   - Validate `runtime` is one of allowed values
   - Apply defaults for missing fields

4. `packages/exchange-fs-sync/src/config/env.ts`
   - Add `loadCharterEnv()` returning `{ openai_api_key?: string }`
   - Read `OPENAI_API_KEY` and `NARADA_OPENAI_API_KEY`

5. `packages/exchange-fs-sync/config.example.json`
   - Add example `charter` section

## Acceptance Criteria

- `loadConfig()` returns a config with `charter.runtime` present
- Missing `charter` in config JSON defaults to `runtime: 'mock'`
- `pnpm typecheck` passes in `exchange-fs-sync`
