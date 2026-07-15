# Operator Console Contract

Shared UI-neutral descriptors for the Narada Operator Console surface catalog.

The contract describes concepts, ownership, authority, projection, intent
admission, routes, and default availability. A runtime projects current
availability into `OperatorSurfaceProjection` records and resolves scoped
authority for live Site, session, and artifact routes. The CLI and browser UI
consume the same catalog; neither owns a second list of operator surfaces.

The `v3` route directory is authoritative for browser workspace handoff. A
surface entry identifies its authority locus, projection owner, intent binding,
and whether it is diagnostic or a replacement for a legacy surface. A consumer
must reject a directory that omits those fields rather than inventing them from
the current URL. The directory and every route also carry explicit host
references, so a route is not silently treated as local when its authority is
Cloudflare-hosted.

The local Operator Console reads `/console/routes`. Cloudflare NARS Projection
uses the same v3 payload at `/api/nars/workspace/routes`, scoped by
`projection_id` and protected by the projection's browser capability. Cloudflare
route publication is a bridge-owned lifecycle operation; the browser can read
the resulting descriptors but cannot register or revoke them.

The same package carries the redacted `OperatorSessionWireRecord` contract used
by the read-only Agent Session inventory. Session authority remains in the NARS
session index; the console contract does not grant lifecycle control.
