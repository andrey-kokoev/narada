# narada-proper.task-0004

Title: Expose site task-lifecycle descriptor tool through live Narada MCP
Status: `completed_initial_live_mcp_tool_binding`
Created: 2026-05-10
Source task: `narada-proper.task-0003`

## Authority Basis

Task-0003 executed root initialization, concrete sqlite3 adapter activation, and DB mutation, but MCP smoke showed the generic `narada-mcp` transport did not expose `site_task_lifecycle.*` tools.

This task admits a minimal Narada proper source change to the generic MCP facade so the already-admitted task lifecycle surface is visible through live MCP transport.

## Goal

Expose and smoke-test one safe descriptor tool:

- `site_task_lifecycle.plan_init`

The tool must not mutate files, write DBs, import source Site state, or grant narada-andrey authority.

## Changed-File Scope

Allowed package/source scope:

- `packages/layers/cli/src/mcp-server.ts`
- `packages/layers/cli/test/commands/mcp-server.test.ts`

Allowed evidence scope:

- `.narada/tasks/task-0004-live-task-lifecycle-mcp-tool-binding.md`
- `.narada/admission/decisions/task-0004-live-mcp-tool-binding-admission.md`
- `.narada/audit/task-0004-live-mcp-tool-binding-audit.json`
- append-only `.narada/admission/admission-ledger.jsonl`

## Non-Goals

- No live DB mutation through MCP in this increment.
- No narada-andrey state import.
- No source history import.
- No package-owned SQLite dependency in `@narada2/site-task-lifecycle`.

## Verification Checklist

- [x] `tools/list` includes `site_task_lifecycle.plan_init`.
- [x] `tools/call site_task_lifecycle.plan_init` returns local paths for `D:\code\narada`.
- [x] CLI MCP tests cover the new tool.
- [x] Package-local and CLI MCP-focused tests pass.

## Closeout

Initial terminal task-lifecycle setup is claimable for the admitted first slice: root init, sqlite3 adapter/DB mutation, and a live descriptor MCP tool are proven.

Mutating task lifecycle MCP tools remain intentionally refused until a later task admits adapter-bound mutation over MCP.
