---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T04:06:51.885Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777608374093_6otsnj
closed_at: 2026-05-01T04:07:16.720Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Formalize LawPropagationReceipt state machine

## Chapter

state-machine-formalization

## Goal

Make law changes propagate through explicit receipt and absorption states for affected agents.

## Context

This task formalizes the capability commissioned by task 1168 so law changes are not merely observations or chat messages.

## Required Work

Define LawPropagationReceipt states and transitions; integrate issued, seen, acknowledged, absorbed, blocked, expired, and escalated into law notice, role duty-loop, and agent receipt surfaces; add tests and docs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Law notices identify affected roles or agents and initial issued state.
- [x] Agents can record seen, acknowledged, absorbed, or blocked with evidence.
- [x] Expired or missing receipts escalate through a governed path.
- [x] Duty-loop surfaces show pending law receipts before ordinary work where applicable.
- [x] OSM, if used, only points to the durable law notice and receipt state.
