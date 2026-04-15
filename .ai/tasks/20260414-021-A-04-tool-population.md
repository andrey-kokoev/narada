# Phase A Task — Tool Population in Envelopes

## Objective

Make `buildInvocationEnvelope` accept and pass a real tool catalog instead of `available_tools: []`.

## Changes

1. `packages/exchange-fs-sync/src/charter/envelope.ts`
   - Add `tools?: ToolCatalogEntry[]` to `BuildInvocationEnvelopeOptions`
   - Use `opts.tools ?? []` for `available_tools`

2. `packages/exchange-fs-sync-daemon/src/service.ts`
   - Define a minimal Phase-A tool catalog (e.g., `search_messages`)
   - Pass it into `buildInvocationEnvelope`

## Acceptance Criteria

- `buildInvocationEnvelope` populates `available_tools` when tools are provided
- `pnpm typecheck` passes in both packages
- Existing tests pass
