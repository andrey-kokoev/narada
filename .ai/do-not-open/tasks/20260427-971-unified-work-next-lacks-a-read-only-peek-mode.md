---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T13:54:56.019Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented unified work-next --peek. The command rejects --peek with execution flags, reports current task work before future claimable work, uses task peek-next for claimable task inspection, and calls inbox work-next without claim for inbox inspection. Focused tests cover task peek without claim, current-task precedence, inbox peek without claim, invalid flag combinations, and coherence scanner no longer reports missing peek. Live CLI returned current Task 971 and coherence scan returned zero findings after snapshot refresh; pnpm verify passed.
closed_at: 2026-04-27T13:54:59.360Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Unified work-next lacks a read-only peek mode

## Chapter

Canonical Inbox Promotions

## Goal

Promoted from inbox envelope env_4aa73794-308d-443f-967c-eb259f0ea7f6.

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

- [x] Inbox envelope env_4aa73794-308d-443f-967c-eb259f0ea7f6 has been handled.
