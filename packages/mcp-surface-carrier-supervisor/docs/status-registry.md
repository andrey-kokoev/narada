# MCP Surface Carrier Supervisor Status Registry

The status registry is read-only. It answers what the receiving Site can currently prove about an MCP surface and its external carrier.

## Invariant

A stdio MCP server must not self-restart. Restart and rebind belong to an external carrier or supervisor admitted by the Site authority.

## Capability Lifecycle Composition

- `observed`: an MCP surface or process is seen but not admitted.
- `named`: the surface has a stable local identifier.
- `implemented`: descriptor/status projection code exists.
- `cataloged`: a Site records the surface in a local capability or MCP catalog.
- `mcp_exposed`: a live MCP transport exposes the surface.
- `admitted`: Site authority admits the carrier/supervisor relationship.
- `trialed`: restart/rebind or smoke verification is executed under an admitted carrier.
- `in_use`: operators or agents rely on the surface for ordinary work.
- `blocked`: required carrier, registry, authority, or verification evidence is missing.

This package reaches `implemented` for read-only descriptor projection only.

## Refusals

The package refuses arbitrary process kill, stdio self-restart, native shell fallback, live carrier restart, live rebind, runtime registry mutation, PC-locus state import, and operator-surface runtime copying.
