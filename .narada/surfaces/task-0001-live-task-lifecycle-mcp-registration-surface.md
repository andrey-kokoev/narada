# narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0

Status: `mutating_first_slice_registered`
Owner: Narada proper MCP/runtime authority
Task: `narada-proper.task-0002`
Capability declaration: `.narada/capabilities/mcp-surfaces.json`

## Purpose

This surface admits a Narada proper site-local task lifecycle MCP surface descriptor for task-0001.

Task-0004 registered the first live descriptor tool through the existing `narada-mcp` transport: `site_task_lifecycle.plan_init`.

Task-0005 registered the first adapter-bound mutating tool: `site_task_lifecycle.admit_task`.

## Tool Surface

Admitted descriptor tools:

- `site_task_lifecycle.plan_init`
- `site_task_lifecycle.build_admission_contract`
- `site_task_lifecycle.project_inbox_envelope`
- `site_task_lifecycle.build_task_db_init_plan`
- `site_task_lifecycle.build_task_admission_write_request`
- `site_task_lifecycle.build_mcp_runtime_binding_request`
- `site_task_lifecycle.build_receiving_site_setup_plan`
- `site_task_lifecycle.build_live_execution_admission_checklist`

## Live Registration Evidence

Registered live tool:

- `site_task_lifecycle.plan_init`
- `site_task_lifecycle.admit_task`

Evidence:

- `.narada/audit/task-0004-live-mcp-tool-binding-audit.json`
- `.ai/mcp/site-task-lifecycle-mcp.json`

## Mutation Mechanism

`site_task_lifecycle.plan_init` is descriptor-only and does not mutate files or databases.

`site_task_lifecycle.admit_task` mutates only the local target Site task lifecycle DB through the admitted MCP sqlite3 adapter boundary and writes local mutation evidence.

A later MCP mutation task must name:

- the exact adapter-bound mutation tools;
- adapter authority constraints for mutating tools;
- smoke-test evidence;
- unregister rollback evidence.

## Authority Checks

- Mutating tools must remain unavailable until the initializer, concrete adapter, and DB mutation carriers are live-execution admitted.
- Descriptor tools may produce plans, requests, results, and refusal evidence only.
- Source handoff packets remain pending evidence until locally admitted.

## Denied Scope

- Live registration without a Narada proper MCP/runtime authority surface.
- Tools that mutate without admitted adapter authority.
- Importing narada-andrey DB, task, inbox, roster, checkpoint, operator-surface, PC-locus, secret, identity-specific, or source-history state.
- Making `@narada2/site-task-lifecycle` own a SQLite dependency.

## Verification Gate

Capability declaration must list this surface and no longer report `site-local task lifecycle MCP` as missing. Package-local MCP runtime binding tests must pass.

## Rollback Posture

Remove this surface from `.narada/capabilities/mcp-surfaces.json` and preserve the admission/audit records as superseded evidence. If live registration later occurs, unregister only the admitted binding.
