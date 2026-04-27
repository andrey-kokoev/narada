---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:49:27.679Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:49:28.226Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Define Site provenance lineage construct

## Chapter

site-lifecycle

## Goal

De-arbitrarize the Site provenance lineage construct required by Site lifecycle transformations and pub/sub influence, separating lineage, authority transfer, subscription influence, and re-instantiation evidence before implementation.

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

- [x] Narada doctrine defines Site provenance lineage and distinguishes event log
- [x] projection
- [x] chain
- [x] DAG
- [x] and graph readings;Site lifecycle docs identify lineage events and required evidence fields;Site pub/sub or influence edges are explicitly distinguished from mutation-authority edges;CLI inspection/preflight exposes the lineage event vocabulary without mutating Site state;Focused tests cover the lineage inspection surface;The source inbox envelope is handled through a governed pending or archive action;pnpm verify passes
