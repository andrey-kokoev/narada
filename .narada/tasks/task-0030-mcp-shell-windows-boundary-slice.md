# narada-proper.task-0030: Deepen MCP Shell Windows Boundary Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027`
- Source evidence:
  - `C:\Users\Andrey\Narada\kb\operations\shell-filesystem-mcp-boundaries.md`
  - `C:\Users\Andrey\Narada\tools\mcp-servers\shell\shell-mcp-server.mjs`
  - `C:\Users\Andrey\Narada\tools\mcp-servers\shell\shell-mcp-server.test.mjs`
  - `C:\Users\Andrey\Narada\tools\mcp-servers\shell\scoped-index-commit-guard.test.mjs`
  - `C:\Users\Andrey\Narada\tools\mcp-servers\shell\closeout-volatile-projection-boundary.test.mjs`

The source files are external orientation evidence only. Narada proper admits descriptor/contracts/tests for shell MCP boundary decisions, not a live shell server or source Site policy state.

## Goal

Deepen `@narada2/mcp-shell-windows` with:

- typed shell MCP boundary request/decision descriptors;
- ownership classification across filesystem MCP, shell MCP Git tools, domain MCP, and refusal;
- guards for raw WSL crossing, process-kill patterns, source Site runtime import, and credentials;
- source inventory documentation;
- neutral tests proving descriptor-only/no-execution posture.

## Non-Goals

- No live shell MCP server implementation.
- No shell command execution.
- No Git mutation.
- No source Site roster, path policy, task/inbox, closeout, command history, remotes, credentials, or logs.
- No native shell fallback.

## Verification

- `pnpm --dir packages/mcp-shell-windows test`
- `pnpm --dir packages/mcp-shell-windows typecheck`
- `pnpm --dir packages/mcp-shell-windows build`

## Closeout

- Audit: `.narada/audit/task-0030-mcp-shell-windows-boundary-slice-audit.json`
