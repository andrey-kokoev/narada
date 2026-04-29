---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T01:03:23.451Z
criteria_proof_verification:
  state: unbound
  rationale: MCP client configuration and shell exposure are environment-specific integration surfaces; verification used direct tools/list probing through narada-mcp and the generated Narada proper config path.
closed_at: 2026-04-29T01:03:28.483Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Enable Narada MCP facade as installed agent tool surface

## Chapter

MCP Inbox Tool Surface Ergonomics

## Goal

Make the implemented Narada MCP facade actually available to fresh agent sessions through shell exposure and MCP client configuration, not only as a repo-local binary.

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

- [x] narada-mcp is shell-exposed like narada or the canonical repo-local launch path is enforced by generated config
- [x] A concrete MCP client configuration snippet or generated config path exists for this environment
- [x] A fresh agent can discover narada_inbox_submit_observation through MCP tool discovery rather than shell probing
- [x] The configured MCP surface preserves facade-only authority and inert inbox submission semantics
- [x] Verification proves tools/list returns inbox tools through the configured path
