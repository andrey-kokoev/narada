# Narada Operator Workspace Target

## Status

This document defines the browser experience that sits above individual
operator surfaces. It is an implementation target and a boundary contract.
The typed Workspace route directory is live at the Console projection's
`/console/routes` endpoint, and persistent launcher ingress validates it before
returning a stable route. Router-backed Console instances compose live Site
Operations, Agent Web UI session, and artifact leases into that directory.
The `v3` directory is authoritative for browser handoff: every surface declares
its authority locus, projection owner, intent binding, and diagnostic/legacy
posture. Consumers reject incomplete entries rather than inferring ownership
from a URL or the browser's current directory.
The Vue console consumes the directory for navigation and concrete session
links; broader browser acceptance remains.

Cloudflare NARS Projection now hosts the same directory contract through its
`NarsWorkspaceDirectory` Durable Object. Local projection bridges publish and
revoke explicit route leases; the Worker projects the leases into the shared
v3 directory and serves Cloudflare-hosted session documents from those leases.
The directory is projection-scoped: browser reads require the projection's
browser capability and `projection_id`, while lease publication and revocation
require the bridge capability. The directory contains descriptors and redacted
bindings only; browser tokens are used for authorization and are never emitted
in the directory response.

## Shape

The layers are intentionally distinct:

    Operator Surface
        abstract contract for a governed operator-facing projection

    Operator Workspace
        composed browser experience with shared context and navigation

    Operator Router
        stable host-local ingress and bounded reachability for backing surfaces

    Launcher Session Dashboard, Site Operations, Site Registry, Agent Web UI, and Artifacts
        domain-owned projections behind the workspace and router

The Workspace composes projections. It is not a second authority for Sites,
tasks, sessions, artifacts, or MCP policy. The Router composes reachability. It
is not a domain router and does not grant effect authority.

Each route-directory surface has four independent bindings:

- `authority`: the owner of truth and mutation admission;
- `projection`: the code that materializes the operator view;
- `intent`: the governed channel through which the view may request action;
- `diagnosticOnly` / `legacyReplacement`: whether the route is normal UX or a
  bounded compatibility/diagnostic path.

## Normal Ingress

The normal browser experience has one host-local origin supplied by the
Operator Router:

    http://127.0.0.1:<operator-router-port>

The canonical route families are:

| Route | Projection | Scope |
| --- | --- | --- |
| `/` | Workspace entry | Surface directory routing to the next-level projections. |
| `/sites/<site-id>/operations/*` | Site Operations | Local Site task, assignment, review, and agent projection. |
| `/console/registry` | Site Registry | User Site cross-Site inventory and governed management. |
| `/sessions/<session-id>/*` | Agent Web UI | One NARS session, identified by session id. |
| `/artifacts/<session-id>/<artifact-id>/*` | Artifact projection | One session-owned artifact. |

`/health` and `/routes` belong to the Router and expose bounded, redacted
diagnostics. Low-level `serve` commands may still expose ephemeral direct URLs,
but those URLs are diagnostic and must be labelled as such.

Cloudflare Workspace routes use the Worker origin as `workspaceHost`. The
directory API is `/api/nars/workspace/routes?projection_id=<id>` and its health
endpoint is `/api/nars/workspace/health`. A registered session route such as
`/sessions/<session-id>` is served only while its lease is active and healthy;
the Worker injects the lease's private session configuration into the static
session document. An unqualified `/` redirects to the Cloudflare Console
entrypoint, while `/?cloudflare_projection_id=<id>` remains the explicit direct
projection entrypoint for existing Agent Web UI callers.

## Workspace Responsibilities

The Workspace owns only composition concerns:

- current operator, Site, session, and artifact context;
- persistent navigation, breadcrumbs, return paths, and route-aware links;
- a bounded summary of readiness, attention, and projection availability;
- consistent loading, unavailable, stale, and degraded states;
- a common visual shell and accessibility contract.

The Workspace must not:

- duplicate or reinterpret domain truth;
- mutate a Site, task, session, artifact, or MCP policy directly;
- infer Site ownership from the browser current directory;
- make a dead link look like an available projection;
- expose a route until its owner has been explicitly registered and health
  verified.

## Scope And Navigation

Each page declares its scope explicitly as a tuple:

    operator, site_id?, session_id?, artifact_id?

The normal navigation flow is:

1. Workspace -> Launcher Session Dashboard when a new agent launch is needed.
2. Workspace Site Registry -> select a Site -> Site Operations.
3. Site Operations item -> a session route when a live session exists.
4. Session route -> session-owned artifact route or the originating Site view.
5. Registry remains User Site inventory; it does not become task authority.

Every transition preserves a bounded return path. A missing or expired backing
projection renders an unavailable state with its evidence and recovery action;
it does not silently redirect to an unrelated Site or session.

## Registry UX Boundary

The Registry landing page is an inventory and inspection surface. It shows the
canonical Site list, filters, record detail, and read-only discovery preview.
Creating a Site is a separate `/console/registry/add` workflow. Mutation
forms must not compete with inventory scanning on the landing page.

Edit, retire, restore, and purge are governed mutation workflows and may be
entered from an explicit Site action or a dedicated change route. Every
mutation remains plan-then-confirm and is owned by the Registry management
gateway.

## Truth And Failure States

The Workspace distinguishes:

- workspace/router unavailable;
- projection not registered;
- projection registered but health-check failed;
- projection stale or reconstructing;
- projection ready;
- domain data unavailable after a ready projection.

These are presentation states. The underlying owner remains authoritative for
the reason and remediation. Diagnostics contain route identity and bounded
evidence, never credentials, raw message bodies, or arbitrary local paths.

## Current Implementation Slice

The Console server is the first composed local workspace host. Its root serves
a read-only surface directory and exposes the Registry through the dedicated
Operator Router. The existing task and agent dashboard is now available as a
Site-scoped projection at `/sites/<site-id>/operations/` when started with
`narada workbench serve --site-id <site-id>`; port 0 remains its direct
diagnostic mode.

The Launcher Session Dashboard is a separate Vue/shadcn presentation package
served by the CLI launcher. Its launch authority, dashboard records, and
browser API remain CLI-owned. Agent Web UI attach now returns a stable session
route. The Console Workspace catalog now exposes typed per-route availability,
including concrete routes and non-linkable parameterized templates. Agent Web
UI and Site Operations use the shared owner-side reconstruction contract for
absent or stale route sets; the launcher selection page and session inventory
now require the live Workspace route directory for stable handoff. In Router
mode the Workspace landing page chooses a healthy concrete route when one
exists.

The remaining Router/workspace work is explicit:

1. complete Host, Origin, CSRF, and browser mutation acceptance coverage;
2. migrate any remaining artifact open flows to stable URLs and route
   inventory, including browser acceptance for artifact content links.
3. add the authenticated Cloudflare Workspace consumer configuration that
   lets the shared Console UI read a projection-scoped directory from its
   Cloudflare origin; the consumer must preserve the same authority,
   projection, intent, and diagnostic bindings used by the local Console
   directory.

Direct low-level Workbench, Console, Agent Web UI, and NARS listeners remain
supported only as explicitly labeled diagnostic paths; normal projection
commands use the stable router.

## Acceptance Invariants

1. The normal operator starts from one bookmarkable Workspace origin.
2. Registry inventory and Site creation are separate workflows and URLs.
3. Workspace navigation never bypasses projection ownership or policy.
4. Route links are explicit, scope-preserving, and health-aware.
5. Session links use canonical NARS session ids, not agent ids.
6. A backing failure is visible and actionable, not silently substituted.
7. Direct ephemeral servers remain diagnostics rather than normal UX.

## Related Contracts

- [Operator Router Target](operator-router-target.md)
- [Operator Surface](../concepts/operator-surface.md)
- [Agent Web UI Architecture](agent-web-ui-architecture.md)
- [Operator Console Site Registry](../concepts/operator-console-site-registry.md)
