---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:30:11.368Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:30:11.492Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 800 — Extract operation explain and activation command registration

## Goal

Move explain and activate command construction out of main.ts into the ops-kit registrar while preserving activation failure handling.

## Context

Explain and activate are product/bootstrap lifecycle operators. They should not print directly from main.ts.

## Required Work

1. Move explain and activate Commander construction into the ops-kit registrar.
2. Preserve activation failure exit behavior and success messaging.
3. Return structured command results with formatted human output for success and failure paths.
4. Do not perform live activation during smoke checks.

## Non-Goals

- Do not change activation semantics.
- Do not start daemons or send mail.
- Do not rename operation-facing language.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs explain or activate.
- [x] Activation failure still exits non-zero.
- [x] Bounded help smoke checks confirm explain and activate remain available.
- [x] Typecheck/build succeeds.
