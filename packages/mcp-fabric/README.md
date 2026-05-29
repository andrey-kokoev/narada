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
NARS server mode. Site-local launcher code may point at a Site `.ai\mcp` fabric,
but it must not fork MCP fabric parsing or projection behavior.

## Boundary

This package describes available MCP servers and tool metadata. It does not grant
mutation authority. Non-read-only tool requests still cross the Carrier Action
Admission Boundary before consequence.

## Verification

```powershell
pnpm --filter @narada2/mcp-fabric test
pnpm --filter @narada2/mcp-fabric typecheck
```
