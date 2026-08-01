# Host Fleet Operator Console Target

## Status

This document defines the target shape for operating Narada installations on
more than one host, such as a Windows desktop and a ZimaBoard. It is an
architecture target and the authority/routing slice is implemented: the User
Site Host Registry, versioned HostKey/RuntimeTarget contracts, bounded gateway
health and session discovery, exact-target projection, authenticated
bidirectional event/input relay, `narada fleet` inventory/audit commands, and
the local and Cloudflare fleet HTTP boundaries now exist. The browser Host
Fleet page now consumes both route shapes: the local console boundary and the
Cloudflare projection boundary. The remaining acceptance work is physical
two-host deployment, production enrollment/configuration, the host-local
console document projection, and the governed control-plane slices that are
intentionally not browser-only actions.

The existing Operator Console remains a host-local console. It may observe and
route across Sites known to that host's User Site, but it is not a distributed
fleet manager. This document defines the missing layer above multiple
host-local consoles without moving NARS or Site authority into that layer.

### Implemented Initial Slice

The current implementation establishes the boundary without pretending to
provide the full fleet runtime:

- `@narada2/host-fleet` owns the versioned host record, registry, audit trail,
  qualified target/event types, and bounded Host Gateway client.
- The canonical registry is a SQLite database under the User Site's
  `.narada/host-fleet/registry.db`, with `NARADA_HOST_FLEET_REGISTRY_PATH`
  available for an explicit test or deployment location.
- `narada fleet list`, `show`, `register`, `revoke`, `retire`, `audit`, and
  `probe` expose explicit host-scoped operations. Registration requires a
  credential reference and admitted gateway paths; raw credential values are
  never stored in the registry.
- The local Operator Console exposes `/console/hosts` and
  `/console/hosts/api` as a read-only inventory projection. The browser
  projection omits endpoint and credential-reference fields and preserves
  `host_id@host_instance_id` identity.
- Registry registration, explicit re-enrollment, health updates, revocation,
  retirement, and refusal outcomes are audited.
- `narada fleet observations` exports the bounded, redacted gateway request
  ledger with an exact HostKey filter or an explicit global limit.
- Host Gateway reads emit a separate bounded request-observation record with a
  correlation ID, HostKey, admitted path, outcome, status, duration, and
  refusal reason. The User Site retains the latest 5,000 observations without
  recording endpoints, credentials, request bodies, or response payloads.

The local and Cloudflare projections also prove the session and relay boundary
in synthetic tests. The browser Host Fleet page consumes host-qualified
inventory/session/target contracts from either route shape, persists only the
selected HostKey, re-resolves the exact RuntimeTarget before attachment, and
projects replay/live events plus operator input through the existing NARS
WebSocket protocol. In Cloudflare mode, session discovery fans out only to
declared registry hosts and returns a canonical host-qualified projection; it
does not select a host implicitly. The page exposes inventory, exact
attachment, replay/live observation, explicit read-only aggregate observation
with per-HostKey cursors, and operator input only. Launch, stop, refresh-health,
enrollment, and revoke/retire remain governed server operations rather than
client-only controls. A redacted Cloudflare registry example is checked in at
`packages/cloudflare-nars-projection/config/host-fleet.registry.example.json`.
They do not claim that a production host has been enrolled or that the
physical two-host live test has passed; that test is opt-in through
`NARADA_HOST_FLEET_LIVE_E2E_JSON`. Its host entries can additionally carry
`local_port` and `expected_session_id`; when supplied, the test mechanically
proves that every physical host uses the same local port number and that the
expected session remains qualified to its declared HostKey.

## Objective

Give the operator one explicit, host-qualified control surface for discovering,
health-checking, attaching to, and routing to Narada installations on multiple
hosts while each host retains authority over its own NARS sessions and Sites.

The target must make these facts immediately visible:

- which host is being observed;
- which host instance is currently connected;
- which Site, Agent, and runtime session are targeted;
- whether the view is live, stale, disconnected, or revoked; and
- which authority will admit a requested mutation.

## Canonical Shape

```text
                         User Site
                 canonical Host Registry
                              |
                              v
                 Host Fleet Operator Console
                    projection and intent router
                    /                         \
                   /                           \
      Desktop Host Gateway                 Zima Host Gateway
          authenticated crossing             authenticated crossing
                   |                           |
      Desktop Operator Console      Zima Operator Console
                   |                           |
          Desktop NARS and Sites       Zima NARS and Sites
```

The fleet console is a composition and routing layer. It is not a new NARS,
not a Site, and not a second copy of host-owned runtime state.

Each host-local console may continue to serve its own browser and overlay
surfaces. The fleet console may link to those surfaces, or project the same
contracts through a host gateway, but it must preserve the host boundary.

## Ownership and Authority

| Concern | Canonical owner | Fleet-console behavior |
| --- | --- | --- |
| Host inventory and enrollment | User Site Host Registry | Reads and manages registry records through its governed contract |
| Host process and gateway lifecycle | Host | Observes health and requests admitted lifecycle operations |
| Site identity and Site state | Target Site on the host | Never writes Site state directly |
| NARS session state and event log | NARS authority runtime on the host | Routes to the exact host and session |
| Agent identity and role admission | Target Site and runtime launch authority | Displays qualified identity; never infers it from a label |
| Browser projection | Fleet or host-local UI projection | Presents read models and typed refusals |
| Cross-host inventory view | Fleet console | Derived view; not canonical domain state |
| Cross-host scheduling or replication | No fleet-console authority | Out of scope for this target |

The User Site Host Registry is canonical for host enrollment and connection
metadata. It is not canonical for Site, Agent, or NARS state. A registry loss
must not delete or alter a host's runtime state; a host can be re-enrolled.

The fleet console may issue an intent, but the target host gateway and the
host-owned authority must independently authenticate, authorize, validate, and
record it. A successful fleet response proves routing and admission at the
target boundary, not that the fleet console became the authority.

## Identity Factorization

The fleet layer must not identify a target by `agent_id`, Site name, local port,
or session ID alone. The canonical target key is:

```text
HostKey = {
  host_id,
  host_instance_id
}

RuntimeTarget = {
  host_id,
  host_instance_id,
  site_id,
  agent_id,
  runtime_session_id
}
```

Definitions:

- `host_id` is the durable logical identity of a registered host.
- `host_instance_id` identifies one installation or runtime incarnation of
  that host. Reinstall, re-enrollment, or an explicit instance reset creates a
  new instance ID without silently changing the logical host identity.
- `site_id` identifies a Site within the host.
- `agent_id` identifies the Site-qualified Agent selected for the runtime.
- `runtime_session_id` identifies one NARS authority-runtime session.

Existing identifiers with a `carrier_` prefix may remain as opaque legacy
session values during migration. `carrier` is not a fleet identity concept
and must not appear as a required layer in the target model.

Every event, health result, session record, launch result, and operator intent
that crosses the fleet boundary must carry the HostKey and the narrowest
available RuntimeTarget. The UI may group or filter by a shorter label, but it
must not discard the qualified identity.

## Host Registry Contract

The canonical registry record is conceptually:

```text
HostRecord {
  host_id,
  host_instance_id,
  display_name,
  platform,
  narada_version,
  gateway_binding,
  gateway_credential_policy,
  capabilities,
  registered_at,
  last_seen_at,
  health_snapshot,
  admitted_sites,
  credential_ref,
  lifecycle_state,
  revision
}
```

Required properties:

1. Host registration is explicit. Network discovery may produce candidates,
   but discovery alone does not grant fleet admission.
2. Credentials are references to User Site or host secret storage. Raw
   credentials never enter registry rows, route directories, URLs, browser
   bootstrap data, or diagnostics.
3. A host record has an explicit lifecycle state such as `pending`, `active`,
   `degraded`, `revoked`, or `retired`.
4. The registry records the host gateway's declared endpoint and capabilities,
   not an arbitrary target URL supplied by a browser.
5. Registration and retirement are auditable and revision-checked operations.
6. A host instance mismatch is a typed refusal or re-enrollment flow, never an
   invisible replacement.

`admitted_sites` is an explicit session/target allowlist. An empty list admits
no Site-specific session discovery or attachment; health and inventory remain
available so the operator can repair enrollment.

The registry may cache health and capability observations. Those cached values
are projections and must be labeled with their observation time and source.

## Host Gateway

The Host Gateway is the governed crossing between the fleet console and one
host-local Operator Router or Console. It owns:

- host credential verification;
- host-instance binding;
- endpoint and route admission;
- request and response bounds;
- event replay and live-stream forwarding;
- audit of crossed requests; and
- health and capability reporting.

The gateway must not expose an arbitrary shell, filesystem, database, or raw
NARS endpoint. It forwards only routes declared by the host's route directory
and only intent families explicitly admitted by the host policy.

The normal local shape is loopback authority plus an authenticated crossing
such as an SSH tunnel, a governed tunnel, or an authenticated HTTPS gateway.
Binding a host-local Operator Router directly to an unprotected LAN address is
not the target shape.

### Current Credential Boundary

The registry carries an explicit `gateway_credential_policy` with schema
`narada.host_fleet.gateway_credential.v1`, class, and optional `not_before` and
`expires_at` bounds. Existing records without that field normalize to
`bridge_compatibility`; this keeps migration backward-compatible while making
the compatibility path visible. A record with class `dedicated_host_gateway`
uses `x-narada-host-gateway-token` instead of the legacy
`x-narada-operator-console-bridge-token` header, and the client refuses before
crossing the gateway when the credential is not yet valid or has expired.

The host-local remote gateway accepts the dedicated header for host-qualified
requests only when its separately configured `host_gateway_token` is present.
Unqualified legacy requests continue to use the bridge header during the
migration. Both HTTP and WebSocket relays select the declared class; neither
the browser nor the registry stores a raw credential. The registry's
`credential_ref` is resolved by the local authority through an explicit
environment or User Site secret reference such as
`env://NARADA_ZIMA_GATEWAY_TOKEN`. Production secret provisioning, rotation,
and live expiry/revocation acceptance remain deployment work.

### Lifecycle Intent Boundary

Host lifecycle requests have a separate, versioned intent contract:
`narada.host_fleet.lifecycle_intent.v1`. An intent names exactly one HostKey,
one operation (`revoke` or `retire`), an expected registry revision, an
idempotency request ID, and an explicit HostKey confirmation string. The pure
`narada.host_fleet.lifecycle_preflight.v1` projection validates that shape,
checks the current revision and terminal-state rules, and always reports
`mutation_performed: false`. It is safe to use for UI confirmation and
operator diagnostics.

Preflight is not execution. The User Site authority now exposes the governed
local execution route `POST /console/hosts/api/lifecycle`. Its body contains
the typed `intent`, `operator_confirmed: true`, and an optional actor label.
The route is restricted to the local console boundary, performs the same
revision check immediately before mutation, persists the request-id/hash
result, records the actor and request in the audit ledger, and returns a typed
`applied`, `replayed`, `unchanged`, or `refused` result. A refusal is HTTP 409;
no refusal path mutates the registry. Cloudflare does not mutate its
materialized registry through this contract; a future Cloudflare control
route must forward to this User Site authority rather than becoming a second
registry authority.

### Enrollment Admission Boundary

The current enrollment admission contract is the non-mutating
`narada fleet register --dry-run` path. It validates the candidate HostKey,
platform, gateway transport and admitted paths, Site admission, capabilities,
credential class, and secret reference without opening the registry or storing
a raw credential. Its result is
`narada.host_fleet.register_preflight.v1` with
`mutation_performed: false`. A matching active HostKey is unchanged; a
different instance for the same logical host requires explicit
`--allow-reenrollment`, and the existing instance is retired only by the
governed non-dry-run CLI operation.

This preflight is the server-owned input contract for the governed local
execution route `POST /console/hosts/api/enrollment`. The route accepts only
secret references and declared metadata, requires `operator_confirmed: true`,
performs the revision and explicit re-enrollment checks immediately before
mutation, persists a request-id/hash result, and records the actor/request in
the audit ledger. It returns the same typed applied/replayed/unchanged/refused
shape without returning a credential value. The Host Fleet page does not yet
present the enrollment form; until it does, the CLI remains the ergonomic
enrollment surface and the HTTP route is an authority contract for trusted
server-side callers.

## Implemented Session and Relay Boundary

The local Operator Console exposes these host-qualified read and stream
routes:

| Method | Route | Semantics |
| --- | --- | --- |
| `GET` | `/console/hosts/api/sessions` | Discover sessions across registered hosts; an optional `host_id` and `host_instance_id` pair scopes the query. |
| `GET` | `/console/hosts/api/:host_id/:host_instance_id/health` | Fresh host-qualified gateway health; the endpoint and credential remain server-side. |
| `GET` | `/console/hosts/api/target?host_id=...&host_instance_id=...&site_id=...&agent_id=...` | Resolve exactly one session on one host; `runtime_session_id` may further constrain it. |
| `GET` | `/console/hosts/api/observations?...` | Read bounded, redacted Host Gateway request observations from the User Site ledger. |
| `GET` | `/console/hosts/api/lifecycle/preflight?...` | Validate a typed, revision-checked lifecycle intent without mutating the registry; the response always reports `mutation_performed: false`. |
| `POST` | `/console/hosts/api/lifecycle` | Execute one confirmed, revision-checked lifecycle intent at the User Site authority; request IDs are durable and replay-safe. |
| `POST` | `/console/hosts/api/enrollment` | Execute one confirmed, revision-checked enrollment or explicit re-enrollment intent at the User Site authority; only secret references cross the route. |
| `GET` + WebSocket upgrade | `/console/hosts/api/sessions/:host_id/:host_instance_id/:runtime_session_id/events?site_id=...&agent_id=...` | Re-discover and validate the exact target, then relay the authenticated host gateway stream in both directions. |

The relay injects the qualified host headers and host gateway credential on the
server side. It does not accept those headers or credentials from the browser.
Session discovery is repeated before a WebSocket upgrade so a stale or
ambiguous session cannot be attached merely because a URL was previously
issued. A plain HTTP GET to the event path is refused.

The Cloudflare projection composes the same boundary with these routes:

| Method | Route | Semantics |
| --- | --- | --- |
| `GET` | `/api/narada/fleet/hosts` | Redacted host inventory. |
| `GET` | `/api/narada/fleet/hosts/:host_id/:host_instance_id/health` | Host-qualified gateway health. |
| `GET` | `/api/narada/fleet/hosts/:host_id/:host_instance_id/sessions` | Host-qualified session discovery. |
| `GET` | `/api/narada/fleet/hosts/:host_id/:host_instance_id/target?...` | Exact host/session target resolution. |
| `GET` | `/api/narada/fleet/hosts/lifecycle/preflight?...` | Validate a typed, revision-checked lifecycle intent without mutating the Cloudflare registry; the response always reports `mutation_performed: false`. |
| `GET` + WebSocket upgrade | `/api/narada/fleet/hosts/:host_id/:host_instance_id/sessions/:runtime_session_id/events?...` | Exact-target WebSocket relay with server-side service binding/HTTPS credential injection. |

Cloudflare remains projection-only for this slice. It may expose the
non-mutating preflight and route read/stream requests, but it must not apply a
local registry mutation against `NARADA_HOST_FLEET_REGISTRY`. Cloudflare
enrollment or lifecycle controls require a separately authenticated authority
binding that forwards the typed intent to the User Site route above and
returns its result unchanged.

Cloudflare access authorization runs before these routes. The Cloudflare
worker is a projection and crossing; it does not become the session authority
or merge host-local event cursors. Each gateway request receives or preserves
an `x-request-id`; the projection returns that ID so Cloudflare-side relay
logs can be correlated with the host gateway without exposing credentials or
payloads. Setting `NARADA_HOST_FLEET_OBSERVABILITY=log` enables structured,
secret-free relay observations in Worker diagnostics. The observations are
bounded metadata only; they do not persist request or response payloads.

### Cloudflare Registry Configuration

The worker receives a JSON value through `NARADA_HOST_FLEET_REGISTRY`. Gateway
URLs, service-binding names, and credential-binding names are deployment
coordinates; only the redacted host inventory is returned to a browser. A
synthetic configuration has this shape:

The top-level `revision` versions the materialized configuration. Each host
also carries its own record `revision`, which is the value required by a
host-scoped lifecycle intent. Older configurations that omit the per-host
field temporarily use the top-level revision as their compatibility value.

```json
{
  "schema": "narada.cloudflare.host_fleet_registry.v1",
  "revision": 1,
  "hosts": [
    {
      "host_id": "zima-board-2",
      "host_instance_id": "zima-instance-2026-07",
      "revision": 1,
      "display_name": "ZimaBoard 2",
      "platform": "linux",
      "lifecycle_state": "active",
      "admitted_sites": ["sonar"],
      "capabilities": ["sessions", "events"],
      "gateway": {
        "transport": "service-binding",
        "binding": "ZIMA_GATEWAY",
        "credential_binding": "ZIMA_TOKEN",
        "credential_class": "dedicated_host_gateway",
        "admitted_paths": [
          "/health",
          "/console/sessions/api/sessions",
          "/sessions/*"
        ]
      }
    }
  ]
}
```

`ZIMA_TOKEN` is a Worker secret and `ZIMA_GATEWAY` is a Worker service
binding. Neither value belongs in the registry JSON, route directory, browser
bootstrap, or diagnostic output. An HTTPS gateway uses `transport: "https"`
and a deployment-owned `url` instead of `binding`; the same path and secret
invariants apply.

Before deployment, the checked-in registry shape can be validated without
claiming that a Worker or gateway is live:

    $env:NARADA_HOST_FLEET_REGISTRY_FILE = "config/host-fleet.registry.json"
    pnpm --filter @narada2/cloudflare-nars-projection host-fleet:preflight

The preflight reports the required service-binding and secret-binding names,
checks the health/session/event admissions and declared capabilities, and
returns `preflight_ready: true` only for that static validation. It deliberately
keeps `deployment_ready: false` until live bindings, deployment, and browser
smoke verification have succeeded; those remain explicit next steps.

## Routing and Session Attachment

The fleet console resolves a session in this order:

1. An explicit `RuntimeTarget` supplied by the operator or a durable launch
   result.
2. A registry-backed host and Site selection followed by a session query on
   that exact host.
3. A single unambiguous active session on that exact host, Site, and Agent.

It must refuse when more than one session matches. It must never choose a
previous session merely because the Agent name matches, and it must never
fall back to another host when the selected host is unavailable.

The operator-facing target label is qualified, for example:

```text
desktop-sunroom-2 / sonar / resident / runtime session <id>
zima-board-2 / sonar / resident / runtime session <id>
```

Identical Site or Agent names on different hosts are valid. They are distinct
targets because their HostKeys differ. Identical local port numbers are also
valid; the gateway and HostKey provide the separation.

## Events and Health

The fleet console may aggregate observations, but event order and cursors are
host-scoped. A live subscription is conceptually:

```text
Subscription {
  host_scope: one HostKey or an explicit set of HostKeys,
  site_scope?: site_id,
  session_scope?: runtime_session_id,
  cursor_by_host: { [HostKey]: sequence }
}
```

Every forwarded event includes:

- `host_id`;
- `host_instance_id`;
- `site_id` when known;
- `agent_id` when known;
- `runtime_session_id` when known;
- the host-local sequence and timestamp; and
- the event payload or a bounded redacted projection.

The fleet layer must not fabricate one global sequence from independent host
streams. It may provide a presentation ordering by receipt time, but the UI
must retain each source cursor and show the source host.

Health is likewise host-qualified. A healthy fleet view means that the
selected host gateways and their declared projections are healthy; it does not
mean every Site or NARS session is healthy. Cached health is shown as stale,
not silently presented as live.

## Operator Experience

The primary fleet view contains:

- a host list with platform, instance, connection, health, and last-seen state;
- explicit `online`, `degraded`, `offline`, `stale`, `revoked`, and
  `unauthenticated` states;
- the currently selected HostKey as persistent context;
- Sites and active sessions grouped beneath that host;
- host-qualified launch and attach actions;
- a bounded recent-event view with source host labels; and
- an explicit route to the host-local console for workflows not projected by
  the fleet surface.

The operator must be able to:

1. register or enroll a host;
2. see whether the host gateway is reachable and authenticated;
3. inspect its Sites and runtime sessions;
4. attach to one exact session or start one exact runtime target;
5. send an operator input to the exact target;
6. inspect replay and live events with host-qualified labels;
7. revoke or retire a host connection; and
8. return to the host-local console without losing host context.

Unavailable hosts remain visible as unavailable. A cached read-only snapshot
may remain available when policy permits, but actions are disabled and the
snapshot age is explicit. The UI must never show a working-looking session
page backed by an unavailable host.

## Cloudflare Relationship

Cloudflare is a possible projection and crossing embodiment of the fleet
console. It is not automatically the canonical Host Registry and does not
become the authority for local NARS or Sites merely by hosting the browser.

The Cloudflare shape is:

```text
browser
  -> Cloudflare access and fleet projection
  -> authenticated Host Gateway for the selected HostKey
  -> host-local Operator Router
  -> host NARS / Site authority
```

A Cloudflare projection may aggregate multiple registered hosts only when its
own registry projection and remote-access policy explicitly admit them. It
must preserve the same HostKey, RuntimeTarget, route admission, event cursor,
and refusal semantics as local fleet ingress.

The existing single-host Cloudflare Operator Console mirror remains a valid
special case: it projects one host. The fleet target composes such host
crossings; it does not replace their authority contracts.

## Failure and Revocation Semantics

The following cases are typed and visible:

| Condition | Required result |
| --- | --- |
| Host gateway unreachable | Host is `offline` or `unavailable`; no fallback routing |
| Health response is old | Snapshot is `stale` with observation time |
| Host instance differs | Refuse or require explicit re-enrollment |
| Session is not found | Refuse with exact HostKey and search scope |
| Multiple sessions match | Refuse as ambiguous and list bounded candidates |
| Route is not admitted | Refuse with route and authority owner |
| Credential is missing or revoked | Host is `unauthenticated` or `revoked`; no retry loop that hides state |
| Host is retired | No new attachment or mutation; retained evidence remains readable if allowed |
| Event cursor is invalid | Request bounded replay from a fresh host-scoped cursor |

No failure may silently select a different host, Site, Agent, or runtime
session.

## Security Invariants

- Fleet-console browser credentials, Host Gateway credentials, and local Site
  credentials are separate credential classes.
- A Cloudflare Access identity is not a Host Gateway credential.
- A Host Gateway credential is not a NARS provider secret.
- The browser cannot choose an arbitrary host endpoint or forward a gateway
  credential.
- Host registration, credential rotation, revocation, and retirement are
  auditable User Site operations.
- Host gateways enforce their own route and intent admission even when the
  request came through a trusted fleet console.
- Event and health projections redact secrets and bounded sensitive payloads.
- Removing a host from the registry revokes fleet reachability; it does not
  delete host-local Site or NARS state.

## Non-Goals

This target does not create:

- a cross-host NARS authority runtime;
- a fleet-wide event store that replaces host-owned event logs;
- cross-host Site or Agent identity merging;
- automatic cross-host scheduling or work stealing;
- implicit replication of Site state or artifacts;
- arbitrary remote shell or filesystem access; or
- a browser-only registry that bypasses the User Site authority.

Those may become separate concepts with their own authority contracts. They
must not be smuggled into the fleet console as convenience behavior.

## Delivery Slices

1. Define versioned Host Registry, HostKey, RuntimeTarget, and host-qualified
   health/event envelopes.
2. Add explicit User Site host registration, enrollment, capability, and
   revocation records using secret references.
3. Expose the host-local gateway contract with loopback-safe transport,
   authentication, route admission, health, and bounded diagnostics.
4. Add fleet-console host inventory and host-qualified session discovery. **Implemented.**
5. Add exact-host attach, event replay/live subscription, and operator input
   routing. **Local and Cloudflare browser route shapes, adapter contracts, and
   server-side relay are implemented; governed launch and physical-host E2E
   remain.**
6. Add host-local and fleet overlay/browser entry points with persistent host
   context. **The Host Fleet page and Cloudflare static-page configuration are
   implemented; host-local console linking and enrollment UX remain.**
7. Add Cloudflare fleet projection only after local two-host parity is proven. **Synthetic projection, per-host session fan-out, native browser route configuration, correlation diagnostics, and deployment preflight are implemented; production deployment parity remains.**
8. Run the two-host E2E matrix with a Windows desktop and a ZimaBoard.

## Acceptance Target

The target is operationally complete when an operator can run the same Site and
Agent name on two hosts concurrently and the fleet console can, without
ambiguity:

1. register both hosts and display distinct HostKeys;
2. report independent gateway and runtime health;
3. discover or launch one exact runtime session per host;
4. attach to either session without selecting the other host's session;
5. replay and receive live events with independent cursors and host labels;
6. send input to one session and prove that the other received nothing;
7. display typed refusal for stale, revoked, offline, and ambiguous targets;
8. open each host-local console through the corresponding gateway; and
9. survive restart without collapsing host identity or session routing.

The acceptance proof must include both hosts using the same local port number,
because port uniqueness across machines is not a valid identity boundary.

## Remaining Implementation and Acceptance Work

The following items are intentionally explicit so a green synthetic test suite
is not mistaken for a deployed fleet:

| Item | Current state | Required next boundary |
| --- | --- | --- |
| Physical Windows plus Linux acceptance | The opt-in harness and [`host-fleet-operator-console-acceptance.md`](../deployment/host-fleet-operator-console-acceptance.md) prove the required inputs and acceptance observations; the harness remains skipped without operator-supplied host data. | Run the two-host matrix, including restart, offline, stale, revoked, and re-enrollment cases. |
| Production Cloudflare fleet | Worker routes, native browser configuration, redacted registry example, synthetic service-binding tests, fail-closed deployment preflight, lifecycle preflight, acceptance runbook, and an opt-in read-only live browser smoke lane exist. | Materialize a deployment-owned registry, bind each gateway and secret, deploy, then run `smoke:host-fleet-live -- --live ...`; the live result still requires real active hosts and sessions. |
| Host-local console entry | The fleet page has no direct link or proxy route yet. | Add an explicit GET-only, host-qualified gateway-mediated console projection with safe asset/base-path handling; never expose loopback endpoints or credentials to the browser. |
| Browser enrollment | `narada fleet register`, `reenroll`, `revoke`, and `retire` remain governed CLI operations; the User Site authority now also exposes the confirmed, idempotent enrollment route, and the UI transport has a typed local-authority adapter without raw credential fields crossing the boundary. | Expose the local User Site enrollment form only after the browser mutation surface is explicitly approved; never accept a raw gateway credential in browser state. |
| Remote lifecycle controls | The User Site authority now exposes confirmed, revision-checked, idempotent lifecycle execution with audit correlation; the UI transport has a typed local-authority adapter and Cloudflare fails closed for mutation while exposing non-mutating preflight. | Expose local controls only with explicit UI approval; separately add an authenticated Cloudflare-to-User-Site authority binding before exposing remote controls. |
| Host Gateway credential class | Explicit bridge-compatibility and dedicated-host-gateway classes, migration-safe defaults, expiry checks, HTTP/WebSocket header selection, and remote admission tests exist. | Provision dedicated secrets in the deployed gateways and run live rotation, expiry, revocation, and rollback acceptance. |
| Multi-host event aggregation | The Host Fleet page now offers an explicit read-only aggregate observation mode. It opens one exact-target subscription per active session, keeps cursors keyed by HostKey plus runtime session, preserves source identity on every event, and performs bounded observable reconnect/resume after transport loss. Target refusal is terminal for that subscription rather than a hidden retry loop. | Run physical and Cloudflare browser acceptance for reconnect/resume; never synthesize a global event sequence. |
| Full fleet audit/observability | Registry mutations/refusals and bounded local request observations are retained and exportable; Cloudflare preserves correlation IDs and can emit opt-in secret-free relay observations to Worker diagnostics. | Add durable Cloudflare relay metrics plus a retention/export policy if Cloudflare-side historical audit is required; the current log mode is diagnostic, not a canonical ledger. |

## Related Documents

- [`operator-console-site-registry.md`](../product/operator-console-site-registry.md) — current host-local Operator Console and User Site registry boundary
- [`operator-console-cloudflare-mirror-target.md`](operator-console-cloudflare-mirror-target.md) — single-host Cloudflare projection and gateway contract
- [`operator-workspace-target.md`](operator-workspace-target.md) — browser workspace and route-directory contract
- [`../deployment/host-fleet-operator-console-acceptance.md`](../deployment/host-fleet-operator-console-acceptance.md) — physical and Cloudflare acceptance runbook
- [`../concepts/narada-agent-runtime-server.md`](../concepts/narada-agent-runtime-server.md) — vendor-neutral NARS runtime-server concept
- [`../concepts/nars-runtime-contract.md`](../concepts/nars-runtime-contract.md) — NARS runtime protocol and session contract
- [`../product/first-time-operator-success-path.md`](../product/first-time-operator-success-path.md) — first-time operator and host onboarding path
