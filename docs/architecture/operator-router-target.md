# Narada Operator Router Target

## Status

This document defines the implementation target for Narada's stable local
browser ingress. It is not a claim that the router already exists.

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
| /console/registry | User Site Registry projection | Cross-Site registry UI. |
| /console/registry/api/* | User Site Registry projection | Registry reads and admitted management requests. |
| /console/sessions | NARS session index projection | Read-only agent session inventory. |
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
- NARS routes reconstruct from live session indexes;
- managed projections reconstruct from lifecycle evidence;
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
an idempotent ensure operation:

1. probe the stable endpoint;
2. verify router identity;
3. start the hidden process only when absent;
4. wait for bounded readiness;
5. register or reconstruct the required route;
6. return the stable URL.

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

- `@narada2/operator-console-contract` now defines the shared surface catalog
  consumed by the CLI workspace page and browser route model.
- `narada console serve` now defaults to the stable loopback port `61729`,
  exposes `/health` and bounded `/routes`, attaches to a matching healthy
  console instance, and refuses foreign port ownership.
- `--port 0` remains an explicitly labeled diagnostic mode.
- Console is still a foreground process and owns direct route handlers; hidden
  singleton process management, dynamic registrations, leases, and backing
  service proxying are not implemented yet.
- Site Operations, Agent Web UI, and NARS still own direct listeners.
- Stable Agent Web UI ports are launcher convention, not package authority.
- NARS correctly publishes ephemeral endpoints through its session index.

## Migration Slices

1. Add the Host/PC Operator Router package, config schema, singleton lock,
   identity probe, health endpoint, and route registry. **Partial:** the
   identity/health/route and stable-port behavior currently lives in the CLI
   console server; the dedicated Host/PC package and hidden process remain.
2. Add strict registrations, leases, process evidence, and reconstruction.
3. Make Agent Web UI base-path aware and verify assets, APIs, WebSockets, and
   artifacts beneath a session prefix.
4. Register Console/Registry and Site Operations projections.
5. Change launcher and CLI open flows to return router URLs.
6. Add Host, Origin, CSRF, route admission, loopback-target, and redaction
   acceptance tests.
7. Keep ephemeral commands as diagnostics and remove stable per-surface ports.

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
