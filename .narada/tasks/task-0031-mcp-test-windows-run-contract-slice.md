# narada-proper.task-0031: Deepen MCP Test Windows Run Contract Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027`
- Source evidence:
  - `C:\Users\Andrey\Narada\tools\mcp-servers\test\test-mcp-server.mjs`
  - `C:\Users\Andrey\Narada\tools\mcp-servers\test\test-mcp-server.test.mjs`
  - `C:\Users\Andrey\Narada\tools\mcp-smoke-test.mjs`
  - `C:\Users\Andrey\Narada\tools\mcp-smoke-test.test.mjs`

The source files are external orientation evidence only. Narada proper admits descriptor/contracts/tests for test run planning, not live test execution or source Site test history.

## Goal

Deepen `@narada2/mcp-test-windows` with:

- typed test registry entry descriptors;
- test run request/decision descriptors;
- approval-path and timeout refusal guards;
- receiving-Site evidence posture;
- source inventory documentation;
- neutral tests proving descriptor-only/no-import behavior.

## Non-Goals

- No live Test MCP server implementation.
- No test process execution.
- No source pass/fail import.
- No bound-agent roster, path policy, runtime log, or credential import.
- No shell fallback.

## Verification

- `pnpm --dir packages/mcp-test-windows test`
- `pnpm --dir packages/mcp-test-windows typecheck`
- `pnpm --dir packages/mcp-test-windows build`

## Closeout

- Audit: `.narada/audit/task-0031-mcp-test-windows-run-contract-slice-audit.json`
