# @narada2/mcp-surface-carrier-supervisor

Read-only descriptor contracts for observing MCP surface carrier lifecycle without letting a stdio MCP server restart itself.

The package models the boundary between:

- Site authority
- MCP process
- carrier/session
- runtime registry
- restart request
- verification evidence
- Capability Lifecycle projection

It does not kill processes, restart carriers, bind operator surfaces, mutate runtime registries, import source Site state, or provide native shell fallback.

## Lifecycle contracts

The package exposes typed status projection and transition guards for the
surface/carrier continuity lifecycle:

- `stale`
- `restart_requested`
- `carrier_restarted`
- `live_verified`

The schema is `narada.mcp.surface_carrier.lifecycle_state.v1`. Normal progress is
`stale -> restart_requested -> carrier_restarted -> live_verified`; stale or
restart-requested evidence may be recorded again when verification regresses.

Capability maturity is projected separately under
`narada.capability.lifecycle_state.v1`:

`observed -> named -> designed -> implemented -> cataloged -> mcp_exposed -> admitted -> trialed -> in_use`

`blocked -> observed` is the documented recovery path. `admitted` here is
lifecycle evidence, not a runtime grant. Runtime capability admission remains
owned by `@narada2/nars-capability-gateway`.

Restart/rebind is represented as request/evidence data only. The package is
read-only: it never kills processes, restarts carriers, rebinds surfaces, or
mutates runtime registries. A receiving Site must admit a separate execution
surface before any such operation can occur.
