# task-0003 Live Setup Execution Admission

Decision id: `narada-proper.admission.task-0003.live-setup-execution`
Task id: `narada-proper.task-0003`
Inbound OSM: `osm_20260510_141620_083_98aa2fc4`
Decision: `admitted_partial_live_execution_increment`
Recorded: 2026-05-10

## Decision

Admit a bounded live execution increment under Narada proper authority.

Admitted:

- initializer execution under `D:\code\narada`;
- concrete adapter activation using Windows `sqlite3.exe` outside `@narada2/site-task-lifecycle`;
- DB mutation through that adapter into `.ai/task-lifecycle.db`;
- file-backed MCP capability evidence plus transport smoke test of the available `narada-mcp` facade.

Not admitted:

- narada-andrey state import;
- source task/inbox/DB/history import;
- package-owned SQLite dependency;
- treating file-backed capability evidence as proof that the existing generic `narada-mcp` server exposes `site_task_lifecycle.*` tools unless tool-list smoke confirms it.

## Authority and Command Surface

Execution harness: `.narada/execution/task-0003/live-setup.ts`

Allowed command:

`pnpm exec tsx .narada/execution/task-0003/live-setup.ts`

Concrete adapter command surface inside the harness:

`sqlite3.exe .ai/task-lifecycle.db <statement-or-query>`

MCP smoke command:

`node_modules\.bin\narada-mcp.cmd --site-root D:\code\narada --site-id narada-proper`

## Evidence Required

- `.narada/execution/task-0003/result.json`
- `.ai/site-task-lifecycle-admission.json`
- `.ai/task-lifecycle.db` readback
- `.ai/mcp/site-task-lifecycle-mcp.json`
- MCP tool-list smoke result
- `.narada/audit/task-0003-live-setup-execution-audit.json`

## Terminal Claim Rule

Terminal live Site setup is claimable only if initializer, adapter, DB mutation, and MCP transport all verify.

If the current MCP server does not expose `site_task_lifecycle.*` tools, this task may complete a partial live execution increment but must report terminal setup as not claimable.
