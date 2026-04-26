---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:16:47.280Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:16:47.394Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 792 — Extract re-derivation and recovery command registration

## Goal

Move derive-work, preview-work, confirm-replay, and recover command construction out of main.ts into a dedicated registrar while preserving the recovery/derivation authority distinction.

## Context

Re-derivation operators have a coherent semantic family in SEMANTICS and AGENTS guidance. Their CLI registration should be grouped mechanically.

## Required Work

1. Create a re-derivation/recovery command registrar under packages/layers/cli/src/commands.
2. Move derive-work, preview-work, confirm-replay, and recover Commander construction from main.ts into that registrar.
3. Preserve all command options, defaults, action handlers, and existing formatter/exit behavior.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not merge recover and derive-work semantics.
- Do not perform live recovery or replay mutation as verification.
- Do not change recovery data model.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs derive-work, preview-work, confirm-replay, or recover commands.
- [x] The new registrar owns the re-derivation/recovery command family.
- [x] Bounded help or dry-run smoke checks confirm commands remain available.
- [x] Typecheck/build succeeds.
