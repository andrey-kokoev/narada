# Task 1252 Agent-Context Memory Live First Slice Admission

Decision: `admitted_first_slice_local_json_store_mcp`

Site: `narada-proper`

Authority root: `D:\code\narada`

Carrier: `narada-proper.carrier.agent-context-memory.local-json-store.v0`

Surface: `narada-proper.surface.agent-context-memory.live-first-slice-mcp.v0`

## Admitted Scope

- Expose `agent_context_memory.plan_hydration` through Narada proper `narada-mcp`.
- Expose `agent_context_memory.record_checkpoint` through Narada proper `narada-mcp`.
- Expose `agent_context_memory.read_checkpoint_summary` through Narada proper `narada-mcp`.
- Persist checkpoint summaries only to `.narada/agent-context-memory/memory-store.json`.
- Write mutation evidence only under `.ai/mutation-evidence/agent_context_memory/`.

## Boundary

The package `@narada2/agent-context-memory` remains descriptor/contract oriented. The CLI runtime layer owns the local JSON store carrier for this first slice.

## Not Admitted

- Runtime hydration execution.
- Live SQLite mutation for agent-context memory.
- Package-owned SQLite dependency.
- Source Site checkpoint history import.
- Source Site agent-context DB import.
- Narada-andrey task, inbox, roster, checkpoint, operator-surface, PC-locus, secret, credential, or identity-specific runtime state import.
- Cross-Site mutation.

## Verification Required

- Package typecheck passes.
- CLI typecheck passes.
- MCP server tests prove tools/list, `plan_hydration`, `record_checkpoint`, `read_checkpoint_summary`, and denied source-state refusal.
- Live `narada-mcp` smoke in task 1253 proves the built CLI exposes the tools.
