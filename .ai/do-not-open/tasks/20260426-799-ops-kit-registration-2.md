---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:29:57.543Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:29:57.650Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 799 — Extract operation setup and inspection command registration

## Goal

Move setup, preflight, and inspect command construction out of main.ts into the ops-kit registrar.

## Context

Setup and inspection are part of the same product/bootstrap surface and should have one command registration owner.

## Required Work

1. Move setup, preflight, and inspect Commander construction into the ops-kit registrar.
2. Preserve arguments, options, defaults, and ops-kit function calls.
3. Return structured command results with formatted human output.
4. Update main.ts to invoke only the registrar.

## Non-Goals

- Do not run setup against a real target during verification.
- Do not alter preflight readiness rules.
- Do not change operation configuration schema.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs setup, preflight, or inspect.
- [x] The registrar owns setup and inspection command registration.
- [x] Bounded help smoke checks confirm representative setup/inspection commands remain available.
- [x] Typecheck/build succeeds.
