# AGENTS.md - @narada2/agent-web-ui

The production Agent Web UI browser surface for one NARS session. The Narada CLI resolves `@narada2/agent-web-ui/server` for local and Cloudflare projection launch.

Package metadata in `package.json` (`narada` block) is authoritative for role and admission: `package_role: production_web_ui`, `production_admission: allowed`.

For kernel and workspace rules, read the parent authorities first:

- `../../AGENTS.md` (narada-root) — invariants, verification ladder, task contract
- `../../docs/concepts/nars-runtime-contract.md`

## Package Role

It owns:

- browser session transport (local NARS and Cloudflare projection);
- session store and projection for browser rendering;
- Vue operator surface rendering;
- browser operator input projection (delivery phase, retry, reconnect reconciliation).

It does not own:

- runtime dependency construction, provider turn execution, MCP fabric hosting, slash command execution;
- session state, event ordering, health, authority, or command admission — NARS owns those. The UI never becomes hidden authority: every operator effect crosses NARS admission.

Protocol method shapes come from `@narada2/nars-client-projection-contract`; do not redefine them locally.

## Layout

- `src/server.ts` — server entry resolved by the Narada CLI (`@narada2/agent-web-ui/server`).
- `src/protocol/` — transports (`localSessionTransport.ts`, `cloudflareSessionTransport.ts`, `sessionTransportAdapters.ts`), `narsClient.ts`, operator input framing/lifecycle.
- `src/session-projection*.ts`, `src/event-stream.ts`, `src/runtime-events.ts` — session store and projection.
- `classifyRuntimeMessage()` in `session-projection.ts` separates `operation_fact` evidence (control, request-state, input lifecycle) from `conversation_fact`; `session-projection-boundaries.ts` merges assistant-message streaming boundaries.
- `src/app/` — Vue 3 surface: `components/`, `composables/`, `lib/` (including `browserPreferences.ts`), `panel-registry.ts`.
- `bin/narada-agent-web-ui.mjs` — CLI shim.
- `test/` — node:test suites at top level, `*.unit.test.ts` (Vitest), `e2e/` (Playwright), `fixtures/`, live-smoke drivers.

## Boundary Rules

- A browser-local WebSocket write is only a transport attempt, not an acknowledgment. The durable phase begins at NARS admission (`input_event_queued` or control acceptance); turn start and terminal events are projected from durable NARS evidence.
- Reconnect/reload reconcile pending input from durable session events. The UI never resends automatically after a timeout; the operator chooses Retry, and a retry keeps the original `idempotency_key`.
- A local socket failure surfaces as `websocket_error`, distinct from durable admission.
- Terminal `runtime_request_state_transition` states (`completed`, `failed`, `rejected`, `interrupted`) count as acknowledgment evidence for pending-input reconciliation; request transitions must flow through both replay and live transport.
- Browser-local preferences live in `src/app/lib/browserPreferences.ts` and affect presentation only — never session authority, durable event state, or protocol input. Provider/model/thinking changes are NARS session actions and are deliberately not persisted as preferences.
- Keep the conversation projection free of control/operations rows; classification happens in `classifyRuntimeMessage()` (`session-projection.ts`), not in components.
- Observation panels are read-only projections; mutations go through NARS-admitted inputs, never direct store writes from UI code.

## Verification

Default bounded checks (node:test + Vitest, typecheck, build):

```text
pnpm --filter @narada2/agent-web-ui test
pnpm --filter @narada2/agent-web-ui typecheck
pnpm --filter @narada2/agent-web-ui build
```

Escalation:

- `test:e2e` / `test:projection` — explicit Playwright browser suites; they build first and are not part of the default test command.
- `test:live:*` / `test:browser:cdp` — explicit live-smoke suites requiring an operator-supplied runtime or projection. `test:live:delegated-task` is the controlled L5 launcher proof (from repo root: `pnpm test:agent-web-ui:live:delegated-task`).

Test ownership map: `agent-web-ui-projection.test.mjs` (event/session projection), `agent-web-ui-protocol.test.mjs` (protocol framing and attachment boundaries), `agent-web-ui.test.mjs` (preferences, feature seams, package wiring, bounded UI contracts).

Build produces the launch artifact in `dist/` (`index.html` + `assets/**`); `postbuild` writes the launch-artifact record via `../layers/cli/scripts/write-launch-artifact.mjs`. `prebuild`/`pretest` build `@narada2/ui` and `@narada2/cloudflare-nars-projection` first — a bare `vite build` or test run without them is not the canonical path.
