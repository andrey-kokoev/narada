---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:08:01.318Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:08:01.653Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 814 — Extract runtime core command registration

## Goal

Move sync, cycle, integrity, rebuild-views, and rebuild-projections command construction out of main.ts into a runtime core registrar.

## Context

These commands are core runtime/rebuild operators. main.ts should register this surface rather than own command wiring.

## Required Work

1. Create a runtime core command registrar under packages/layers/cli/src/commands.
2. Move sync, cycle, integrity, rebuild-views, and rebuild-projections Commander construction into the registrar.
3. Preserve options, defaults, command names, descriptions, output format handling, and wrapCommand behavior.
4. Update main.ts to invoke the registrar.

## Non-Goals

- Do not run sync, cycle, rebuild, or integrity as verification.
- Do not change runtime semantics.
- Do not change command names.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs sync, cycle, integrity, rebuild-views, or rebuild-projections.
- [x] The runtime core registrar owns those command registrations.
- [x] Bounded help smoke checks confirm representative commands remain available.
- [x] Typecheck/build succeeds.
