---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:44:38.713Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:44:39.071Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 807 — Extract principal attach and detach registration

## Goal

Move principal attach and detach command construction out of main.ts into the principal registrar.

## Context

Principal attachment transitions are part of the same runtime-authority command surface.

## Required Work

1. Move principal attach and principal detach Commander construction into the registrar.
2. Preserve arguments, options, defaults, formatter-backed human output, JSON output, and exit behavior.
3. Keep command names and descriptions unchanged.
4. Update main.ts to invoke only the registrar.

## Non-Goals

- Do not perform live principal attach/detach as verification.
- Do not change PrincipalRuntime transition law.
- Do not alter principal identity generation.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs principal attach or principal detach.
- [x] The registrar owns attach/detach registration.
- [x] Bounded help smoke checks confirm attach and detach remain available.
- [x] Typecheck/build succeeds.
