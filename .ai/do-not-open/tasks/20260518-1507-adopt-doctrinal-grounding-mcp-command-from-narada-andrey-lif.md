---
status: confirmed
deferred_by: narada.architect
deferred_at: 2026-05-18T12:54:05.890Z
defer_reason: Implementation is blocked until narada-andrey provides the requested lift package for agent_context_doctrinal_grounding; request is admitted in narada-andrey inbox as env_d457dc1f-3d3f-4844-bc34-83bfa3596c85.
unblock_condition: Process narada-andrey response containing the bounded doctrine-grounding MCP lift package, then unblock task 1507 for implementation.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-18T13:00:04.183Z
  evidence: Task 1416 already implemented the local doctrine grounding refs lift slice, and Kevin supplied the target canonical command contract: agent_context_doctrinal_grounding(mode: reground, optional doctrine_ids).
  rationale: The remaining work is local reconciliation: replace narada_doctrine_grounding_refs with agent_context_doctrinal_grounding and adapt output/tests to the canonical agent-context contract.
  previous_unblock_condition: Process narada-andrey response containing the bounded doctrine-grounding MCP lift package, then unblock task 1507 for implementation.
unblocked_by: narada.architect
unblocked_at: 2026-05-18T13:00:04.183Z
unblock_evidence: Task 1416 already implemented the local doctrine grounding refs lift slice, and Kevin supplied the target canonical command contract: agent_context_doctrinal_grounding(mode: reground, optional doctrine_ids).
unblock_rationale: The remaining work is local reconciliation: replace narada_doctrine_grounding_refs with agent_context_doctrinal_grounding and adapt output/tests to the canonical agent-context contract.
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-18T13:04:21.829Z
criteria_proof_verification:
  state: unbound
  rationale: Fresh Narada proper MCP process exposes agent_context_doctrinal_grounding; mode=reground returns bounded doctrine grounding with posture summary, doctrine catalog, CCC coordinates, IAS mapping, and review protocol; focused MCP tests cover default output, filtering, and private Inquiry Space refusal.
no_continuation_needed_rationale: Task scope is complete: canonical MCP command replaced the old surface, tests/build pass, and fresh-process tool discovery/readback were verified.
closed_at: 2026-05-18T13:05:07.878Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
confirmed_by: narada.architect
confirmed_at: 2026-05-18T13:05:13.292Z
---

# Adopt doctrinal grounding MCP command from narada-andrey lift package

## Chapter

Doctrinal Grounding MCP Parity

## Goal

Add a Narada proper MCP doctrine-grounding command equivalent to narada-andrey's `agent_context_doctrinal_grounding(mode: "reground")` once the requested lift package arrives.

## Context

Narada proper currently exposes `agent_context_hydrate_current` but not `agent_context_doctrinal_grounding`. narada-andrey.Kevin reported their canonical MCP doctrine-grounding command and a request for a bounded lift package was submitted to narada-andrey as inbox envelope env_d457dc1f-3d3f-4844-bc34-83bfa3596c85.

## Required Work

1. Wait for or retrieve narada-andrey's lift package for `agent_context_doctrinal_grounding`. 2. Inspect the package for command contract, schema/output shape, doctrine catalog source, CCC/IAS/review-protocol mapping, tests/fixtures, and bootstrap adjacency. 3. Implement the Narada proper MCP command without importing private narada-andrey data. 4. Add focused tests proving default reground output and optional `doctrine_ids` filtering. 5. Verify MCP tool discovery exposes the command and record readback evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Replaced the old `narada_doctrine_grounding_refs` MCP surface with `agent_context_doctrinal_grounding`.
- Added the canonical `mode: "reground"` input contract plus optional `doctrine_ids`, `question`, and guarded `require_inquiry_space_data` handling.
- Returned a read-only grounding packet with posture summary, doctrine catalog, doctrine filtering, CCC coordinates, IAS mapping, review protocol, authority limits, and telemetry proof-case refs.
- Updated MCP surface registry coverage, focused tests, and product documentation.
- Current Codex session deferred tool metadata still reflects its already-loaded MCP process; a fresh `@narada2/narada-proper-mcp` process exposes the new tool.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` passed: 27 tests.
- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- Fresh MCP `tools/list` via `node packages\narada-proper-mcp\dist\main.js` includes `agent_context_doctrinal_grounding`.
- Fresh MCP `tools/call` for `agent_context_doctrinal_grounding` with `mode: "reground"` and `doctrine_ids: ["docs_concepts_canonical_inbox"]` returned schema `narada.agent_context.doctrinal_grounding.v0`, status `success`, the requested filtered doctrine, posture summary, CCC coordinates, IAS mapping, and review protocol.
- `rg "narada_doctrine_grounding_refs|agent_context_doctrinal_grounding" packages/narada-proper-mcp docs .ai/do-not-open/tasks -n` shows the old command only in historical task text and a negative regression assertion.

## Acceptance Criteria

- [x] Narada proper MCP exposes `agent_context_doctrinal_grounding`.
- [x] `mode: "reground"` returns a bounded doctrine grounding packet with posture summary, doctrine catalog, CCC coordinates, IAS mapping, and review protocol.
- [x] Focused MCP tests cover default grounding and doctrine id filtering.
