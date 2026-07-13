# Narada Operator Router Target

## Status

This document defines the implementation target and current boundary contract
for Narada's stable local browser ingress. The dedicated router package and
the first projection integrations are implemented, including a typed Workspace
route directory and owner-side route-set reconstruction, renewal, recovery,
and teardown; the acceptance suite and remaining launcher/open-flow migrations
are still in progress.

The router gives an operator one bookmarkable loopback origin while preserving
ephemeral, independently owned backing services.

## Objective

Provide one stable host-local browser endpoint:

    http://127.0.0.1:<operator-router-port>

All normal browser UX is addressed beneath that origin. Backing services
continue binding ephemeral ports. The target is one stable ingress port, not a
stable port table for every surface.

## Ownership

The Operator Router is Host/PC-level projection infrastructure. It spans User
Site and Local Site projections and therefore cannot be owned by either one.
Its configured port and singleton posture belong to Host/PC configuration
authority.

The router owns the stable listener, route leases, health, HTTP and WebSocket
proxying, URL construction, browser security, and bounded diagnostics.

The router does not own Site Registry truth, NARS sessions, Agent Web UI
semantics, Site discovery, domain mutations, or arbitrary reverse proxying.
Route registration grants reachability only, never effect authority.

## Canonical Routes

| Route | Owner behind router | Meaning |
| --- | --- | --- |
| / | Router | Workspace surface directory. |
| /console/registry | Console / User Site Registry projection | Cross-Site registry UI. |
| /console/registry/api/* | Console / User Site Registry projection | Registry reads and admitted management requests. |
| /console/sessions | Console / NARS session index projection | Read-only composed agent session inventory. |
| /sites/<site-id>/operations/* | Site Operations projection | Local Site task, assignment, review, and agent projection. |
| /sessions/<session-id>/* | Agent Web UI | Browser projection for one NARS session. |
| /artifacts/<session-id>/<artifact-id>/* | NARS artifact projection | Admitted artifact metadata or content. |
| /health | Router | Router liveness and bounded dependency posture. |
| /routes | Router | Redacted diagnostic route inventory. |

Session routes use canonical NARS session id, not agent id. Future route
families require an explicit owner and route-class contract.

## Port Contract

There is one configured Operator Router port per Host/PC operator environment.
Narada ships one default through Host/PC configuration. The operator may
override it in that same authority source.

Startup behavior is strict:

1. Bind only to loopback by default.
2. Start when the configured port is free.
3. Attach when it is occupied by the matching healthy router.
4. Refuse with bounded evidence when anything else owns the port.
5. Never silently increment or fall back to an ephemeral operator-facing port.

Port 0 remains available for tests, diagnostics, and parallel development. It
is not the bookmarkable operator surface.

## Backing Services

Agent Web UI, Site Registry/Console, Site Operations, and NARS endpoints normally
bind loopback ephemeral ports. Direct URLs are diagnostic evidence. Normal
launch and open commands return router URLs.

The router never discovers targets by scanning ports or processes. Targets
arrive through explicit registration or reconstruction from canonical runtime
discovery records such as the NARS session index.

## Registration Contract

A registration carries schema, route id and class, public path, loopback target,
health URL, owner and Site/session identity, process start evidence, finite
lease, protocols, methods, body bounds, and timeout class.

Registration rejects unknown classes, non-loopback targets, path traversal,
overlapping prefixes, owner mismatch, PID-only identity, and unbounded methods,
bodies, or leases. The router is not a general reverse proxy.

## Lease And Recovery

Dynamic registrations are projections:

- healthy owners renew finite leases;
- failed probes mark routes unavailable before retirement;
- expired leases are removed;
- process identity includes a nonce to defeat PID reuse;
- artifact routes resolve from live NARS session indexes;
- projection owners reconstruct managed services and registrations from
  lifecycle evidence; the router never starts domain services;
- reconstructed targets are health-verified before advertisement.

The stable port is durable configuration. The live table is reconstructible.

## Base-Path Contract

Path routing requires base-path-aware browser applications.

Agent Web UI must support an assigned path such as
/sessions/<session-id>/, base-aware assets, APIs, WebSockets, and redirects. It
must not assume that /assets or /api owns the origin root.

The router strips prefixes only when the route contract declares that behavior.
It never rewrites arbitrary HTML or JavaScript as a substitute for application
support. Registry and Site Operations obey the same rule.

## Transport Behavior

The router supports bounded HTTP streaming, WebSocket upgrades, cancellation,
backpressure, bounded headers and bodies, route-class timeouts, and preservation
of backend status semantics. Trusted forwarding headers replace caller-supplied
copies. Backends do not trust forwarding headers from direct clients.

## Security

Required posture:

- loopback-only binding unless separate remote ingress is admitted;
- Host validation and DNS-rebinding protection;
- Origin validation for mutations and WebSocket upgrades;
- CSRF protection for browser mutations;
- appropriate SameSite, HttpOnly, and Secure cookie posture;
- no wildcard CORS;
- method, body, header, concurrency, and timeout bounds;
- no credentials, local paths, or secret parameters in diagnostics;
- route-class admission before proxying;
- mandatory backend authority checks.

The router is not an authentication substitute.

## Health And Diagnostics

GET /health reports router identity, version, listener posture, route counts,
and degraded route counts. GET /routes is bounded and redacted.

Router liveness, route-table readiness, and backing-service degradation are
separate states. One unhealthy session does not make the router unhealthy.

## Process Lifecycle

The router is a singleton hidden background process. Launchers and commands use
an idempotent ensure operation, and projection owners use the route-set lease
contract for grouped registrations:

1. probe the stable endpoint;
2. verify router identity;
3. start the hidden process only when absent;
4. wait for bounded readiness;
5. register or reconstruct the required route;
6. return the stable URL.

Grouped owners register transactionally, renew all routes from one bounded
timer, re-register a route that disappeared after router restart or lease
loss, and unregister every route before stopping their backing service. The
router may rehydrate and health-check route records, but it never starts a
domain service on behalf of an owner.

It uses the existing hidden process-launch posture and opens no persistent
console window.

## Operator UX

Normal commands converge on stable URLs:

    narada console open
    narada agent-web-ui attach --session <session-id>
    narada artifacts open <artifact-id>

Expected results:

    Operator Workspace: http://127.0.0.1:<router-port>/
    Site Registry: http://127.0.0.1:<router-port>/console/registry
    Agent Session: http://127.0.0.1:<router-port>/sessions/<session-id>/
    Artifact: http://127.0.0.1:<router-port>/artifacts/<session-id>/<artifact-id>/

Low-level serve commands with port 0 remain available and label their URLs as
direct diagnostic endpoints.

## Current State

- `@narada2/operator-router` owns the stable loopback listener, singleton lock,
  hidden detached startup, authenticated registration, finite leases, health
  state, bounded HTTP/WebSocket forwarding, and redacted route inventory. Its
  client rejects port `0`; only direct server construction may use port `0`,
  and that path is diagnostic by contract.
- `narada console serve` registers the Console projection at `/` and keeps
  `--port 0` as explicitly labeled diagnostic mode.
- `narada agent-web-ui attach` defaults to the router, registers a session HTTP
  route and an exact event-WebSocket route, and returns a stable
  `/sessions/<session-id>/` URL. Its browser config is base-path aware for
  assets, APIs, WebSockets, and direct artifact URLs.
- Session-owned artifacts register at
  `/artifacts/<session-id>/<artifact-id>/*` and reconstruct from the NARS
  session index and artifact registry.
- `narada workbench serve --site-id <id>` registers the existing governed Site
  Operations projection at `/sites/<site-id>/operations/`; `--port 0` remains
  the direct diagnostic mode.
- Persisted routes are schema-validated on reload, health-verified before
  advertisement, degraded when their owner process is gone, and replaceable
  only when the prior registration is demonstrably stale.
- Console, Site Operations, and Agent Web UI owners use a shared route-set
  lifecycle; Agent Web UI reuses a healthy existing session projection and
  cleans up its backing server and routes on signal-driven shutdown.
- The Console Workspace catalog projects concrete route availability and keeps
  parameterized route templates visible without presenting them as dead links.
- Agent Web UI and Site Operations use an explicit owner-side reconstruction
  helper for absent or stale route sets; a partially live set is refused rather
  than silently replaced.
- The router rehydrates route records and artifact routes from canonical
  evidence; Console, Agent Web UI, and Site Operations owners remain
  responsible for restarting their own backing services and re-registering
  them.
- The persistent launcher selection session now consumes the route inventory:
  when the Console projection is healthy it returns and opens
  `/console/launch/sessions/<id>`; its private listener remains persisted as a
  backing target only. If the Console projection is unavailable, the command
  returns the direct listener explicitly as a diagnostic fallback with a
  reason code.
- One-shot launcher selection and local task-graph/observation file renders
  remain diagnostic local-file projections. They are not falsely presented as
  Router artifacts; session-owned NARS artifacts already use the Router
  artifact route.

## Migration Slices

1. Add the Host/PC Operator Router package, config schema, singleton lock,
   identity probe, health endpoint, and route registry. **Implemented:** the
   dedicated package and hidden process now own this behavior.
2. Add strict registrations, leases, process evidence, and reconstruction.
   **Implemented for the current projection owners:** persisted registrations
   are validated and health-verified, artifact routes resolve from NARS
   evidence, and active owners use an explicit reconstruction contract for
   absent or stale route sets, renew them, and tear them down. Partially live
   sets are refused; automatic owner-side service restart remains outside the
   router by design.
3. Make Agent Web UI base-path aware and verify assets, APIs, WebSockets, and
   artifacts beneath a session prefix. **Implemented:** session and event
   routes are registered; direct artifact routes use the NARS session index.
4. Register Console/Registry and Site Operations projections. **Implemented for
   the current owner boundary:** the Console projection owns `/` and serves the
   User Site Registry and composed NARS session inventory beneath its stable
   route set; the existing Workbench Site Operations server is registered at
   its Site route. Registry-specific ownership is intentionally not split into
   a second Router route class because that would duplicate Console/User Site
   projection authority.
5. Change launcher and CLI open flows to return router URLs. **Partial:**
   Console, Agent Web UI, Site Operations, and the persistent launcher session
   handoff return router URLs when their owning projection is healthy. One-shot
   launcher selection and local task-graph or observation renders remain
   explicitly diagnostic because they have no persisted Router-owned artifact
   projection. A future artifact owner may admit those outputs without adding
   a generic file route.
6. Add Host, Origin, CSRF, route admission, loopback-target, and redaction
   acceptance tests. **Mostly implemented at the Router boundary:** route
   admission, redaction, HTTP method/body bounds, artifact, Host, and WebSocket
   coverage exists. Router Host validation is bound to the actual listener
   port, URL-like Host authorities are rejected, Origin validation is enforced
   for same-origin loopback requests and WebSocket upgrades, and CSRF tokens
   are transported to the backend authority. Browser mutation acceptance and
   CSRF enforcement remain owner-surface responsibilities.
7. Keep ephemeral commands as diagnostics and remove stable per-surface ports.
   **Normal projection commands implemented:** Console, Agent Web UI, Site
   Operations, and persistent launcher sessions use the Router; port 0 is
   retained only as explicit diagnostic mode. Launcher/session route-directory
   composition remains the next migration slice.

## Acceptance Invariants

1. There is exactly one normal operator-facing loopback port.
2. Foreign port collision is a refusal, not silent fallback.
3. NARS endpoints remain session-owned and discoverable.
4. Router registration never grants domain authority.
5. Session routes use session identity, not agent identity.
6. Dead or PID-reused owners cannot retain routes.
7. Agent Web UI works under a non-root path, including WebSockets and artifacts.
8. Browser mutations retain backend admission and CSRF protection.
9. Diagnostics are bounded and secret-free.
10. Ephemeral endpoints remain diagnostic, not default operator UX.

## Related Contracts

- [Agent Web UI Architecture](agent-web-ui-architecture.md)
- [Operator Workspace Target](operator-workspace-target.md)
- [NARS Runtime Contract](../concepts/nars-runtime-contract.md)
- [NARS Client Projection Contract](../concepts/nars-client-projection-contract.md)
- [Process Launch Posture](process-launch-posture.md)
- [Narada Runtime Projection Graph](../concepts/narada-runtime-projection-graph.md)
