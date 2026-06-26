# @narada2/agent-web-ui

Browser operator surface for one NARS session.

This package is a client surface. It does not construct runtime dependencies, host MCP fabric, or execute provider turns. It attaches to a NARS event endpoint and health endpoint, subscribes with `session.events.subscribe`, renders session status plus the live event transcript, submits ordinary operator messages as `conversation.send` frames, and projects slash-command input into NARS protocol frames.

## Run

```bash
pnpm --filter @narada2/agent-web-ui start -- --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health
```

The command prints a local URL. Open that URL in a browser to observe and message the session.

## Code Organization

- `bin/narada-agent-web-ui.mjs` is only the CLI bootstrap.
- `src/server.js` owns the local static-file server and `/api/health` proxy.
- `src/agent-web-ui.js` is the browser composition entrypoint and stable package export.
- `src/config.js`, `src/event-stream.js`, `src/health.js`, `src/input.js`, `src/render.js`, and `src/runtime-events.js` own focused browser projection concerns.

## Attach Commands

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
