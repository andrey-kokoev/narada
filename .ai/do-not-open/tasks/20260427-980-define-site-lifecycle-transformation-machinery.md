---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:43:01.263Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:43:01.703Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Define Site lifecycle transformation machinery

## Chapter

site-lifecycle

## Goal

Make Site lifecycle transformations a governed Narada concept and operator surface: clone, fork, split, absorb, migrate, re-instantiate, and archive must preserve authority, provenance, trace, and re-instantiation semantics rather than being raw folder operations.

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

- [x] Narada doctrine defines Site lifecycle transformations and their authority/provenance rules;Operator-facing documentation distinguishes Site clone/fork/split/absorb/migrate/re-instantiate/archive from raw filesystem copy;CLI exposes an inspection/preflight surface for Site lifecycle transformation kinds without performing unsafe mutation;The source inbox envelope is handled through a governed pending or archive action;Focused tests cover the new inspection/preflight surface;pnpm verify passes
