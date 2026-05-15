---
status: opened
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Proposal handled: Add or expose a governed route/materialize/assign transition for MCP-admitted task rows, or document admission as intentionally inert until task materialization.
- [ ] Recommendation addressed or explicitly rejected: Route as lifecycle/work-next scheduler capability follow-up.
