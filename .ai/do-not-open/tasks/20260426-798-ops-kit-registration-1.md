---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:29:44.117Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:29:44.248Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 798 — Extract operation declaration command registration

## Goal

Move init-repo, want-mailbox, want-workflow, and want-posture command construction out of main.ts into an ops-kit registrar.

## Context

Operation shaping is a coherent product/bootstrap command surface. main.ts should register it, not implement its formatting or action wiring.

## Required Work

1. Create an ops-kit command registrar under packages/layers/cli/src/commands.
2. Move init-repo, want-mailbox, want-workflow, and want-posture Commander construction into the registrar.
3. Preserve all arguments, options, defaults, descriptions, and ops-kit function calls.
4. Return structured command results with formatted human output instead of printing directly from main.ts.

## Non-Goals

- Do not change ops-kit persistence semantics.
- Do not create real operation repos during smoke checks.
- Do not rename user-facing commands.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs init-repo, want-mailbox, want-workflow, or want-posture.
- [x] The registrar owns operation declaration command registration.
- [x] Bounded help smoke checks confirm representative declaration commands remain available.
- [x] Typecheck/build succeeds.
