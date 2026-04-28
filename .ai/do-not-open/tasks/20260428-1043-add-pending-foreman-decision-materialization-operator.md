---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T22:48:07.315Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented pending_approval proposed_action preservation plus approve-pending-decision materialization command, docs, help grouping, focused CLI tests, foreman regression test, typechecks, and pnpm verify.
closed_at: 2026-04-28T22:48:20.765Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add pending foreman decision materialization operator

## Chapter

control-plane-governance

## Goal

Provide a governed CLI path that lets an operator approve a pending_approval foreman decision and materialize its proposed outbound command or draft without bypassing Narada authority boundaries.

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

- [x] A sanctioned CLI command can inspect and approve a pending_approval foreman decision by decision id
- [x] The approval path validates the pending decision and proposed action before materializing an outbound command
- [x] The command is idempotent when the decision was already materialized
- [x] Docs or help make clear this is before approve-draft-for-send and does not send mail
- [x] Focused tests and pnpm verify pass
