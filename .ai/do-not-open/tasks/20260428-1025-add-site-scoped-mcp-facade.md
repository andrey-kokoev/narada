---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T04:20:18.416Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by focused MCP tests, CLI typecheck/build, stdio JSON-RPC smoke check, documentation update, and pnpm verify recorded in WorkResultReport wrr_a748be2b_20260428-1025-add-site-scoped-mcp-facade_architect.
closed_at: 2026-04-28T04:20:23.958Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add Site-scoped MCP facade

## Chapter

Site-Scoped MCP Materialization

## Goal

Every Narada Site can expose a Site-local MCP facade over declared canonical tools without becoming a second authority surface.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] MCP server accepts explicit Site root context and defaults tool calls to that Site
- [x] MCP initialize and tool inspection expose Site identity and authority posture
- [x] At least one read-only Site context MCP tool is available
- [x] Existing inbox MCP tools remain canonical command/service delegates and are scoped by Site context
- [x] Documentation explains Site-scoped MCP as facade
- [x] not authority
- [x] Focused tests cover initialization
- [x] Site context
- [x] and scoped inbox behavior
