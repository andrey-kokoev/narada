---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:19:11.133Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:19:11.647Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 820 — Normalize remaining ad hoc registrar output cases

## Goal

Apply shared output discipline where safe to product utility, workbench diagnose, and task search while preserving long-lived serve command exceptions.

## Context

Some registrars still print directly for finite command results. Serve commands can remain explicit process surfaces, but finite results should use shared output helpers.

## Required Work

1. Normalize product-utility finite JSON output handling where safe.
2. Normalize workbench diagnose finite output handling where safe.
3. Normalize task search finite output handling where safe.
4. Leave long-lived serve commands as explicit documented exceptions.

## Non-Goals

- Do not start serve commands.
- Do not change USC validation semantics.
- Do not change task search result shape.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Finite command result emission is more consistently routed through shared helpers.
- [x] Serve commands retain existing listening URL and SIGINT behavior.
- [x] Bounded help smoke checks confirm representative commands remain available.
- [x] Typecheck/build succeeds.
