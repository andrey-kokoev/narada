---
status: closed
amended_by: narada.architect
amended_at: 2026-05-13T01:53:17.605Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T01:58:23.072Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T01:58:23.617Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Implement agent-context memory MCP first slice

## Chapter

narada-proper-agent-context-memory-live-adoption

## Goal

Expose minimal agent_context_memory MCP tools backed by Narada proper local JSON store.

## Context

Chapter: narada-proper-agent-context-memory-live-adoption. The package exists in packages/agent-context-memory; .narada has descriptor candidate and local empty store. This task also records the local carrier/surface admission before implementation because the originally intended separate admission task creation collided with the lifecycle DB.

## Required Work

Update the CLI MCP server to list and handle agent_context_memory.plan_hydration, agent_context_memory.record_checkpoint, and agent_context_memory.read_checkpoint_summary; persist only to .narada/agent-context-memory/memory-store.json; refuse source Site runtime/checkpoint/DB/secrets refs; add tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by narada.architect at 2026-05-13T01:52:40.248Z: context, appended criteria
- Amended by narada.architect at 2026-05-13T01:53:17.605Z: dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] tools/list includes the three first-slice agent-context-memory tools
- [x] record_checkpoint writes local store and mutation evidence
- [x] read_checkpoint_summary returns readback without mutation
- [x] source-state import refs are refused before mutation
- [x] Carrier/surface admission evidence exists before live MCP claim
