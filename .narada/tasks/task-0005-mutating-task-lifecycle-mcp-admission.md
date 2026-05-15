# narada-proper.task-0005

Title: Admit mutating task-lifecycle MCP first slice
Status: `completed_mutating_mcp_first_slice`
Created: 2026-05-10
Source OSM: `osm_20260510_142839_058_af43c473`

## Authority Basis

Task-0004 proved initial live descriptor MCP functionality for `site_task_lifecycle.plan_init`.

The current OSM asks for a separate admission for mutating task-lifecycle MCP tools. This task admits exactly one adapter-bound mutating tool:

- `site_task_lifecycle.admit_task`

## Authority Gates

- Mutations are allowed only against the resolved local target Site root.
- Cross-Site MCP mutation remains refused by the existing MCP traversal guard.
- Source refs and evidence refs are refusal-checked for source DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets state.
- The tool writes through the Narada proper MCP adapter boundary, not through `@narada2/site-task-lifecycle`.

## Adapter/DB Boundary

Adapter id: `narada-proper.adapter.task-0005.mcp-sqlite3-cli.v0`

DB path: `.ai/task-lifecycle.db`

The MCP server executes SQLite mutation as the live adapter surface. `@narada2/site-task-lifecycle` remains adapter-interface-only, owns no SQLite dependency, and executes no SQLite mutation.

The row written by `site_task_lifecycle.admit_task` is an inert admission record. It does not create a canonical governed task markdown file, SQLite lifecycle assignment, or `work-next` claimability. A separate governed materialization/promotion step must turn the admitted candidate into canonical task lifecycle work before Builder or Architect queues can claim it.

## Rollback

Rollback for the smoke task is bounded to rows created by `site_task_lifecycle.admit_task` and the matching mutation evidence artifact.

## Terminal Criteria

- [x] `tools/list` includes `site_task_lifecycle.admit_task`.
- [x] A live `tools/call site_task_lifecycle.admit_task` inserts a local task row.
- [x] DB readback confirms the row.
- [x] Mutation evidence is written.
- [x] Refusal test proves denied source-state refs do not write.

## Closeout

The mutating MCP first slice is live for exactly one tool: `site_task_lifecycle.admit_task`.

Additional mutating task lifecycle tools remain out of scope.
