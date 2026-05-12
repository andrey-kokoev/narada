# narada-proper.task-0003

Title: Execute admitted task-0001 live task-lifecycle setup increment
Status: `partial_live_execution_completed_mcp_tool_binding_blocked`
Created: 2026-05-10
Source OSM: `osm_20260510_141620_083_98aa2fc4`

## Authority Basis

This task follows `narada-proper.task-0002`, which admitted the descriptor carriers and capability surface for task-0001:

- `narada-proper.carrier.task-0001.initializer-execution.v0`
- `narada-proper.carrier.task-0001.concrete-adapter.v0`
- `narada-proper.carrier.task-0001.db-mutation.v0`
- `narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0`

The current OSM asks for the separate live execution task for root init, real adapter activation, DB mutation, and MCP transport smoke test.

## Goal

Execute one coherent live setup increment:

- initialize Narada proper task lifecycle paths under `D:\code\narada`;
- activate a concrete adapter outside `@narada2/site-task-lifecycle`;
- create/mutate the local task lifecycle DB through that adapter;
- register local MCP capability evidence and smoke-test the available Narada MCP transport.

## Admitted Root

Root: `D:\code\narada`

Admitted writes for this task only:

- `.ai/site-task-lifecycle-admission.json`
- `.ai/task-lifecycle.db`
- `.ai/mcp/site-task-lifecycle-mcp.json`
- `.narada/execution/task-0003/*`
- `.narada/audit/task-0003-live-setup-execution-audit.json`
- append-only `.narada/admission/admission-ledger.jsonl`

## Concrete Adapter

Adapter id: `narada-proper.adapter.task-0003.sqlite3-cli.v0`

Mechanism: Windows `sqlite3.exe`, invoked by `.narada/execution/task-0003/live-setup.ts`.

The adapter is outside `@narada2/site-task-lifecycle`. The package remains adapter-interface-only and owns no SQLite dependency.

## Non-Goals

- No narada-andrey DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets/identity state import.
- No source history import.
- No package-owned SQLite dependency.
- No direct DB mutation from `@narada2/site-task-lifecycle`.
- No claim that `site_task_lifecycle.*` is exposed by the existing generic `narada-mcp` server unless smoke evidence proves it.

## Verification Checklist

- [x] Initializer manifest exists and records rejected source imports.
- [x] `.ai/task-lifecycle.db` exists.
- [x] SQLite readback confirms schema and local admitted task row.
- [x] MCP smoke test confirms current generic `narada-mcp` transport behavior.
- [x] MCP smoke test confirms `site_task_lifecycle.*` tools are not yet exposed by the generic transport.
- [x] Package-local typecheck and tests still pass.
- [x] Audit records changed files/state and remaining blockers.

## Closeout

Initializer execution, sqlite3 adapter activation, DB schema mutation, and local task admission write completed.

Terminal live Site setup is not claimable because the existing `narada-mcp` transport does not yet expose the admitted `site_task_lifecycle.*` tool surface.

## Rollback Posture

Remove only files created by this task if rollback is requested before further dependent mutations:

- `.ai/site-task-lifecycle-admission.json`
- `.ai/task-lifecycle.db`
- `.ai/mcp/site-task-lifecycle-mcp.json`
- `.narada/execution/task-0003/*`

Preserve `.narada` task/admission/audit/ledger evidence as superseded records.
