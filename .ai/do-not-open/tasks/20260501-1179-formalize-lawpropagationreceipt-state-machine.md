---
status: opened
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

- [ ] Law notices identify affected roles or agents and initial issued state.
- [ ] Agents can record seen, acknowledged, absorbed, or blocked with evidence.
- [ ] Expired or missing receipts escalate through a governed path.
- [ ] Duty-loop surfaces show pending law receipts before ordinary work where applicable.
- [ ] OSM, if used, only points to the durable law notice and receipt state.
