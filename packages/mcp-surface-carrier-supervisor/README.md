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

## First Slice

The first slice exposes typed status projection for these lifecycle states:

- `stale`
- `restart_requested`
- `carrier_restarted`
- `live_verified`

Restart/rebind is represented as request/evidence data only. A receiving Site must admit a separate carrier/supervisor execution surface before any live restart, rebind, or process mutation can occur.
