---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T12:52:26.720Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented automatic inbox refresh from exported envelope artifacts in read/work surfaces. work-next/list/next/show refresh local ignored SQLite from .ai/inbox-envelopes before reading; import shares the same idempotent helper; doctor reports refresh counts. Regression covers work-next seeing an exported artifact without explicit import. Live check deleted local inbox DB, rebuilt CLI, and work-next saw env_abd1f7d2. pnpm verify passed.
closed_at: 2026-04-27T12:52:31.014Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Auto-refresh inbox read path from exported envelopes

## Goal

Remove the operator friction where exported inbox messages on main are invisible until someone remembers to run inbox import manually. Inbox read/work commands should refresh the ignored local DB from append-only exported envelope artifacts before inspecting work.

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

- [x] inbox read surfaces import exported artifacts before selecting messages
- [x] refresh is idempotent and does not duplicate existing envelopes
- [x] work-next sees newly pulled exported envelopes without explicit inbox import
- [x] doctor reports exported artifact count and refresh posture
- [x] focused tests cover work-next auto-refresh from exported artifacts
