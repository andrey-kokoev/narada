---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:16:47.277Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:16:47.391Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 791 — Extract cleanup command registration

## Goal

Move cleanup command construction out of main.ts into a dedicated registrar while preserving bounded operator behavior.

## Context

Cleanup is an administrative operator; command registration should live beside the command implementation rather than inside the top-level CLI composition file.

## Required Work

1. Create a cleanup command registrar under packages/layers/cli/src/commands.
2. Move cleanup Commander construction from main.ts into that registrar.
3. Preserve dry-run, retention, scope, and output-format behavior exactly.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not change cleanup deletion semantics.
- Do not run destructive cleanup without dry-run.
- Do not touch unrelated commands.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs the cleanup command.
- [x] The new registrar owns cleanup command registration.
- [x] A bounded help or dry-run smoke check confirms cleanup remains available.
- [x] Typecheck/build succeeds.
