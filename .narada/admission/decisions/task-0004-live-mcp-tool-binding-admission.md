# task-0004 Live MCP Tool Binding Admission

Decision id: `narada-proper.admission.task-0004.live-mcp-tool-binding`
Task id: `narada-proper.task-0004`
Decision: `admitted_minimal_source_increment`
Recorded: 2026-05-10

## Decision

Admit a minimal Narada proper MCP facade source change to expose `site_task_lifecycle.plan_init` through the existing `narada-mcp` transport.

## Authority Basis

- Task-0002 admitted `narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0`.
- Task-0003 created local root init, adapter, DB mutation, and MCP capability evidence, but generic MCP transport smoke proved the task lifecycle tool was missing.
- The current coordination request asks to continue until the receiving Site has live admitted task-lifecycle functionality without importing narada-andrey state.

## Scope Admitted

Allowed package/source scope:

- `packages/layers/cli/src/mcp-server.ts`
- `packages/layers/cli/test/commands/mcp-server.test.ts`

The binding is descriptor-only and may not mutate task lifecycle state.

## Scope Refused

- No MCP DB mutation tool in this increment.
- No source Site DB/history import.
- No narada-andrey runtime DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets/identity state import.
- No SQLite dependency added to `@narada2/site-task-lifecycle`.

## Terminal Criterion

The task can claim initial live task-lifecycle MCP functionality only if `narada-mcp` lists `site_task_lifecycle.plan_init` and a live `tools/call` returns a path plan for Narada proper.
