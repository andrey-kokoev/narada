---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:59:37.221Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:59:37.879Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 810 — Extract task advisory and lint registration

## Goal

Move task recommend, derive-from-finding, and lint command construction out of main.ts into a dedicated task operations registrar.

## Context

Task advisory and structural inspection commands are still inline in main.ts. They should be owned by a task operations registrar alongside the existing task sub-surface registrars.

## Required Work

1. Create a task operations registrar under packages/layers/cli/src/commands.
2. Move task recommend, derive-from-finding, and lint Commander construction into that registrar.
3. Preserve arguments, options, defaults, format behavior, output emission, and exit behavior.
4. Update main.ts to invoke the registrar.

## Non-Goals

- Do not change recommender scoring.
- Do not derive real tasks during verification.
- Do not change lint rules.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs task recommend, derive-from-finding, or lint.
- [x] The registrar owns advisory/lint registration.
- [x] Bounded help smoke checks confirm commands remain available.
- [x] Typecheck/build succeeds.
