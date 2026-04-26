---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:08:50.022Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:08:50.142Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 787 — Extract verify command registration

## Goal

Move diagnostic verify CLI registration out of main.ts into a dedicated registrar using shared command output admission.

## Context

The verify surface is diagnostic and TIZ-adjacent, but it still lives directly in main.ts with manual JSON/error handling.

## Required Work

1. Create a dedicated verify registration module under packages/layers/cli/src/commands/.
2. Move verify status, suggest, explain, and run registration into that module.
3. Use shared direct command action/output admission consistently.
4. Preserve command names, flags, defaults, and diagnostic/non-canonical wording.
5. Update main.ts to call the new registrar.

## Non-Goals

- Do not make verify canonical task verification.
- Do not change verification policy semantics.
- Do not run unbounded/full test suites.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the verify subcommand tree.
- [x] verify commands no longer manually stringify or exit in main.ts.
- [x] CLI typecheck passes.
- [x] Safe verify smoke checks pass.
