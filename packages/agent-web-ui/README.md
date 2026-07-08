# @narada2/agent-web-ui

Browser operator surface for one NARS session.

This package is a client surface. It does not construct runtime dependencies, host MCP fabric, or execute provider turns. It attaches to a NARS event endpoint and health endpoint, subscribes with `session.events.subscribe`, renders session status plus the live event transcript, submits ordinary operator messages as `conversation.send` when idle and `conversation.enqueue` during active turns, and projects slash-command input into NARS protocol frames.

The shared slash-command model is documented in `docs/concepts/nars-client-projection-contract.md#operator-slash-command-projection`. This package owns browser palette rendering and local browser effects; it does not own the NARS command vocabulary or runtime command dispatch.

Message content keeps prose and operator affordances separate. Canonical renderable content parts are `text`, `markdown`, `code`, `artifact_ref`, and `intent_ref`. `intent_ref` is a structured action hint, not hidden prose, and the browser shell renders it as a clickable intent button that stages the intent token in the operator composer for explicit review and submission. The canonical builder for that shape lives in `buildNarsIntentRefPart` from `@narada2/nars-client-projection-contract`. For compatibility, markdown links that use the narrow `intent:` or `narada-intent:` scheme are rendered as the same button affordance inside markdown tables and paragraphs. This is a compatibility bridge, not the canonical content shape.

The browser shell is Vue 3 + Vite. Components are Narada-native and styled in the shadcn-vue spirit: small explicit primitives over Narada concepts such as NARS session status, projection verbosity, transcript rows, diagnostics, raw event details, and operator input. NARS protocol projection remains framework-neutral.

## Run

Target operator-grade attach UX should use NARS session discovery once exposed by the Narada CLI. These Narada CLI commands are not implemented in this package yet:

```bash
narada agent-web-ui
narada agent-web-ui --site sonar
```

Those commands discover active NARS sessions from the NARS-owned session index, health-check candidates, and attach this browser projection to the selected session.

The current low-level package primitive attaches to one known NARS event endpoint and health endpoint:

```bash
pnpm --filter @narada2/agent-web-ui start -- --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health
```

The command prints a local URL. Open that URL in a browser to observe and message the session.

The authoritative session discovery/index mechanics are documented in `docs/concepts/nars-runtime-contract.md` under `Session Discovery And Attachment Index`.

## Follow-Up Ledger

- Attach UX remains endpoint-driven in this package: it can bind to a known NARS event endpoint and health endpoint, but it still relies on launcher/session discovery outside this package.
- First-class browser session discovery and selection stays a launcher responsibility, so this package remains a peer projection rather than a session router.
- The Playwright browser E2E harness is now fixture-backed through `test/e2e/nars-runtime-fixture.mjs`; keep that helper tracked with the durable test tier rather than treating it as a probe artifact.
- Current browser builds still emit repeated Rolldown/@vueuse warning noise. Reduce it at the source when practical, or keep it explicitly ledgered until upstream output is cleaner.

## Cloudflare Projection Shell

The same built Vue shell can be served by `@narada2/cloudflare-nars-projection` as a Cloudflare Worker assets binding. Build the web UI first, then build/deploy the projection Worker:

```bash
pnpm --filter @narada2/agent-web-ui build
pnpm --filter @narada2/cloudflare-nars-projection build
```

The Worker `wrangler.toml` points at `../agent-web-ui/dist` and keeps NARS projection APIs under `/api/nars/projections/...`. Open the hosted shell with query configuration rather than a hardcoded local session:

```text
https://<projection-host>/?cloudflare_projection_id=<projection-id>&cloudflare_api_base_url=https://<projection-host>
```

## Code Organization

- `bin/narada-agent-web-ui.mjs` is only the CLI bootstrap.
- `src/server.js` owns the local static-file server and `/api/health` proxy.
- `src/main.ts` mounts the Vite-built Vue app.
- `src/app/App.vue` composes the Narada-native browser shell.
- `src/app/components/*` owns explicit UI primitives for status, transcript rows, diagnostics, and operator input.
- `src/app/composables/*` owns browser-side orchestration for connection, health, retention, verbosity, and input.
- `src/app/lib/*` owns projection, retention, and lazy raw-payload helpers.
- `src/protocol/*` owns framework-neutral NARS WebSocket framing and operator input protocol.
- `src/agent-web-ui.js`, `src/config.js`, `src/event-stream.js`, `src/health.js`, `src/input.js`, `src/render.js`, and `src/runtime-events.js` remain stable compatibility exports and source fallback helpers.
- `vite.config.mjs` builds the browser shell from `src/index.html`.

NARS exposes peer client attach commands for the same session event endpoint:

```bash
narada-agent-cli --attach ws://127.0.0.1:12345/events
agent-tui --attach ws://127.0.0.1:12345/events
narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health
```

The web UI is the browser projection: it uses the same NARS event protocol for operator input and a local HTTP proxy for ambient health status.

## Protocol Boundary

The web UI allowlist contains these NARS WebSocket methods:

- `session.events.subscribe`
- `conversation.send`
- `session.status`
- `session.health`
- `session.recovery`
- `session.operations`
- `observers.status`
- `observer.mute`
- `observer.unmute`
- `session.command.execute`
- `conversation.interrupt`
- `conversation.steer`
- `session.close`

There are two health surfaces by design:

- Browser status polling uses `GET /api/health`, proxied by the local web UI server to the configured NARS `/health` endpoint. This keeps routine status refresh out of the event WebSocket.
- Operator `/health` input is projected as the NARS `session.health` protocol method over the event WebSocket, matching other slash-command protocol frames.

Runtime hosting, provider turn execution, and MCP hosting remain outside this package.
