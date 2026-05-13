---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T00:29:08.301Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T00:29:08.821Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Reconcile MCP surfaces native shell policy projection

## Chapter

Doctrine Review

## Goal

Reconcile .narada/capabilities/mcp-surfaces.json native shell policy with .narada/site.json denied-by-default agent execution policy.

## Context

Derived from task 1241 .narada Site doctrinal review finding P1 in .narada/audit/task-1241-site-doctrinal-review.md. The Site authority seed records native shell denied by default with break-glass exception, while mcp-surfaces.json still says native_shell_policy is unknown_until_admitted.

## Required Work

1. Update mcp-surfaces.json to project native shell policy from .narada/site.json. 2. Preserve current admitted MCP surface/tool records. 3. Validate JSON and record verification. 4. Do not grant native shell, raw WSL crossing, PC-locus mutation, operator-surface runtime copying, or secrets access.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] mcp-surfaces.json no longer reports native_shell_policy unknown when .narada/site.json denies native shell by default.
- [x] Admitted task lifecycle MCP live tool list is preserved.
- [x] No new live capability grant is introduced.
