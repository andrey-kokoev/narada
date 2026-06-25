# @narada2/agent-web-ui

Browser operator surface for one NARS session.

This package is a client surface. It does not construct runtime dependencies, host MCP fabric, or execute provider turns. It attaches to a NARS event endpoint and health endpoint, subscribes with `session.events.subscribe`, renders session status plus the live event transcript, submits ordinary operator messages as `conversation.send` frames, and projects slash-command input into NARS protocol frames.

## Run

```bash
pnpm --filter @narada2/agent-web-ui start -- --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health
```

The command prints a local URL. Open that URL in a browser to observe and message the session.

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
- `session.close`

Health is read through `GET /api/health`, proxied by the local web UI server to the configured NARS `/health` endpoint. Runtime hosting, provider turn execution, and MCP hosting remain outside this package.
