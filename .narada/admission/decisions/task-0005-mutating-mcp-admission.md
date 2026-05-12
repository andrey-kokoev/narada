# task-0005 Mutating Task-Lifecycle MCP Admission

Decision id: `narada-proper.admission.task-0005.mutating-task-lifecycle-mcp`
Task id: `narada-proper.task-0005`
Inbound OSM: `osm_20260510_142839_058_af43c473`
Decision: `admitted_single_mutating_tool`
Recorded: 2026-05-10

## Decision

Admit one mutating task-lifecycle MCP tool:

- `site_task_lifecycle.admit_task`

## Scope

The tool may:

- initialize the simple task-lifecycle tables used by the site-task-lifecycle first slice;
- insert or idempotently preserve one admitted task record;
- insert evidence refs and an admission event;
- write a local mutation-evidence JSON artifact.

The tool may not:

- import narada-andrey DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets/identity/source-history state;
- mutate a cross-Site target;
- expose arbitrary SQL;
- add a SQLite dependency to `@narada2/site-task-lifecycle`;
- claim package-owned SQLite mutation.

## Terminal Criterion

The mutating MCP slice is claimable only when live MCP smoke proves:

- `tools/list` exposes `site_task_lifecycle.admit_task`;
- `tools/call` inserts a local row;
- DB readback confirms the row;
- denied source-state refs are refused before mutation.
