# @narada2/mcp-fabric

Package-owned MCP fabric loader and projection helpers used by Narada carriers.

## Authority

This package owns carrier-side MCP fabric loading and projection for Narada
carriers.

Canonical source:

```text
D:\code\narada\packages\mcp-fabric\src\mcp-fabric.mjs
```

`@narada2/agent-cli` imports this package source for interactive `agent-cli` and
Agent Runtime Server mode. Site-local launcher code may point at a Site `.ai\mcp` fabric,
but it must not fork MCP fabric parsing or projection behavior.

## Source of truth and regeneration

The Site binding authority is `.narada/capabilities/mcp-surfaces.json`.
Carrier/client projections are disposable outputs: regenerate them from that
registry with:

```powershell
pnpm --filter @narada2/typed-mcp-surface exec node src/generate-carrier-mcp-config.mjs --site-root <site-root> --carrier all --write
```

Use the same command with `--check` to verify generated files without writing.
The loader's registry validation also rejects stale server names in `.ai\mcp`
files, so renamed bindings are repaired by regeneration rather than hand edits.

## Boundary

This package describes available MCP servers and tool metadata. It does not grant
mutation authority. Non-read-only tool requests still cross the Carrier Action
Admission Boundary before consequence.

## Fabric and server lifecycle

The loader and doctor expose `narada.mcp.fabric.lifecycle_state.v1` evidence.
The fabric loader moves `discovered -> loaded`. Each server probe moves through
`loaded -> starting -> ready -> closing -> closed`, with explicit
`start_failed`, `probe_failed`, and `close_failed` paths. Probe results include
the current `lifecycle_state` and `lifecycle_history`.

These states describe loading and probing evidence only. They do not grant MCP
tool authority or replace the carrier action-admission boundary.

## Verification

```powershell
pnpm --filter @narada2/mcp-fabric test
pnpm --filter @narada2/mcp-fabric typecheck
```
