# @narada-core/operator-console-mirror-runtime

Owns the process lifecycle for the local Operator Console Cloudflare mirror.

The runtime starts the authenticated loopback gateway and a hidden
`cloudflared tunnel run` or Wrangler `tunnel run` child. It writes a bounded
state document, probes the local `cloudflared` diagnostics endpoint for raw
cloudflared runs, and refuses to call the mirror ready until both the gateway
and the owned tunnel control process are healthy.

The tunnel token is accepted through `TUNNEL_TOKEN` or a token file. It is
never placed in a child command line or the durable state document. A named
locally-managed tunnel may instead use `NARADA_CLOUDFLARE_TUNNEL_NAME` and an
optional `NARADA_CLOUDFLARE_CONFIG` path.

The bridge token is accepted through `NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN`,
`--bridge-token-file`, or `NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN_FILE`. When no
explicit file is supplied, the runtime reads the user-local
`<mirror-state-root>/bridge-token` file. The token value is passed only through
the child environment and is never written to the state document. The state
document records the file path so a later `restart` or `rotate` can recover the
credential from a fresh shell.

The runtime serializes `start`, `restart`, `rotate`, and `stop` with a
heartbeat-backed `<mirror-state-root>/mirror.lock`. A competing lifecycle
request waits for the bounded lock timeout and then returns
`operator_console_mirror_lock_timeout`; it cannot race the state-file writer.
Startup waits for the persisted owner state to become `ready` before returning
success. A transient `starting` health projection is not reported as a
completed degraded start.

The last persisted state also supplies non-secret restart defaults for the
named tunnel and public origin when the current invocation does not specify
them. This keeps a fresh-shell restart aligned with the mirror that was
previously started.

The runtime does not create Cloudflare tunnels, mutate Worker deployments, or
manage Cloudflare Access. Those remain deployment authority. A named tunnel
uses Wrangler by default when no local `cloudflared` configuration is supplied;
set `NARADA_CLOUDFLARE_TUNNEL_RUNNER=cloudflared` to force the local-config
path. `restart` is the explicit credential-rotation operation: it tears down
the owned mirror host and starts it again using the currently configured
credentials.
