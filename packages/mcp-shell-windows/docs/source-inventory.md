# MCP Shell Windows Source Inventory

Task: `narada-proper.task-0030`

This inventory records external orientation evidence used for the package-local shell MCP boundary contract. The evidence is not Narada proper truth and does not admit narada-andrey runtime state or shell execution authority.

## Considered Evidence

- `narada-andrey:kb/operations/shell-filesystem-mcp-boundaries.md`
- `narada-andrey:tools/mcp-servers/shell/shell-mcp-server.mjs`
- `narada-andrey:tools/mcp-servers/shell/shell-mcp-server.test.mjs`
- `narada-andrey:tools/mcp-servers/shell/scoped-index-commit-guard.test.mjs`
- `narada-andrey:tools/mcp-servers/shell/closeout-volatile-projection-boundary.test.mjs`

## Lifted

- Boundary vocabulary separating filesystem MCP, shell MCP, Git shell tools, and domain MCP surfaces.
- Descriptor-only policy result shape that never executes a command or grants live shell authority.
- Refusal guards for raw WSL crossing, arbitrary process kill patterns, source Site runtime imports, and credentials.
- Warning posture for using shell command execution where filesystem MCP should handle repository text reads/writes.

## Refused

- Live shell MCP server implementation.
- Narada-andrey roster, path policy, task lifecycle, inbox, closeout state, shell allowlists, command history, Git remotes, credentials, and runtime logs.
- Native shell fallback and arbitrary process kill authority.

## Package Claim

`@narada2/mcp-shell-windows` now carries descriptor/contracts/tests for deciding shell MCP boundary posture. A receiving Site must still admit its own live shell carrier, path policy, Git mutation authority, and audit mechanism.
