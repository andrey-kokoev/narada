# Operator Router

Host-level stable loopback ingress for Narada operator projections.

The router owns the listener, singleton lifecycle, route admission, finite
leases, health, bounded HTTP/WebSocket proxying, and redacted diagnostics. It
does not own Site, NARS, Agent Web UI, artifact, or Site Operations truth.

Normal callers use `ensureOperatorRouter`, then register a bounded route with an
explicit owner and process nonce. A route is a projection: it must be renewed
while its owner is alive and is removed after its lease expires. Owners with
more than one route should use `registerOperatorRouteSet`; the set registration
is transactional, renews all routes, re-registers a route after a router
restart or lease loss, and provides idempotent teardown. When an owner is
restarting from canonical lifecycle evidence, use `reconstructOperatorRouteSet`:
it admits only reconstructable route declarations, refuses a partially live
route set, and replaces an absent or stale set without starting a domain
service on the Router's behalf.

The normal listener is `http://127.0.0.1:61729`. The router state and
registration token live in the host-level Operator Router state directory, not
inside a Site. Port `0` is reserved for tests and explicitly labeled
diagnostic servers.

Canonical projection families are:

- `/console/*` for User Site and Operator Console projections;
- `/sites/<site-id>/operations/*` for Site Operations;
- `/sessions/<session-id>/*` for one Agent Web UI session;
- `/artifacts/<session-id>/<artifact-id>/*` for session-owned artifacts.

Agent Web UI callers register one prefix HTTP route and one exact event
WebSocket route. When the session has a reconstructable Site root, they also
register a `nars-artifact` route. Browser applications receive their assigned
public base path and must use it for assets, APIs, event endpoints, and
artifact links.

The router is a reachability layer, not an authority layer. It does not scan
ports, infer Site ownership, or authorize domain mutations. Backends retain
their own policy and admission checks. `/routes` omits target URLs and local
paths; `/health` reports router liveness separately from degraded projections.

The Operator Workspace consumes the typed route directory from the Console
projection. A declared route template is not a browser link until its concrete
projection is available; route availability is derived from actual admitted
handlers rather than from the descriptor default alone.
