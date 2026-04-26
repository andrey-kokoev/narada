---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T02:11:41.141Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T02:11:41.276Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 776 — Extract task roster command registration

## Goal

Move task roster CLI registration out of main.ts into a dedicated registration module while preserving command behavior and shared output admission.

## Context

Earlier chapters extracted task authoring and lifecycle registrations. The roster subcommands still live directly in main.ts, making the task command surface mixed and harder to audit.

## Required Work

1. Create a dedicated task roster registration module under packages/layers/cli/src/commands/.
2. Move roster show, assign, review, done, and idle registration into that module.
3. Use directCommandAction or the shared direct command wrapper consistently; do not introduce bespoke console or process.exit handling.
4. Update main.ts to register roster commands through the new module.
5. Preserve command names, options, defaults, and output formats.

## Non-Goals

- Do not change roster authority semantics.
- Do not rename roster commands or flags.
- Do not migrate additional storage in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the task roster subcommand tree.
- [x] roster commands still emit through emitCommandResult and shared command wrapper semantics.
- [x] Focused roster-related tests or command wrapper tests pass.
- [x] CLI typecheck passes.
