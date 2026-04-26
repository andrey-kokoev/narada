---
status: closed
depends_on: []
criteria_proved_by: architect
criteria_proved_at: 2026-04-26T22:45:52.388Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:45:52.807Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Task 894 — Tighten inbox promotion payload mapping

## Goal

Make envelope-to-task mapping explicit and less surprising.

## Context

<!-- Context placeholder -->

## Required Work

1. Centralize task promotion input derivation in a helper with deterministic precedence: CLI overrides, payload fields, targetRef, envelope fallback.
2. Allow acceptance criteria from payload or CLI without conflating scalar strings and arrays.
3. Keep non-task envelope kinds rejected for task enactment.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Task promotion derivation has one implementation shared by promote and task alias.
- [x] Tests prove override precedence.
- [x] Observation/proposal envelopes cannot be enacted as task.
