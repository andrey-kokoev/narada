# narada-proper.task-0006

Title: Expose readback task-lifecycle MCP proof tool
Status: `completed_readback_mcp_slice`
Created: 2026-05-10
Source OSM: `osm_20260510_143649_320_8a0032bf`

## Scope

Expose one non-mutating MCP tool:

- `site_task_lifecycle.read_task`

The tool reads a local task row, evidence refs, and admission events from the target Site `.ai/task-lifecycle.db`.

## Boundaries

- No SQLite dependency in `@narada2/site-task-lifecycle`.
- No source-state import.
- No arbitrary SQL.
- No DB mutation.
- Cross-Site read remains allowed only through existing MCP traversal semantics; this slice performs no mutation.

## Terminal Criteria

- [x] `tools/list` includes `site_task_lifecycle.read_task`.
- [x] Live smoke reads `narada-proper.task-0005-smoke`.
- [x] Returned payload includes task row, evidence refs, and admission events.
- [x] Missing task read returns `status=not_found`.
