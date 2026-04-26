---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:09:02.187Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:09:02.287Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 788 — Extract command-run command registration

## Goal

Move Command Execution Intent Zone CLI registration out of main.ts into a dedicated registrar using shared command output admission.

## Context

CEIZ is a core governed command boundary. Its CLI registration currently uses manual TTY/JSON printing and process exits in main.ts.

## Required Work

1. Create a dedicated command-run registration module under packages/layers/cli/src/commands/.
2. Move command-run run, inspect, and list registration into that module.
3. Use directCommandAction plus emitCommandResult.
4. Preserve command names, flags, defaults, output profile behavior, and bounded-output posture.
5. Update main.ts to call the new registrar.

## Non-Goals

- Do not run arbitrary non-diagnostic commands.
- Do not relax CEIZ output admission.
- Do not change command-run persistence semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the command-run subcommand tree.
- [x] command-run commands no longer manually branch on TTY/JSON in main.ts.
- [x] Safe command-run list smoke check passes.
- [x] CLI typecheck and build pass.
