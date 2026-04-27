---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T21:07:43.867Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T21:07:44.472Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Define Site pubsub signal exchange doctrine

## Chapter

site-lifecycle

## Goal

Define Site pub/sub as typed signal exchange with governed local admission, preserving the distinction between publication, subscription, influence, and mutation authority.

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

- [x] Docs define Site pub/sub signal exchange semantics;Docs state subscriptions deliver inert signals into governed admission rather than mutating local Site state;Docs connect pub/sub to canonical inbox
- [x] lineage
- [x] User Site awareness
- [x] and governed locus federation;The source inbox envelope is handled through a governed pending or archive action;pnpm verify passes
