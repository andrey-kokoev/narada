# @narada2/agent-web-ui

Browser operator surface for one NARS session.

This package is a client surface. It does not construct runtime dependencies, host MCP fabric, or execute provider turns. It attaches to a NARS event endpoint and health endpoint, subscribes with `session.events.subscribe`, renders session status plus the live event transcript, submits ordinary operator messages as `conversation.send` when idle and `conversation.enqueue` during active turns, and projects slash-command input into NARS protocol frames.

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
- `carrier.command.execute`
- `conversation.interrupt`
- `conversation.steer`
- `session.close`

There are two health surfaces by design:

- Browser status polling uses `GET /api/health`, proxied by the local web UI server to the configured NARS `/health` endpoint. This keeps routine status refresh out of the event WebSocket.
- Operator `/health` input is projected as the NARS `session.health` protocol method over the event WebSocket, matching other slash-command protocol frames.

Runtime hosting, provider turn execution, and MCP hosting remain outside this package.
