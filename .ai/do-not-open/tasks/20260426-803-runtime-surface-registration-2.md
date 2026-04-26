---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:37:54.245Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:37:54.747Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 803 — Extract console command registration

## Goal

Move the console command group out of main.ts into a dedicated registrar while preserving cross-Site control behavior.

## Context

Operator console commands are one runtime/operator control surface. Their registration should not remain inline in main.ts.

## Required Work

1. Create a console command registrar under packages/layers/cli/src/commands.
2. Move console status, attention, approve, reject, retry, and serve Commander construction into that registrar.
3. Preserve server start behavior, SIGINT shutdown handling, options, defaults, and output behavior.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not start the console server during verification.
- Do not approve, reject, or retry real outbound/work items.
- Do not change console API behavior.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the console command group.
- [x] The console registrar owns all console subcommand registration.
- [x] Bounded help smoke checks confirm console commands remain available.
- [x] Typecheck/build succeeds.
