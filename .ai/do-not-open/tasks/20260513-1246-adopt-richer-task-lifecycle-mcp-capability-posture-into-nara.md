---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T01:41:11.948Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T01:41:12.579Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Adopt richer task-lifecycle MCP capability posture into Narada proper Site

## Chapter

narada-proper-site-capability-adoption

## Goal

Represent richer task-lifecycle MCP as a Narada proper Site capability posture without overclaiming unimplemented live tools.

## Context

Residual from .narada/capabilities/missing-capabilities.md: richer task lifecycle MCP beyond plan_init/admit_task/read_task.

## Required Work

Create or update .narada Site capability evidence so claim/finish/review/close/work-next/list/query/richer transitions are classified as descriptor/planned or blocked unless actually exposed; preserve the first-slice live claim only for plan_init/admit_task/read_task.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Capability record distinguishes live first slice from non-live richer lifecycle tools
- [x] Missing-capabilities is reconciled without overclaiming live exposure
- [x] Audit/ledger evidence records non-import posture
