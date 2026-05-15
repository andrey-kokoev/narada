---
status: in_review
---

# Lift Narada proper MCP handler out of CLI source

## Chapter

mcp-infrastructure

## Goal

Remove the new Narada proper MCP package's residual dependency on packages/layers/cli/src/mcp-server.ts.

## Context

Follow-up from task 1268 report residual. Operator requested: address the residual.

## Required Work

Move or copy MCP handler/registry ownership into packages/narada-proper-mcp so the agent-facing Narada proper MCP runtime no longer imports packages/layers/cli/src/mcp-server.ts; keep launcher path unchanged; preserve tools/list and agent_context_hydrate_current behavior; update audit residuals and focused tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- `packages/narada-proper-mcp/src/server.ts` owns the Narada proper MCP tool registry, JSON-RPC dispatch, site-context resolution, traversal metadata, startup hydration, task/inbox/checkpoint first-slice behavior, and source-import refusal checks.
- Added package-local adapters under `packages/narada-proper-mcp/src/commands` and `packages/narada-proper-mcp/src/lib` rather than importing `packages/layers/cli/src/mcp-server.ts`.
- Repaired the package boundary so `server.ts` imports `@narada2/agent-context-memory` through the workspace package instead of a relative source path.
- Repaired `packages/narada-proper-mcp/tsconfig.json` so package builds emit `dist/main.js` and `dist/index.js` at the paths advertised by `package.json`.

## Verification

- `pnpm install --offline` refreshed workspace links for the new package.
- `pnpm --filter @narada2/agent-context-memory build` passed.
- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp build` passed and produced `packages/narada-proper-mcp/dist/main.js`.
- `pnpm --filter @narada2/narada-proper-mcp test` passed.
- `node packages/narada-proper-mcp/dist/main.js --help` returned the expected command usage.
- `node packages/narada-proper-mcp/dist/main.js ... agent_context_hydrate_current` returned launcher argument evidence without mutation.
- `node --test tools/agent-start/start-agent.test.mjs` passed.

## Acceptance Criteria

- [x] packages/narada-proper-mcp/src no longer imports packages/layers/cli/src/mcp-server.ts.
- [x] Focused MCP package tests and launcher tests pass.
- [x] Audit evidence no longer lists the CLI mcp-server delegation residual.
