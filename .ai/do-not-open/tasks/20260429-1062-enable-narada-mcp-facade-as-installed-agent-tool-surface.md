---
status: opened
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

- [ ] narada-mcp is shell-exposed like narada or the canonical repo-local launch path is enforced by generated config
- [ ] A concrete MCP client configuration snippet or generated config path exists for this environment
- [ ] A fresh agent can discover narada_inbox_submit_observation through MCP tool discovery rather than shell probing
- [ ] The configured MCP surface preserves facade-only authority and inert inbox submission semantics
- [ ] Verification proves tools/list returns inbox tools through the configured path
