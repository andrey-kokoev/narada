---
status: in_review
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-15T16:12:22.501Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
---

# MCP task admission remains inert for Builder claimability

## Chapter

Canonical Inbox Promotions

## Goal

MCP site_task_lifecycle.admit_task is still an inert admission surface; claimability currently requires governed task materialization.

## Context

Source inbox envelope: env_4130c458-de50-4256-9067-b3bce0cec1bb

Source: agent_report:codex_session:2026-05-15:mcp-task-admission-inert-claimability

Envelope kind: observation

Summary: MCP site_task_lifecycle.admit_task is still an inert admission surface; claimability currently requires governed task materialization.

Evidence:
- Task 1273 materialized MCP-admitted carrier rows into canonical tasks 1275 and 1276 through governed task create surfaces before Builder peek-next could see them.

Proposal:
- Add or expose a governed route/materialize/assign transition for MCP-admitted task rows, or document admission as intentionally inert until task materialization.

Recommendation: Route as lifecycle/work-next scheduler capability follow-up.

## Required Work

0. Source summary: MCP site_task_lifecycle.admit_task is still an inert admission surface; claimability currently requires governed task materialization.
1. Read source inbox envelope env_4130c458-de50-4256-9067-b3bce0cec1bb and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Claimed task for `narada.builder` through `task work-next`.
- Chose the bounded documentation/contract path from the proposal rather than building a new materialization pipeline in this slice.
- Updated `packages/narada-proper-mcp/src/server.ts` so `site_task_lifecycle.admit_task` is described as an inert admission-row write and returns explicit `canonicalTaskMaterialized: false`, `workNextClaimable: false`, and materialization guidance.
- Updated `.narada/capabilities/mcp-surfaces.json` and `.narada/tasks/task-0005-mutating-task-lifecycle-mcp-admission.md` to record the same posture.
- Added test coverage that `tools/list` advertises the inert/non-materializing contract.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` passed.
- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `node --test tools/agent-start/start-agent.test.mjs` passed before this slice and was not affected by the task-admission wording change.

## Acceptance Criteria

- [x] Proposal handled: Add or expose a governed route/materialize/assign transition for MCP-admitted task rows, or document admission as intentionally inert until task materialization.
- [x] Recommendation addressed or explicitly rejected: Route as lifecycle/work-next scheduler capability follow-up.
