.ai/do-not-open/tasks/20260414-021-execute-phase-a-make-it-real.md

# Execute Phase A — Make It Real

## Status: ✅ COMPLETE

## Parent Spec

.ai/do-not-open/tasks/20260414-020-control-plane-v2-to-production-mailbox-agent-gap-closure-plan.md

## Scope

Execute **Phase A — Make It Real** only.

Do not implement Phase B or Phase C work.

## Step 0 — Resolve Runtime Decision

✅ **Completed**: Codex/OpenAI-compatible API runner chosen as production default.

Decision documented at: `.ai/decisions/20260414-runtime-choice.md`

## Step 1 — Decompose Phase A

Phase A was decomposed into 5 implementation tasks:

- `.ai/do-not-open/tasks/20260414-021-A-02-config-secrets.md`
- `.ai/do-not-open/tasks/20260414-021-A-03-daemon-runtime-wiring.md`
- `.ai/do-not-open/tasks/20260414-021-A-04-tool-population.md`
- `.ai/do-not-open/tasks/20260414-021-A-05-tool-execution-integration.md`
- `.ai/do-not-open/tasks/20260414-021-A-06-e2e-daemon-test.md`

## Step 2 — Execute Tasks Sequentially

### Task A-02: Config + Secrets Surface
- Added `CharterRuntimeConfig` to `ExchangeFsSyncConfig` in `packages/exchange-fs-sync/src/config/types.ts`
- Added defaults (`runtime: "mock"`) in `packages/exchange-fs-sync/src/config/defaults.ts`
- Added parsing and validation in `packages/exchange-fs-sync/src/config/load.ts`
- Added `loadCharterEnv()` in `packages/exchange-fs-sync/src/config/env.ts` for `OPENAI_API_KEY` / `NARADA_OPENAI_API_KEY`
- Updated `config.example.json`
- Fixed existing config loader test to account for new `charter` field

### Task A-03: Daemon Runtime Wiring
- Added `@narada/charters` as a dependency of `exchange-fs-sync-daemon`
- Exported `loadCharterEnv` from `packages/exchange-fs-sync/src/index.ts`
- Modified `packages/exchange-fs-sync-daemon/src/service.ts` to instantiate `CodexCharterRunner` when `config.charter.runtime === 'codex-api'` and an API key is available
- Falls back to `MockCharterRunner` for dev/test or missing configuration
- Added best-effort trace persistence hook

### Task A-04: Tool Population
- Added optional `tools?: ToolCatalogEntry[]` to `BuildInvocationEnvelopeOptions`
- Modified `buildInvocationEnvelope` to use provided tools catalog
- Defined a minimal Phase-A tool catalog (`echo_test`) in the daemon
- Added `normalizeMessageForEnvelope` helper to map `exchange-fs-sync` message shapes to the stricter schema expected by `charters`

### Task A-05: Tool Execution Integration
- Wired `ToolRunner` into the daemon dispatch loop
- After charter evaluation, any `tool_requests` are executed against the Phase-A tool definitions
- Tool call records are persisted via `coordinatorStore.insertToolCallRecord`
- Execution outcomes are logged

### Task A-06: End-to-End Daemon Integration Test
- Created `packages/exchange-fs-sync-daemon/test/integration/dispatch-real.test.ts`
- Mocks `global.fetch` to simulate Codex API responses without network access
- Configures daemon with `charter.runtime: "codex-api"`
- Verifies full flow: sync → work item opened → lease acquired → real charter evaluation → foreman resolution → outbound command created

## Step 3 — End-to-End Proof

✅ The integration test `dispatch-real.test.ts` proves:

> sync → work item → lease → real charter runtime → evaluation → outbound_command

## Verification

- `pnpm build` — passes across all 5 workspace packages
- `pnpm typecheck` — passes across all 5 workspace packages
- `pnpm test` (daemon) — 21 tests passing, including the new real-runtime E2E test
- `pnpm test` (exchange-fs-sync) — all unit and integration tests passing (segfault at suite exit is known `better-sqlite3` artifact)
- `pnpm test` (charters) — 64 tests passing
- `pnpm test` (cli) — 15 tests passing

## Constraints Honored

- No architecture redesign
- No Phase B/C concerns introduced
- No new global abstractions beyond what was required
- Traces treated as soft commentary, not correctness state
