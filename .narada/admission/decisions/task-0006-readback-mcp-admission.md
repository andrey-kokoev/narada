# task-0006 Readback MCP Admission

Decision id: `narada-proper.admission.task-0006.readback-mcp`
Task id: `narada-proper.task-0006`
Inbound OSM: `osm_20260510_143649_320_8a0032bf`
Decision: `admitted_non_mutating_readback_tool`
Recorded: 2026-05-10

## Decision

Admit `site_task_lifecycle.read_task` as a non-mutating MCP proof/readback tool.

## Scope

The tool may read:

- `task_records`;
- `task_evidence_refs`;
- `task_admission_events`.

The tool may not expose arbitrary SQL, import source state, or mutate the DB.
