---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:35:12.108Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:35:12.490Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 887 — Define executable inbox promotion contract

## Goal

Replace metadata-only promotion ambiguity with a durable contract that distinguishes recorded promotion from enacted target-zone mutation.

## Context

<!-- Context placeholder -->

## Required Work

1. Define an InboxPromotionResult shape that records target kind, target ref, promoted principal, enactment status, and optional target command/result metadata.
2. Constrain supported executable targets for this chapter to archive and task creation so the crossing is concrete and bounded.
3. Reject or return a pending result for unsupported target kinds without pretending enactment occurred.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Promotion result semantics are represented in code and exported where CLI code can consume them.
- [x] Unsupported promotion targets cannot be reported as enacted.
- [x] Existing metadata-only promotion compatibility is preserved for already-promoted envelopes.
