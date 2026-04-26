---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:44:28.247Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:44:28.709Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 806 — Extract principal status and list registration

## Goal

Move principal status and list command construction out of main.ts into a dedicated registrar.

## Context

Principal runtime state is one runtime-authority surface. main.ts should register that surface, not own each subcommand.

## Required Work

1. Create a principal command registrar under packages/layers/cli/src/commands.
2. Move principal status and principal list Commander construction into that registrar.
3. Preserve options, defaults, command descriptions, formatter-backed human output, JSON output, and exit behavior.
4. Update main.ts to invoke the registrar.

## Non-Goals

- Do not change PrincipalRuntime data semantics.
- Do not migrate principal storage.
- Do not extract unrelated command groups.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs principal status or principal list.
- [x] The registrar owns status/list registration.
- [x] Bounded help smoke checks confirm principal status and list remain available.
- [x] Typecheck/build succeeds.
