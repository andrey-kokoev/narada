---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:22:33.924Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:22:34.341Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 794 — Extract draft action command registration

## Goal

Move reject-draft, mark-reviewed, and handled-externally command construction out of main.ts into a dedicated outbound action registrar.

## Context

Outbound review actions are one operator-action family and should have a single registration owner instead of being embedded in top-level CLI composition.

## Required Work

1. Create an outbound action command registrar under packages/layers/cli/src/commands.
2. Move reject-draft, mark-reviewed, and handled-externally Commander construction into that registrar.
3. Preserve arguments, options, defaults, command descriptions, and wrapCommand behavior.
4. Update main.ts to import and invoke the registrar only for these actions.

## Non-Goals

- Do not change outbound state-machine semantics.
- Do not execute live mailbox mutations.
- Do not normalize unrelated command families.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs reject-draft, mark-reviewed, or handled-externally.
- [x] The new registrar owns those command registrations.
- [x] Bounded help smoke checks confirm each command remains available.
- [x] Typecheck/build succeeds.
