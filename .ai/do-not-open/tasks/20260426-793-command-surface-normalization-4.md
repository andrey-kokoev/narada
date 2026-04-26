---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:16:47.337Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:16:47.440Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 793 — Extract crossing command registration

## Goal

Move crossing command registration out of main.ts into a dedicated registrar and preserve crossing inspection as a bounded read-only surface.

## Context

Crossing regime inspection is a semantic inspection surface. It should not remain embedded in top-level CLI construction.

## Required Work

1. Create a crossing command registrar under packages/layers/cli/src/commands.
2. Move crossing list and crossing show Commander construction from main.ts into that registrar.
3. Preserve default output, JSON output, text output, filters, and error handling.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not change crossing regime inventory contents.
- Do not broaden crossing list output by default.
- Do not alter crossing semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs crossing list or crossing show commands.
- [x] The new registrar owns crossing command registration.
- [x] Bounded smoke checks confirm crossing list and crossing show remain available.
- [x] Typecheck/build succeeds.
