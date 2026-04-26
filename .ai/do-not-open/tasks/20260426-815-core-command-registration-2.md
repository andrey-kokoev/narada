---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:08:15.357Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:08:15.830Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 815 — Extract init, demo, and ops command registration

## Goal

Move init, init usc, init usc-validate, demo, and ops command construction out of main.ts into a product utility registrar.

## Context

Initialization/demo/operator dashboard commands are product utility surfaces and should have a registrar owner.

## Required Work

1. Create a product utility command registrar under packages/layers/cli/src/commands.
2. Move init, init usc, init usc-validate, demo, and ops Commander construction into the registrar.
3. Preserve custom USC error/output handling, interactive init behavior, options, defaults, and wrapCommand behavior.
4. Update main.ts to invoke the registrar.

## Non-Goals

- Do not initialize real repos during verification.
- Do not run demo generation during verification.
- Do not change USC semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs init, init usc, init usc-validate, demo, or ops.
- [x] The product utility registrar owns those command registrations.
- [x] Bounded help smoke checks confirm representative commands remain available.
- [x] Typecheck/build succeeds.
