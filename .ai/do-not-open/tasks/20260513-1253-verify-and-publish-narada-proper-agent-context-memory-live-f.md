---
status: closed
depends_on: [1252]
amended_by: narada.architect
amended_at: 2026-05-13T01:58:36.033Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T02:01:10.336Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T02:01:10.872Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Verify and publish Narada proper agent-context memory live first slice

## Chapter

narada-proper-agent-context-memory-live-adoption

## Goal

Smoke test the live MCP first slice and update Narada proper Site capability/audit evidence.

## Context

Depends on MCP implementation. Terminal claim should remain bounded: local checkpoint record/readback and descriptor hydration planning only.

## Required Work

Run package/CLI verification and live narada-mcp smoke calls; update .narada/capabilities/mcp-surfaces.json and agent-context-memory-mcp.json from candidate to admitted first slice; record audit and ledger evidence; do not claim runtime hydration execution.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by narada.architect at 2026-05-13T01:58:36.033Z: dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Smoke evidence proves tools/list and at least one tools/call for each first-slice tool
- [x] Capability registry distinguishes live first slice from non-admitted runtime hydration
- [x] Worktree is committed and clean
