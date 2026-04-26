---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:22:56.090Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:22:56.227Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 796 — Extract send approval and retry command registration

## Goal

Move approve-draft-for-send and retry-auth-failed command construction out of main.ts into the outbound action registrar.

## Context

Approval and retry are outbound command progression operators. Their registration should live with the outbound action family.

## Required Work

1. Move approve-draft-for-send and retry-auth-failed Commander construction into the outbound action registrar.
2. Preserve argument handling, limit parsing, options, defaults, and output format propagation.
3. Update main.ts so it only invokes the registrar.

## Non-Goals

- Do not approve or retry real outbound commands during verification.
- Do not change auth failure recovery semantics.
- Do not change send worker behavior.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs approve-draft-for-send or retry-auth-failed.
- [x] The registrar owns send approval and auth retry registration.
- [x] Bounded help smoke checks confirm both commands remain available.
- [x] Typecheck/build succeeds.
