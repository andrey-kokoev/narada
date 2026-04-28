---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T00:54:37.624Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-28T00:54:38.179Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Implement Narada MCP facade v0

## Chapter

Narada MCP Facade

## Goal

Expose a bounded MCP stdio facade over existing Narada application services without creating a second authority implementation.

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

- [x] A narada-mcp executable is available from the CLI package.
- [x] The MCP server supports initialize
- [x] tools/list
- [x] and tools/call over stdio JSON-RPC.
- [x] MCP tools expose low-risk/read-oriented Narada operations and inbox submit-observation with read-back confirmation.
- [x] MCP tool implementations delegate to existing Narada command functions and preserve canonical mutation evidence for mutations.
- [x] Docs explain MCP as a typed authority-preserving facade
- [x] not an alternate source of truth.
- [x] Focused tests cover initialize
- [x] tools/list
- [x] inbox work-next
- [x] and inbox submit-observation evidence behavior.
