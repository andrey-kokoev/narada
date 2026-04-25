---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:01:34.410Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:01:36.288Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 705 — Remove stale dist as preferred dev executable surface

## Goal

Development shell execution should not prefer compiled dist as a second authority surface.

## Context

The shim blocks stale dist, but dist remains the preferred shell execution target.

## Required Work

1. Add an explicit dev-mode shim path that runs source through the sanctioned package runner or auto-builds only under explicit opt-in.
2. Keep production dist execution available.
3. Document the distinction.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Operator can install a dev shim or opt into auto-build behavior explicitly.
- [x] Default production shim remains safe.
- [x] Stale dist cannot silently execute.


