# @narada-core/pc-site-surface-service

Authenticated loopback service that hosts explicitly admitted MCP surface
factories for one PC Site. It resolves every surface and tool contract from the
registrar-generated Site capability registry and delegates instance lifecycle
to `@narada-core/mcp-surface-runtime`.

The service does not decide tool admission. Callers must provide the exact
Carrier Action Admission decision, Site authority reference, carrier session,
and agent identity. A bearer token authenticates the local service crossing;
it does not authorize a tool effect.

Commands:

```text
narada-pc-site-surface-service serve --site-root <root>
narada-pc-site-surface-service ensure --site-root <root>
narada-pc-site-surface-service status --site-root <root>
narada-pc-site-surface-service stop --site-root <root>
narada-pc-site-surface-service replace-generation --site-root <root> --surface-id <id> --projection-id <id> --instance-id <id> --expected-generation-id <id> --request-id <id> --reason <text>
narada-pc-site-surface-service watchdog-install --site-root <root> --mcp-surfaces-root <root> [--node-path <node.exe>]
narada-pc-site-surface-service watchdog-status --site-root <root> --mcp-surfaces-root <root> [--node-path <node.exe>]
narada-pc-site-surface-service watchdog-remove --site-root <root> --mcp-surfaces-root <root> [--node-path <node.exe>]
```

`ensure` starts a hidden detached process when needed and is suitable for an
external Site supervisor/watchdog. The default endpoint is
`http://127.0.0.1:61741`. State, the bearer token, and logs live under
`<site-root>/.narada/runtime/mcp-surface-service`; the token is generated with
owner-only file permissions. Health is public and contains no token, while
status, invocation, session release, and shutdown require authentication.
One-shot commands exit explicitly after their awaited result so a scheduler
never mistakes a detached service child for a still-running watchdog action.

Callers release their carrier session explicitly when a gateway closes. The
service also evicts idle handles after a bounded interval (15 minutes by
default) so interrupted sessions cannot retain authority-shared instances
forever. Concurrent first calls for the same session share one acquisition.

Production posture uses an external hidden watchdog that periodically runs the
idempotent `ensure` command with a stable Node executable. The watchdog owns
availability only; the service continues to own authenticated transport and the
runtime continues to enforce admitted bindings and instance tenancy. The
install command atomically replaces the named current-user Scheduled Task,
starts it immediately, and is safe to repeat. `watchdog-status` compares the
installed action, arguments, hidden posture, and multiple-instance policy with
the canonical plan instead of treating task existence as sufficient.

When `--node-path` is omitted, an FNM multishell executable is resolved to the
matching stable `FNM_DIR/node-versions/<version>/installation/node.exe` path.
If no stable installation can be proven, watchdog planning refuses the
ephemeral path instead of registering a task that may disappear.

`replace-generation` is an authenticated control-plane actuator, not a carrier
tool and not an admission shortcut. The caller selects an existing instance
and names its expected active generation. The service rereads the authoritative
Site registry, permits only `surface_factory` projections that explicitly opt
into `generation_swap`, loads only that registry entrypoint, and delegates
health, tool-contract, compatibility, drain, and old-generation disposal to the
runtime engine. A refusal or candidate failure leaves the old generation
authoritative. Successful compatible replacement does not restart carrier
sessions. Replacement outcomes are visible in authenticated status and are
appended to
`<site-root>/.narada/runtime/mcp-surface-service/events.jsonl`.

Rollout is projection-by-projection. A factory binding fails closed when this
service is unavailable; it never silently starts a per-session child. Rollback
means selecting that surface's retained `stdio` projection, rematerializing the
Site fabric, and then stopping this service if no factory projections remain.

The opt-in live acceptance suite installs the watchdog posture, starts the
service, opens two real NARS sessions, proves authority-shared reuse and
cross-authority refusal, replaces a compatible generation without restarting
either session, refuses a stale replacement, exercises the real stdio rollback
and factory restore, stops the service, and proves watchdog recovery:

```powershell
$env:NARADA_PC_SITE_ROOT = '<PC Site root>'
$env:NARADA_MCP_SURFACES_WORKSPACE_ROOT = '<mcp-surfaces workspace>'
$env:NARADA_PC_SITE_SURFACE_SERVICE_NODE_PATH = '<stable Node 22 executable>'
pnpm --filter @narada-core/pc-site-surface-service test:live:e2e
```

## Runtime posture

Build, typecheck, and the pure service tests are Bun-first; the `*:node`
variants retain Node compatibility. The live acceptance path remains explicitly
Node-based because its watchdog contract requires a stable Node executable and
an external MCP Surfaces workspace. It is not a reason to abstract the
authenticated loopback service away from its existing domain boundary.
