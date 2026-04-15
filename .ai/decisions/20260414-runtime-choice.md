# Runtime Decision — 2026-04-14

## Decision

Narada’s production charter runtime will be the **Codex/OpenAI-compatible API runner** (`CodexCharterRunner`) as the default.

## Rationale

- The repo already contains a fully implemented `CodexCharterRunner` in `packages/charters/src/runtime/runner.ts`, with 16 passing runtime tests.
- Wiring the existing API runner is the shortest path to Phase A exit (first real end-to-end mailbox-agent loop).
- The `CharterRunner` interface is already abstracted; a CLI or dual backend can be added later without architectural redesign.
- The daemon currently defaults to `MockCharterRunner`; replacing it with `CodexCharterRunner` requires only configuration and wiring changes, not new runtime engineering.

## What this means

- **Production default**: `CodexCharterRunner` invoked via OpenAI-compatible HTTP API.
- **Dev/test fallback**: `MockCharterRunner` remains available via explicit override or when no API key is configured.
- **Secrets surface**: `OPENAI_API_KEY` (or `NARADA_OPENAI_API_KEY`) via environment variable; optional model/base URL overrides via config.
- **Observability**: HTTP request/response logging at the adapter level; no new tracing infrastructure required for Phase A.
- **Tool integration**: Tools will be invoked in-process by the daemon (the API runner receives tool schemas; the daemon executes approved tool calls and returns results to the runner).

## Deferred options

- **Codex CLI runner**: Can be implemented later behind the same `CharterRunner` interface if local workspace execution becomes a requirement.
- **Dual runtime abstraction**: Not needed now. The interface already supports swapping implementations.
