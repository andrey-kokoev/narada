# Operator Console Cloudflare Mirror Target

## Status

This document defines the implementation target for a complete Cloudflare-hosted
projection of the host-local Narada Operator Console.

The local crossing gateway, Cloudflare Worker proxy, Access JWT admission,
route-parity inventory, leased workspace proxying, session WebSocket bridging,
and governed local tunnel lifecycle are implemented. The committed live-E2E
contract covers the primary browser journey, complete route parity, disposable
Site Registry mutation, live session delivery, artifact digest validation, and
explicit stale-lease and tunnel-loss profiles. This document does not treat a
successful page render or a single dry-run as proof of those properties.

The committed live acceptance contract covers:

- Access admission: unauthenticated requests are redirected to the configured
  Access application;
- local mirror status: gateway healthy and named tunnel connected;
- exact shared Operator Console artifact for the entry, agent, registry,
  registry add/manage, launch, onboarding, and session pages;
- complete route-directory equality with the local Console, ignoring only the
  generated timestamp and recording matching contract digests;
- authenticated registry plan forwarding with `mutation_performed: false`;
- an authenticated disposable Site Registry add, edit, retire, and purge
  journey driven through the browser UI, with plan/apply separation, revision
  checks, exact purge confirmation, readback, and final absence verification;
- an authenticated session artifact whose browser metadata page is readable and
  whose content response matches the supplied fixture SHA-256;
- an authenticated disposable session page and WebSocket event through the
  Worker, including typed refusal after route revocation and successful exact
  route restoration;
- an authenticated disposable session route that becomes explicitly refused
  after its Router lease expires and is pruned;
- a disposable Site Operations lease that becomes a concrete remote route and
  renders the Site Operations page through the Worker, then is removed during
  teardown;
- a live gateway health projection that reports the VPC Service HTTP transport
  and the VPC Network TCP WebSocket transport independently;
- a live tunnel-loss recovery check in which the authenticated Worker returned
  HTTP 503 with `operator_console_gateway_unavailable` after the owned mirror
  stopped, then returned HTTP 200 after the mirror restarted; the evidence
  contains no credential values;
- local response preservation for the admitted legacy Console observation and
  document routes, with host-local filesystem and network metadata redacted at
  the remote JSON boundary while declared response shapes remain stable.

At the live verification time, the local route directory marked Site
Operations as `planned` and artifacts as `available`, but exposed no
persistent concrete session/artifact lease for a live journey. The Cloudflare
mirror preserves that state; it must not fabricate a remote page or guess a
session identity. The disposable live acceptance registers a real temporary
Router lease only for the test, then revokes it and removes it during teardown.

The mirror is a second projection of the same Operator Console contracts. It is
not a second authority, a public tunnel to an ungoverned loopback server, or a
Cloudflare-owned reinterpretation of Site, agent, session, artifact, or task
state.

## Target Outcome

An authenticated operator can use the Cloudflare URL for every workflow exposed
by the local Operator Console:

- Sites and Agents;
- Site Registry list, add, and manage;
- Site Runtime launch and session recovery;
- First Use;
- Agent Sessions;
- Site Operations;
- Agent Web UI sessions;
- session artifacts;
- the workspace route directory and health projections.

The Cloudflare browser uses the same `@narada-core/operator-console-ui` build and
the same `@narada-core/operator-console-contract` schemas as the local console.
Local Narada remains the authority for host-local reads and every host-local
mutation.

## Topology

```text
remote browser
  -> Cloudflare Access
  -> Cloudflare NARS Workspace Worker
       static Operator Console assets
       workspace route directory
       browser request admission
  -> governed Cloudflare Tunnel
  -> local Operator Console projection gateway
       bridge credential verification
       route and method allowlist
       request/response bounds
       audit and health
  -> stable local Operator Router
  -> local Operator Console and leased session/artifact projections
```

The tunnel terminates at the projection gateway, not at the raw Operator
Router. The gateway is the local crossing boundary.

## Canonical Contracts

The mirror MUST:

1. Serve the exact built Operator Console UI artifact used locally.
2. Project the same `narada.operator_workspace.route_directory.v3` document.
3. Preserve HTTP method, path, query, status, and bounded response semantics for
   admitted Operator Console APIs.
4. Preserve route ownership, authority host, projection owner, intent binding,
   and availability fields.
5. Return typed refusals for unavailable local authority, expired route leases,
   unsupported methods, oversized bodies, and failed identity or bridge checks.
6. Keep browser credentials, bridge credentials, tunnel credentials, and local
   authority credentials separate.

## Request Admission

Cloudflare Access authenticates the browser. The Worker maps the authenticated
principal to an explicit Operator Console remote-access policy.

The Worker forwards only paths represented by the current projection-scoped
route directory. The local gateway independently enforces a package-owned
allowlist:

- `GET`, `HEAD`, and `OPTIONS` for projected observation and document routes;
- `POST` only for explicitly declared Operator Console intent endpoints;
- no arbitrary host paths;
- no raw filesystem paths;
- no arbitrary target origins;
- no method tunneling through headers or query parameters.

Both boundaries enforce request and response size limits. Hop-by-hop headers,
cookies not owned by the mirror, local host headers, and local network metadata
are stripped.

## Deployment Admission Configuration

The Worker-side mirror is inert until all of the following deployment values
are present:

- `OPERATOR_CONSOLE_GATEWAY_URL`: the HTTPS Cloudflare Tunnel origin for the
  local gateway, or an internal HTTP origin name when the VPC transport is
  selected;
- `OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN`: the exact origin of that URL; the
  Worker refuses to forward when the two origins differ;
- `OPERATOR_CONSOLE_GATEWAY_TRANSPORT`: `public-tunnel` or the explicit
  `vpc-service` transport;
- `OPERATOR_CONSOLE_GATEWAY_TCP_HOST` and
  `OPERATOR_CONSOLE_GATEWAY_TCP_PORT`: the private gateway address used by the
  VPC Network raw-TCP WebSocket leg when `vpc-service` is selected;
- `OPERATOR_CONSOLE_GATEWAY_TOKEN`: a Worker secret containing the dedicated
  gateway bridge token;
- `OPERATOR_CONSOLE_ACCESS_REQUIRED=true`;
- `OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN` and
  `OPERATOR_CONSOLE_ACCESS_AUDIENCE`: the Cloudflare Access issuer and
  application audience used to verify `Cf-Access-JWT-Assertion`.

The Worker validates the Access JWT signature against the Access JWKS, issuer,
audience, `exp`, and `nbf` before it forwards any Console request. It forwards
the bridge token only to the pinned gateway origin. The browser never receives
that token. The durable local mirror lifecycle uses a user-local bridge-token
file:

```text
NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN_FILE=<user-local-secret-file> narada console mirror start
```

When no file is supplied, the default is `<mirror-state-root>/bridge-token`.
The file contains only the dedicated local bridge token and is never committed,
projected to the browser, or written to the mirror state document. The Worker
`OPERATOR_CONSOLE_GATEWAY_TOKEN` secret must contain the same value.
`--bridge-token-file` is the equivalent explicit CLI option.

It reads the local Operator Router registration token from the Router state
directory unless `NARADA_OPERATOR_ROUTER_TOKEN` is explicitly supplied.
`TUNNEL_TOKEN_FILE` or a named tunnel (`NARADA_CLOUDFLARE_TUNNEL_NAME`) are
alternatives to `TUNNEL_TOKEN`; the token is never put in the child command
line or durable mirror state. A named tunnel uses the authenticated Wrangler
runner by default when no local `cloudflared` config is supplied; an explicit
`NARADA_CLOUDFLARE_TUNNEL_RUNNER=cloudflared` keeps the local-config path.
`narada console mirror status` reports process, gateway, and tunnel health;
token/config `cloudflared` runs use `/diag/tunnel`, while Wrangler-managed
named runs use the owned runner process as their control-plane health signal.
When the status reader has no bridge credential, it reports the mirror host's
last durable health snapshot and process liveness; it does not bypass the
gateway credential check or probe the protected health route with an empty
credential.
`restart` is the normal credential-rotation operation, while `rotate` records
that intent explicitly. The last mirror state supplies non-secret named-tunnel
and public-origin defaults for a fresh-shell restart. Start, restart, rotate,
and stop are serialized by a heartbeat-backed local lifecycle lock; competing
requests receive a bounded lock-timeout refusal instead of racing the state
file. Startup reports success only after the persisted owner state is ready.
`stop` refuses to mutate state when the recorded owner identity cannot be
verified. A deployment that exposes the Worker without the Access application,
origin pin, or gateway heartbeat is not a mirror; it must remain unavailable
rather than falling back to an apparently working public Console.

## External Provisioning Prerequisites

The repository implements the local gateway, Worker admission, and lifecycle
contracts; it does not manufacture Cloudflare account authority. Live
provisioning therefore requires an operator credential that can, for the
chosen account:

- deploy the Worker and manage its non-secret variables and secrets;
- create and run the dedicated Cloudflare Tunnel;
- create and bind the Workers VPC service and VPC Network targeting the
  dedicated tunnel and loopback gateway; and
- create or inspect the Cloudflare Access application and its policy/audience.

The preferred deployment uses two bindings to the same named tunnel. The VPC
Service binds the HTTP gateway to `127.0.0.1:61730`; the VPC Network binding
provides raw TCP access to that address for the WebSocket leg. The Worker uses
an internal origin name such as `http://operator-console.internal` only as the
VPC request Host value. That name is not public DNS; the VPC bindings determine
the actual target. Direct tunnel binding for the VPC Network requires the
Cloudflare Connectivity Directory Admin role. The Worker origin URL and origin
pin must still match exactly, and the Access application must protect the
Worker hostname before route acceptance is tested.

The Worker health projection reports these transports separately. A healthy
HTTP VPC Service is not sufficient for mirror readiness when the VPC Network
binding does not expose a working raw-TCP `connect` operation; in that case
health is `degraded` and the WebSocket path returns a typed refusal rather than
silently falling back to the unreliable HTTP upgrade path.

The `public-tunnel` transport remains available for deployments that have a
DNS-backed published application route. Its generated `<UUID>.cfargotunnel.com`
name is the tunnel target, not the operator-facing gateway origin.

A Wrangler login that can deploy Workers and manage Connectivity Directory
services but lacks Access-app authority is still insufficient for the final
browser slice. The deployment preflight catches missing local configuration
before invoking Wrangler, but it cannot prove that the remote Access
application exists without the corresponding Cloudflare authority. The
Access application must be verified by live acceptance checks. Never
substitute a Quick Tunnel or disable `OPERATOR_CONSOLE_ACCESS_REQUIRED` for
acceptance.

The deployment package exposes two explicit paths:

```text
pnpm run mirror:preflight
pnpm run deploy:mirror
```

Both read the mirror values from the environment. `mirror:preflight` is
read-only. `deploy:mirror` refuses before invoking Wrangler unless the gateway
URL and pin are matching origins, the selected transport is valid, Access is
required, the Access issuer and audience are present, and the Worker bridge
token matches the local bridge token. HTTP origins are accepted only for the
explicit `vpc-service` transport. Non-secret values are passed as Worker
variables; the bridge token is uploaded through Wrangler's temporary
secrets-file input and is removed after the command exits. The tunnel, VPC
Service, and VPC Network must already be ready before the local mirror
lifecycle is started.

After deployment, the authenticated remote gate can be run with a Cloudflare
Access service token or an exported CF_Authorization cookie. The credential
value is supplied only through a bounded stdin handoff; it is not accepted in
argv, an environment variable, or a persisted secret file:

    Get-Secret -Name <temporary-access-secret> -AsPlainText | pnpm --filter @narada-core/cloudflare-nars-projection test:operator-console-mirror-live -- --url https://<worker-host> --access-client-id <client-id> --access-client-secret-stdin --turn-content LIVE_E2E_OK --artifact-id <artifact-id> --artifact-sha256 <artifact-content-sha256>

The gate proves Access admission, complete route-directory parity, mirror health, and
browser rendering of the principal Console pages. When the route directory
offers a concrete session, `--turn-content` is required and the gate submits
that sentinel through the public input endpoint, then requires durable input
admission, turn start, assistant output, turn completion, input completion,
and a completed control response. It also requires the corresponding
operator/user and assistant rows to render in the session event list. Thus a
replay-only or static-browser result cannot pass as session coverage. The gate
refuses without an explicit stdin credential and writes only redacted per-run
evidence. It is a necessary live gate, not a substitute for the full
route-by-route journey and failure-injection acceptance required below.
By default it also reads `http://127.0.0.1:61729/console/routes` and compares
the complete local route-directory document with the remote response, ignoring
only `generatedAt` and recording SHA-256 contract digests;
`--local-route-directory-url` may select another loopback Console Router.

The runner commands have distinct meanings:

- `pnpm test` runs offline Vitest tests and does not claim live acceptance;
- `pnpm --filter @narada-core/cloudflare-nars-projection plan:operator-console-mirror-live`
  records an explicit plan without contacting the Worker;
- `pnpm --filter @narada-core/cloudflare-nars-projection test:operator-console-mirror-live`
  runs the full browser/UI profile and fails rather than silently skipping
  required journeys;
- `test:operator-console-mirror-live:tunnel-loss`,
  `test:operator-console-mirror-live:route-revocation`, and
  `test:operator-console-mirror-live:stale-lease` are separate explicit
  failure-injection profiles that use the same live Access credential path and
  persist their own redacted evidence;
- `--mutation-mode none --allow-skipped-journeys` is an explicit reachability
  diagnostic; `--mutation-mode api-disposable` is explicit backend-only
  mutation coverage and is not a substitute for the UI journey.

The live Registry mutation acceptance uses a unique disposable Site id and a
nonexistent temporary root. It applies only after a successful plan, carries
the observed revision through each edit/state transition, retires before
purging, supplies the exact purge confirmation, and verifies that the record is
absent afterward. It never mutates an existing Site.

The browser portion of the gate has two explicit postures. The default full
profile fails when Site Operations, a concrete session input/events route, a
turn sentinel, or a concrete artifact plus expected SHA-256 is unavailable. It
also performs real launch-to-registry navigation, a dry-run posture action,
onboarding refresh, and the disposable registry mutation form journey. The
explicit `--allow-skipped-journeys --mutation-mode none` profile is for
reachability diagnostics only and is never a full acceptance pass; skipped
journeys are recorded as skips. The gate never invents a Site, session, or
artifact identity.

The same gate exposes explicit, opt-in failure checks. They must be run only
against a disposable or maintenance-window projection because they interrupt
or mutate live local projection state, and each mode restores the state before
it can pass:

```text
... --live --failure-mode tunnel-loss
... --live --failure-mode route-revocation
... --live --failure-mode stale-lease
```

`tunnel-loss` requires a live mirror whose owned state contains the bridge
credential, or an explicit `NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN` override, so
the mirror can be restarted. The route modes require the local Operator Router admin token;
they revoke or shorten one concrete session-route lease, assert that the real
Worker returns a typed unavailable/not-admitted response, restore the exact
route, and assert that the route returns successfully. Failure-mode evidence
contains only statuses, route identifiers, and typed codes.

Live evidence is append-only by run. Each invocation writes a unique JSON
record below `.narada/evidence/operator-console-mirror-live/` and appends a
redacted summary to that directory's `index.jsonl`; one failure mode cannot
overwrite another run's record. The generated Wrangler binding declaration
`packages/cloudflare-nars-projection/worker-configuration.d.ts` is ignored by
Git and must be recreated with:

    pnpm --filter @narada-core/cloudflare-nars-projection generate:types

## Authority

Cloudflare owns remote ingress, browser authorization, static asset delivery,
and non-canonical projection cache state.

The local gateway owns crossing admission and audit. The local Operator Console
and the domain surfaces behind it retain their existing authority:

- Site Registry remains User Site authority;
- launches remain launcher/session authority;
- Site Operations remains Local Site authority;
- NARS sessions remain their declared authority runtime;
- artifact content remains session artifact authority.

A successful Worker response proves only that the request crossed the remote
projection boundary. Domain mutation success still requires the existing local
result and evidence contracts.

## Availability And Lifecycle

The mirror route is available only while all of these are current:

- Cloudflare projection registration;
- browser-access policy;
- bridge credential;
- tunnel health;
- local gateway health;
- local Operator Router health;
- route lease health.

The local gateway publishes heartbeats. Missing or stale heartbeats make the
Cloudflare route unavailable; the Worker must not render a working-looking page
whose backend cannot answer.

The gateway also refreshes the versioned HTTP parity inventory emitted by the
local `GET /console/routes` endpoint. It refuses to listen without a complete
inventory and refuses forwarding after the cached inventory expires. This is
the mechanical parity gate: a local route must carry an explicit remote
disposition and intent kind before it can enter the remote admission set.

Projection registration remains deployment authority. Bridge start, tunnel
start, credential rotation, reconnect, and teardown are explicit local
lifecycle operations with durable diagnostics in the mirror state root.
Revocation removes browser reachability and invalidates bridge admission without
changing local domain state.

## Parity Evidence

Completion requires a generated parity inventory derived from the local
Operator Console route table. For every local route it records:

- method and path pattern;
- transport protocol (`http` or `websocket`);
- route owner and intent kind;
- Cloudflare document or proxy handling;
- local gateway admission;
- authorization requirement;
- request/response bounds;
- automated contract-test evidence.

The parity gate fails when a local route is added without a mirror disposition.
Dynamic Router methods outside the gateway's explicitly admitted read and
Console-intent set remain `local-only`; route discovery must not turn them into
remote mutation capability.
`unsupported` is permitted only when the canonical Operator Console contract
marks the route local-only and the Cloudflare UI renders that state explicitly.

## Security Invariants

- Cloudflare Access identity is not a bridge credential.
- A bridge credential is not a browser credential.
- The tunnel does not make loopback authority public.
- The Worker cannot choose an arbitrary local target.
- The browser cannot supply the gateway origin or bridge token.
- The gateway fails closed when its policy, Router identity, or projection
  registration is stale.
- Secrets never appear in route directories, HTML bootstrap, URLs, logs, or
  browser-readable diagnostics.
- Remote mutation is enabled per intent family and remains subject to the same
  local admission as a local browser request.

## Delivery Slices

1. Shared route parity inventory and failing parity gate.
2. Read-only gateway for route directory, health, Sites and Agents, registry,
   sessions, and projected pages.
3. Cloudflare Worker proxy and Access-bound browser authorization.
4. Explicit mutation-intent admission for registry, launch, onboarding, agent,
   and Site Operations workflows.
5. HTTP session and artifact route proxying, plus session WebSocket bridging,
   are implemented for current read-only leases.
6. Governed tunnel lifecycle, credential rotation, diagnostics, and teardown are
   implemented by `operator-console-mirror-runtime` and `narada console mirror`.
7. Live Cloudflare deployment with route-by-route browser acceptance.

The target is complete only when the Cloudflare URL passes the same Operator
Console browser journey suite as local ingress, plus remote authorization,
revocation, tunnel-loss, and stale-lease tests.
