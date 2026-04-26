---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:54:53.753Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:54:54.141Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 897 — Correct task claim roster semantics

## Goal

Remove the stale claim/roster asymmetry by making the documented contract match the implemented command behavior and covering it with tests.

## Context

<!-- Context placeholder -->

## Required Work

1. Verify task claim updates roster through the sanctioned claim service.
2. Update AGENTS/task assignment semantics so task claim is documented as mutating roster to working.
3. Add or tighten focused tests proving task claim updates roster and rejects unknown agents through roster authority.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs no longer say task claim is lifecycle-only.
- [x] A focused test proves task claim sets the claiming agent to working on the claimed task.
- [x] Unknown-agent claim behavior remains explicit.
