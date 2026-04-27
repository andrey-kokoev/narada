---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:58:38.364Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:58:38.905Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Define User Site awareness registry

## Chapter

site-lifecycle

## Goal

Define the User Site as the user-locus awareness and coordination registry for known Narada Sites while preserving the distinction between awareness, proposal routing, subscription, and mutation authority.

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

- [x] Narada docs define User Site awareness registry semantics;The registry field model distinguishes identity
- [x] locus type
- [x] roots
- [x] authority boundaries
- [x] sync posture
- [x] capabilities
- [x] inbox/subscription endpoints
- [x] lineage
- [x] freshness
- [x] and health;Docs state that User Site awareness does not imply mutation authority over linked Sites;The source inbox envelope is handled through a governed pending or archive action;pnpm verify passes
