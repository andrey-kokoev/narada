---
status: closed
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-15T16:12:22.501Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-15T19:28:14.717Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
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
- Preserved `site_task_lifecycle.admit_task` as an inert admission-row write and made that posture explicit in the MCP tool description and result packet.
- Added `site_task_lifecycle.materialize_task` to turn a previously admitted inert task row into a canonical governed Narada task through the local `task create` surface.
- Added optional `claim_for` support so the materialized task can be claimed through the governed task claim surface after creation.
- Kept MCP admission and materialization target-local: the MCP package shells out through the declared Narada CLI surface and does not own task lifecycle authority itself.
- Added test coverage that `tools/list` advertises both the inert admission contract and the materialization transition.

## Verification

- `pnpm --dir packages/narada-proper-mcp test` passed with 7 tests.
- `pnpm --dir packages/narada-proper-mcp typecheck` passed.
- `pnpm --dir packages/narada-proper-mcp build` passed.
- Temp-site MCP stdio smoke for `site_task_lifecycle.admit_task` followed by `site_task_lifecycle.materialize_task` passed: admission stayed inert, materialization returned `canonicalTaskMaterialized=true`, `workNextVisible=true`, and a canonical task file was created in the temp Site.

## Acceptance Criteria

- [x] Proposal handled: Add or expose a governed route/materialize/assign transition for MCP-admitted task rows, or document admission as intentionally inert until task materialization.
- [x] Recommendation addressed or explicitly rejected: Route as lifecycle/work-next scheduler capability follow-up.
